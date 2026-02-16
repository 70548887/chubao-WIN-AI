#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use serde_json::Value;
use std::collections::VecDeque;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::State;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Windows CREATE_NO_WINDOW flag – prevents visible CMD/PowerShell popups.
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const LOG_CAPACITY: usize = 500;
const SUPERVISOR_INTERVAL: Duration = Duration::from_secs(2);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthPayload {
    status: &'static str,
    app: &'static str,
    version: &'static str,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ServiceStatusPayload {
    name: String,
    running: bool,
    healthy: bool,
    managed: bool,
    pid: Option<u32>,
    port: u16,
    endpoint: String,
    last_error: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SidecarStatusPayload {
    node: ServiceStatusPayload,
    python: ServiceStatusPayload,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ServiceDiagnosticsPayload {
    status: ServiceStatusPayload,
    health: Option<Value>,
    health_error: Option<String>,
    port_inspection: PortInspectionPayload,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SidecarDiagnosticsPayload {
    node: ServiceDiagnosticsPayload,
    python: ServiceDiagnosticsPayload,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PortOccupantPayload {
    pid: u32,
    process_name: String,
    local_address: String,
    command_line: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PortInspectionPayload {
    service: String,
    port: u16,
    listening: bool,
    managed_pid: Option<u32>,
    has_conflict: bool,
    occupants: Vec<PortOccupantPayload>,
    inspected_at_ms: u128,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ServiceLogsPayload {
    service: String,
    lines: Vec<String>,
}

#[derive(Copy, Clone)]
enum ServiceKind {
    NodeBackend,
    PythonAutomation,
}

#[derive(Copy, Clone)]
enum ServiceTarget {
    Node,
    Python,
}

impl ServiceTarget {
    fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "node" | "node-backend" | "nodejs" => Some(Self::Node),
            "python" | "python-automation" => Some(Self::Python),
            _ => None,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Node => "node",
            Self::Python => "python",
        }
    }
}

struct ManagedService {
    name: &'static str,
    kind: ServiceKind,
    port: u16,
    workdir: PathBuf,
    child: Option<Child>,
    last_error: Option<String>,
    logs: Arc<Mutex<VecDeque<String>>>,
    restart_attempts: u32,
    last_start_attempt: Option<Instant>,
    observed_external: bool,
}

impl ManagedService {
    fn service_key(&self) -> &'static str {
        match self.kind {
            ServiceKind::NodeBackend => "node",
            ServiceKind::PythonAutomation => "python",
        }
    }

    fn new(name: &'static str, kind: ServiceKind, port: u16, workdir: PathBuf) -> Self {
        Self {
            name,
            kind,
            port,
            workdir,
            child: None,
            last_error: None,
            logs: Arc::new(Mutex::new(VecDeque::new())),
            restart_attempts: 0,
            last_start_attempt: None,
            observed_external: false,
        }
    }

    fn ensure_started(&mut self) {
        if self.is_running() {
            self.observed_external = false;
            return;
        }

        if http_health(self.port) {
            if !self.observed_external {
                self.append_log(format!(
                    "detected healthy external service on port {}, skip spawn",
                    self.port
                ));
            }
            self.observed_external = true;
            self.last_error = None;
            self.restart_attempts = 0;
            self.last_start_attempt = None;
            return;
        }
        self.observed_external = false;

        let delay = self.restart_backoff_delay();
        if let Some(last_attempt) = self.last_start_attempt {
            if last_attempt.elapsed() < delay {
                return;
            }
        }

        self.last_start_attempt = Some(Instant::now());

        if let Err(err) = self.start() {
            self.restart_attempts = self.restart_attempts.saturating_add(1);
            self.last_error = Some(err);
        } else {
            self.restart_attempts = 0;
        }
    }

    fn start(&mut self) -> Result<(), String> {
        if !self.workdir.exists() {
            let err = format!(
                "{} working directory does not exist: {}",
                self.name,
                self.workdir.display()
            );
            self.append_log(err.clone());
            return Err(err);
        }

        self.append_log(format!("starting service in {}", self.workdir.display()));

        let mut command = self.build_command();
        command
            .current_dir(&self.workdir)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = command
            .spawn()
            .map_err(|err| format!("failed to start {}: {}", self.name, err))?;

        if let Some(stdout) = child.stdout.take() {
            spawn_log_reader(stdout, self.logs.clone(), format!("{} stdout", self.name));
        }
        if let Some(stderr) = child.stderr.take() {
            spawn_log_reader(stderr, self.logs.clone(), format!("{} stderr", self.name));
        }

        let pid = child.id();
        self.child = Some(child);
        self.observed_external = false;
        self.last_error = None;
        self.append_log(format!("process started, pid={}", pid));

        if !wait_for_health(self.port, Duration::from_secs(15)) {
            let err = format!(
                "{} started but health check failed on port {}",
                self.name, self.port
            );
            self.last_error = Some(err.clone());
            self.append_log(err);
        } else {
            self.append_log(format!("health check passed on port {}", self.port));
        }

        Ok(())
    }

    fn build_command(&self) -> Command {
        // Check if bundled sidecar resources exist (production/installed mode)
        if let Some(resource_dir) = detect_resource_dir() {
            match self.kind {
                ServiceKind::NodeBackend => {
                    let node_exe = resource_dir
                        .join("node-sidecar")
                        .join("node.exe");
                    let backend_cjs = resource_dir
                        .join("node-sidecar")
                        .join("node-backend.cjs");
                    let mut cmd = Command::new(node_exe);
                    cmd.arg(backend_cjs);
                    // Set NODE_PATH so native modules resolve from the bundled node_modules
                    let node_modules = resource_dir.join("node-sidecar").join("node_modules");
                    cmd.env("NODE_PATH", &node_modules);
                    #[cfg(target_os = "windows")]
                    cmd.creation_flags(CREATE_NO_WINDOW);
                    return cmd;
                }
                ServiceKind::PythonAutomation => {
                    let py_exe = resource_dir
                        .join("python-sidecar")
                        .join("python-automation.exe");
                    let mut cmd = Command::new(py_exe);
                    #[cfg(target_os = "windows")]
                    cmd.creation_flags(CREATE_NO_WINDOW);
                    return cmd;
                }
            }
        }

        // Fallback: development mode (use npm/python from system PATH)
        match self.kind {
            ServiceKind::NodeBackend => {
                #[cfg(target_os = "windows")]
                {
                    let mut cmd = Command::new("cmd");
                    cmd.args(["/C", "npm", "run", "dev"]);
                    cmd.creation_flags(CREATE_NO_WINDOW);
                    cmd
                }
                #[cfg(not(target_os = "windows"))]
                {
                    let mut cmd = Command::new("npm");
                    cmd.args(["run", "dev"]);
                    cmd
                }
            }
            ServiceKind::PythonAutomation => {
                let mut cmd = Command::new("python");
                cmd.arg("main.py");
                #[cfg(target_os = "windows")]
                cmd.creation_flags(CREATE_NO_WINDOW);
                cmd
            }
        }
    }

    fn is_running(&mut self) -> bool {
        let Some(mut child) = self.child.take() else {
            return false;
        };

        match child.try_wait() {
            Ok(None) => {
                self.child = Some(child);
                true
            }
            Ok(Some(status)) => {
                let code = status
                    .code()
                    .map(|value| value.to_string())
                    .unwrap_or_else(|| "terminated by signal".to_string());
                let message = format!("{} process exited (code={})", self.name, code);
                self.last_error = Some(message.clone());
                self.append_log(message);
                false
            }
            Err(err) => {
                let message = format!("{} status check failed: {}", self.name, err);
                self.last_error = Some(message.clone());
                self.append_log(message);
                false
            }
        }
    }

    fn status(&mut self) -> ServiceStatusPayload {
        let managed = self.is_running();
        let healthy = http_health(self.port);
        let running = managed || healthy;
        let pid = if managed {
            self.child.as_ref().map(Child::id)
        } else {
            None
        };

        ServiceStatusPayload {
            name: self.name.to_string(),
            running,
            healthy,
            managed,
            pid,
            port: self.port,
            endpoint: format!("http://127.0.0.1:{}/health", self.port),
            last_error: self.last_error.clone(),
        }
    }

    fn restart(&mut self) -> Result<(), String> {
        if !self.is_running() && http_health(self.port) {
            let err = format!(
                "{} is healthy on port {} but managed externally; restart denied",
                self.name, self.port
            );
            self.last_error = Some(err.clone());
            self.append_log(err.clone());
            return Err(err);
        }

        self.append_log("restart requested".to_string());
        self.stop();
        self.last_start_attempt = Some(Instant::now());
        self.restart_attempts = 0;
        self.start()
    }

    fn logs(&self, limit: usize) -> Vec<String> {
        let take = limit.clamp(1, LOG_CAPACITY);
        match self.logs.lock() {
            Ok(lines) => {
                let start = lines.len().saturating_sub(take);
                lines.iter().skip(start).cloned().collect()
            }
            Err(_) => vec!["failed to read service logs: lock poisoned".to_string()],
        }
    }

    fn stop(&mut self) {
        self.append_log("stop requested".to_string());
        if let Some(mut child) = self.child.take() {
            let pid = child.id();
            #[cfg(target_os = "windows")]
            {
                let _ = Command::new("taskkill")
                    .args(["/PID", &pid.to_string(), "/T", "/F"])
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .creation_flags(CREATE_NO_WINDOW)
                    .status();
            }
            let _ = child.kill();
            let _ = child.wait();
            self.append_log(format!("process stopped, pid={}", pid));
        }
    }

    fn diagnostics(&mut self) -> ServiceDiagnosticsPayload {
        let status = self.status();
        let port_inspection = inspect_port(
            self.service_key(),
            status.port,
            status.pid,
            status.healthy,
        );
        match http_get_json(self.port, "/health") {
            Ok(health) => ServiceDiagnosticsPayload {
                status,
                health: Some(health),
                health_error: None,
                port_inspection,
            },
            Err(err) => ServiceDiagnosticsPayload {
                status,
                health: None,
                health_error: Some(err),
                port_inspection,
            },
        }
    }

    fn append_log(&self, message: String) {
        push_log_line(
            &self.logs,
            format!("[{}][{}] {}", now_millis(), self.name, message),
        );
    }

    fn restart_backoff_delay(&self) -> Duration {
        match self.restart_attempts {
            0 => Duration::from_millis(0),
            1 => Duration::from_secs(1),
            2 => Duration::from_secs(2),
            3 => Duration::from_secs(4),
            _ => Duration::from_secs(8),
        }
    }
}

struct SidecarManager {
    node: ManagedService,
    python: ManagedService,
}

impl SidecarManager {
    fn new(project_root: PathBuf) -> Self {
        let node_port = read_port("NODE_PORT", 3100);
        let python_port = read_port("PYTHON_PORT", 3200);

        let node = ManagedService::new(
            "Node.js Backend",
            ServiceKind::NodeBackend,
            node_port,
            project_root.join("sidecars").join("node-backend"),
        );

        let python = ManagedService::new(
            "Python Automation",
            ServiceKind::PythonAutomation,
            python_port,
            project_root.join("sidecars").join("python-automation"),
        );

        Self { node, python }
    }

    fn start_all(&mut self) {
        self.node.ensure_started();
        self.python.ensure_started();
    }

    fn snapshot_status(&mut self) -> SidecarStatusPayload {
        SidecarStatusPayload {
            node: self.node.status(),
            python: self.python.status(),
        }
    }

    fn ensure_and_status(&mut self) -> SidecarStatusPayload {
        self.start_all();
        self.snapshot_status()
    }

    fn diagnostics(&mut self) -> SidecarDiagnosticsPayload {
        SidecarDiagnosticsPayload {
            node: self.node.diagnostics(),
            python: self.python.diagnostics(),
        }
    }

    fn restart_service(&mut self, service: &str) -> Result<SidecarStatusPayload, String> {
        let target = ServiceTarget::parse(service)
            .ok_or_else(|| format!("unknown service: {}", service))?;

        match target {
            ServiceTarget::Node => self.node.restart()?,
            ServiceTarget::Python => self.python.restart()?,
        }

        Ok(self.snapshot_status())
    }

    fn service_logs(&self, service: &str, limit: usize) -> Result<ServiceLogsPayload, String> {
        let target = ServiceTarget::parse(service)
            .ok_or_else(|| format!("unknown service: {}", service))?;

        let lines = match target {
            ServiceTarget::Node => self.node.logs(limit),
            ServiceTarget::Python => self.python.logs(limit),
        };

        Ok(ServiceLogsPayload {
            service: target.as_str().to_string(),
            lines,
        })
    }

    fn inspect_service_port(&mut self, service: &str) -> Result<PortInspectionPayload, String> {
        let target = ServiceTarget::parse(service)
            .ok_or_else(|| format!("unknown service: {}", service))?;

        let inspection = match target {
            ServiceTarget::Node => {
                let status = self.node.status();
                inspect_port(
                    self.node.service_key(),
                    status.port,
                    status.pid,
                    status.healthy,
                )
            }
            ServiceTarget::Python => {
                let status = self.python.status();
                inspect_port(
                    self.python.service_key(),
                    status.port,
                    status.pid,
                    status.healthy,
                )
            }
        };

        Ok(inspection)
    }

    fn stop_all(&mut self) {
        self.node.stop();
        self.python.stop();
    }
}

struct AppState {
    sidecars: Arc<Mutex<SidecarManager>>,
    supervisor_stop: Arc<AtomicBool>,
}

impl Drop for AppState {
    fn drop(&mut self) {
        self.supervisor_stop.store(true, Ordering::Relaxed);
        if let Ok(mut manager) = self.sidecars.lock() {
            manager.stop_all();
        }
    }
}

fn read_port(key: &str, default_port: u16) -> u16 {
    std::env::var(key)
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(default_port)
}

fn detect_project_root() -> PathBuf {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or(manifest_dir)
}

/// Detect the resource directory for bundled sidecars.
/// In production (installed mode), the resource dir is next to the executable.
/// Returns None when running in development mode (sidecars directory exists at project root).
fn detect_resource_dir() -> Option<PathBuf> {
    let exe_path = std::env::current_exe().ok()?;
    let exe_dir = exe_path.parent()?;

    // Check for bundled resources next to the exe (production mode)
    let resource_dir = exe_dir.join("resources");
    if resource_dir.join("node-sidecar").join("node.exe").exists()
        || resource_dir
            .join("python-sidecar")
            .join("python-automation.exe")
            .exists()
    {
        return Some(resource_dir);
    }

    // Tauri resource path: _up_/resources/ on some setups
    let alt = exe_dir.join("_up_").join("resources");
    if alt.join("node-sidecar").join("node.exe").exists() {
        return Some(alt);
    }

    None
}

fn spawn_sidecar_supervisor(
    sidecars: Arc<Mutex<SidecarManager>>,
    supervisor_stop: Arc<AtomicBool>,
) {
    thread::spawn(move || {
        while !supervisor_stop.load(Ordering::Relaxed) {
            if let Ok(mut manager) = sidecars.lock() {
                manager.start_all();
            }
            thread::sleep(SUPERVISOR_INTERVAL);
        }
    });
}

fn wait_for_health(port: u16, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if http_health(port) {
            return true;
        }
        thread::sleep(Duration::from_millis(400));
    }
    false
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn inspect_port(
    service: &str,
    port: u16,
    managed_pid: Option<u32>,
    healthy: bool,
) -> PortInspectionPayload {
    let occupants = list_port_occupants(port);
    let listening = !occupants.is_empty();
    let has_conflict = match managed_pid {
        Some(pid) => occupants.iter().any(|item| item.pid != pid),
        None => !healthy && !occupants.is_empty(),
    };

    PortInspectionPayload {
        service: service.to_string(),
        port,
        listening,
        managed_pid,
        has_conflict,
        occupants,
        inspected_at_ms: now_millis(),
    }
}

fn list_port_occupants(port: u16) -> Vec<PortOccupantPayload> {
    #[cfg(target_os = "windows")]
    {
        let script = [
            format!("$port = {}", port),
            "$listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)".to_string(),
            "if ($listeners.Count -eq 0) { Write-Output '[]'; exit 0 }".to_string(),
            "$items = foreach ($listener in ($listeners | Sort-Object OwningProcess -Unique)) {".to_string(),
            "  $pid = $listener.OwningProcess".to_string(),
            "  $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue".to_string(),
            "  $cmd = ''".to_string(),
            "  try { $cmd = (Get-CimInstance Win32_Process -Filter \"ProcessId = $pid\" -ErrorAction SilentlyContinue).CommandLine } catch { $cmd = '' }".to_string(),
            "  [PSCustomObject]@{".to_string(),
            "    pid = $pid".to_string(),
            "    processName = if ($proc) { $proc.ProcessName } else { '' }".to_string(),
            "    localAddress = if ($listener.LocalAddress) { $listener.LocalAddress } else { '' }".to_string(),
            "    commandLine = if ($cmd) { $cmd } else { '' }".to_string(),
            "  }".to_string(),
            "}".to_string(),
            "$items | ConvertTo-Json -Compress".to_string(),
        ]
        .join("\n");

        let output = Command::new("powershell")
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                script.as_str(),
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .output();

        match output {
            Ok(result) if result.status.success() => parse_port_occupants_json(&result.stdout),
            _ => Vec::new(),
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = port;
        Vec::new()
    }
}

fn parse_port_occupants_json(raw: &[u8]) -> Vec<PortOccupantPayload> {
    let text = String::from_utf8_lossy(raw);
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    let value: Value = match serde_json::from_str(trimmed) {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };

    let entries = match value {
        Value::Array(items) => items,
        item => vec![item],
    };

    let mut occupants = Vec::new();
    for entry in entries {
        let pid = entry
            .get("pid")
            .and_then(Value::as_u64)
            .and_then(|value| u32::try_from(value).ok());
        let Some(pid) = pid else {
            continue;
        };

        let process_name = entry
            .get("processName")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let local_address = entry
            .get("localAddress")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let command_line = entry
            .get("commandLine")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();

        occupants.push(PortOccupantPayload {
            pid,
            process_name,
            local_address,
            command_line,
        });
    }

    occupants.sort_by_key(|item| item.pid);
    occupants
}

fn push_log_line(logs: &Arc<Mutex<VecDeque<String>>>, line: String) {
    if let Ok(mut lines) = logs.lock() {
        if lines.len() >= LOG_CAPACITY {
            let _ = lines.pop_front();
        }
        lines.push_back(line);
    }
}

fn spawn_log_reader<R>(reader: R, logs: Arc<Mutex<VecDeque<String>>>, stream_name: String)
where
    R: Read + Send + 'static,
{
    thread::spawn(move || {
        let mut buffered = BufReader::new(reader);
        let mut line = String::new();
        loop {
            line.clear();
            match buffered.read_line(&mut line) {
                Ok(0) => break,
                Ok(_) => {
                    let clean = line.trim_end_matches(&['\r', '\n'][..]).to_string();
                    if !clean.is_empty() {
                        push_log_line(
                            &logs,
                            format!("[{}][{}] {}", now_millis(), stream_name, clean),
                        );
                    }
                }
                Err(err) => {
                    push_log_line(
                        &logs,
                        format!(
                            "[{}][{}] log reader error: {}",
                            now_millis(),
                            stream_name,
                            err
                        ),
                    );
                    break;
                }
            }
        }
    });
}

fn http_health(port: u16) -> bool {
    match http_get_json(port, "/health") {
        Ok(value) => match value.get("status").and_then(Value::as_str) {
            Some("ok") | Some("degraded") => true,
            _ => false,
        },
        Err(_) => false,
    }
}

fn http_get_json(port: u16, path: &str) -> Result<Value, String> {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = match TcpStream::connect_timeout(&addr, Duration::from_millis(500)) {
        Ok(stream) => stream,
        Err(err) => return Err(format!("tcp connect failed: {}", err)),
    };

    let _ = stream.set_read_timeout(Some(Duration::from_millis(600)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(600)));

    let request = format!(
        "GET {} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
        path
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return Err("failed to write request".to_string());
    }

    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() {
        return Err("failed to read response".to_string());
    }

    let parts: Vec<&str> = response.splitn(2, "\r\n\r\n").collect();
    if parts.len() != 2 {
        return Err("invalid http response".to_string());
    }

    serde_json::from_str(parts[1]).map_err(|err| format!("json parse failed: {}", err))
}

#[tauri::command]
fn health() -> HealthPayload {
    HealthPayload {
        status: "ok",
        app: "chubao-win-ai",
        version: env!("CARGO_PKG_VERSION"),
    }
}

#[tauri::command]
fn sidecar_status(state: State<'_, AppState>) -> Result<SidecarStatusPayload, String> {
    let mut manager = state
        .sidecars
        .lock()
        .map_err(|_| "sidecar manager lock poisoned".to_string())?;
    Ok(manager.snapshot_status())
}

#[tauri::command]
fn ensure_sidecars(state: State<'_, AppState>) -> Result<SidecarStatusPayload, String> {
    let mut manager = state
        .sidecars
        .lock()
        .map_err(|_| "sidecar manager lock poisoned".to_string())?;
    Ok(manager.ensure_and_status())
}

#[tauri::command]
fn restart_sidecar(
    state: State<'_, AppState>,
    service: String,
) -> Result<SidecarStatusPayload, String> {
    let mut manager = state
        .sidecars
        .lock()
        .map_err(|_| "sidecar manager lock poisoned".to_string())?;
    manager.restart_service(&service)
}

#[tauri::command]
fn sidecar_logs(
    state: State<'_, AppState>,
    service: String,
    limit: Option<usize>,
) -> Result<ServiceLogsPayload, String> {
    let manager = state
        .sidecars
        .lock()
        .map_err(|_| "sidecar manager lock poisoned".to_string())?;
    let safe_limit = limit.unwrap_or(120).clamp(1, LOG_CAPACITY);
    manager.service_logs(&service, safe_limit)
}

#[tauri::command]
fn sidecar_diagnostics(state: State<'_, AppState>) -> Result<SidecarDiagnosticsPayload, String> {
    let mut manager = state
        .sidecars
        .lock()
        .map_err(|_| "sidecar manager lock poisoned".to_string())?;
    Ok(manager.diagnostics())
}

#[tauri::command]
fn sidecar_port_inspect(
    state: State<'_, AppState>,
    service: String,
) -> Result<PortInspectionPayload, String> {
    let mut manager = state
        .sidecars
        .lock()
        .map_err(|_| "sidecar manager lock poisoned".to_string())?;
    manager.inspect_service_port(&service)
}

fn main() {
    let sidecars = Arc::new(Mutex::new(SidecarManager::new(detect_project_root())));
    if let Ok(mut manager) = sidecars.lock() {
        manager.start_all();
    }

    let supervisor_stop = Arc::new(AtomicBool::new(false));
    spawn_sidecar_supervisor(sidecars.clone(), supervisor_stop.clone());

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            sidecars,
            supervisor_stop,
        })
        .invoke_handler(tauri::generate_handler![
            health,
            sidecar_status,
            ensure_sidecars,
            restart_sidecar,
            sidecar_logs,
            sidecar_diagnostics,
            sidecar_port_inspect
        ])
        .run(tauri::generate_context!())
        .expect("failed to run chubao tauri app");
}
