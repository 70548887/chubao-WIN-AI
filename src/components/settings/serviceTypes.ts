export type ServiceKey = 'node' | 'python';

export interface SidecarServiceStatus {
  name: string;
  running: boolean;
  healthy: boolean;
  managed: boolean;
  pid: number | null;
  port: number;
  endpoint: string;
  lastError: string | null;
}

export interface SidecarStatusResponse {
  node: SidecarServiceStatus;
  python: SidecarServiceStatus;
}

export interface SidecarLogsResponse {
  service: ServiceKey;
  lines: string[];
}

export interface SidecarPortOccupantPayload {
  pid: number;
  processName: string;
  localAddress: string;
  commandLine: string;
}

export interface SidecarPortInspectionPayload {
  service: ServiceKey;
  port: number;
  listening: boolean;
  managedPid: number | null;
  hasConflict: boolean;
  occupants: SidecarPortOccupantPayload[];
  inspectedAtMs: number;
}

export interface PythonOcrDependenciesPayload {
  paddleocr?: boolean;
  paddle?: boolean;
}

export interface PythonOcrHealthPayload {
  dependencies?: PythonOcrDependenciesPayload;
  engineInitialized?: boolean;
  apiVersion?: string;
  lastError?: string | null;
}

export interface ServiceHealthPayload {
  status?: string;
  service?: string;
  version?: string;
  uptimeSec?: number;
  timestamp?: string;
  deps?: Record<string, string>;
  ocr?: PythonOcrHealthPayload;
}

export interface ServiceDiagnosticsPayload {
  status: SidecarServiceStatus;
  health: ServiceHealthPayload | null;
  healthError: string | null;
  portInspection?: SidecarPortInspectionPayload;
}

export interface SidecarDiagnosticsResponse {
  node: ServiceDiagnosticsPayload;
  python: ServiceDiagnosticsPayload;
}
