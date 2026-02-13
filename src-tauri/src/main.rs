#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::State;

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

#[derive(Copy, Clone)]
enum ServiceKind {
    NodeBackend,
    PythonAutomation,
}

struct ManagedService {
    name: &'static str,
    kind: ServiceKind,
    port: u16,
    workdir: PathBuf,
    child: Option<Child>,
    last_error: Option<String>,
}

impl ManagedService {
    fn new(name: &'static str, kind: ServiceKind, port: u16, workdir: PathBuf) -> Self {
        Self {
            name,
            kind,
            port,
            workdir,
            child: None,
            last_error: None,
        }
    }

    fn ensure_started(&mut self) {
        if self.is_running() {
            return;
        }

        if let Err(err) = self.start() {
            self.last_error = Some(err);
        }
    }

    fn start(&mut self) -> Result<(), String> {
        if !self.workdir.exists() {
            return Err(format!(
                "{} working directory does not exist: {}",
                self.name,
                self.workdir.display()
            ));
        }

        let mut command = self.build_command();
        command
            .current_dir(&self.workdir)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());

        let child = command
            .spawn()
            .map_err(|err| format!("failed to start {}: {}", self.name, err))?;

        self.child = Some(child);
        self.last_error = None;

        if !wait_for_health(self.port, Duration::from_secs(15)) {
            self.last_error = Some(format!(
                "{} started but health check failed on port {}",
                self.name, self.port
            ));
        }

        Ok(())
    }

    fn build_command(&self) -> Command {
        match self.kind {
            ServiceKind::NodeBackend => {
                #[cfg(target_os = "windows")]
                {
                    let mut cmd = Command::new("cmd");
                    cmd.args(["/C", "npm", "run", "dev"]);
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
                cmd
            }
        }
    }

    fn is_running(&mut self) -> bool {
        if let Some(child) = &mut self.child {
            match child.try_wait() {
                Ok(None) => true,
                Ok(Some(_)) => {
                    self.child = None;
                    false
                }
                Err(err) => {
                    self.last_error = Some(format!("{} status check failed: {}", self.name, err));
                    self.child = None;
                    false
                }
            }
        } else {
            false
        }
    }

    fn status(&mut self) -> ServiceStatusPayload {
        let running = self.is_running();
        let pid = self.child.as_ref().map(Child::id);
        let healthy = http_health(self.port);

        ServiceStatusPayload {
            name: self.name.to_string(),
            running,
            healthy,
            pid,
            port: self.port,
            endpoint: format!("http://127.0.0.1:{}/health", self.port),
            last_error: self.last_error.clone(),
        }
    }

    fn stop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
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

    fn status(&mut self) -> SidecarStatusPayload {
        SidecarStatusPayload {
            node: self.node.status(),
            python: self.python.status(),
        }
    }

    fn ensure_and_status(&mut self) -> SidecarStatusPayload {
        self.start_all();
        self.status()
    }

    fn stop_all(&mut self) {
        self.node.stop();
        self.python.stop();
    }
}

struct AppState {
    sidecars: Mutex<SidecarManager>,
}

impl Drop for AppState {
    fn drop(&mut self) {
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

fn http_health(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = match TcpStream::connect_timeout(&addr, Duration::from_millis(500)) {
        Ok(stream) => stream,
        Err(_) => return false,
    };

    let _ = stream.set_read_timeout(Some(Duration::from_millis(600)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(600)));

    let request = b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
    if stream.write_all(request).is_err() {
        return false;
    }

    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() {
        return false;
    }

    response.contains("\"status\":\"ok\"") || response.contains("\"status\": \"ok\"")
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
    Ok(manager.status())
}

#[tauri::command]
fn ensure_sidecars(state: State<'_, AppState>) -> Result<SidecarStatusPayload, String> {
    let mut manager = state
        .sidecars
        .lock()
        .map_err(|_| "sidecar manager lock poisoned".to_string())?;
    Ok(manager.ensure_and_status())
}

fn main() {
    let mut manager = SidecarManager::new(detect_project_root());
    manager.start_all();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            sidecars: Mutex::new(manager),
        })
        .invoke_handler(tauri::generate_handler![
            health,
            sidecar_status,
            ensure_sidecars
        ])
        .run(tauri::generate_context!())
        .expect("failed to run chubao tauri app");
}
