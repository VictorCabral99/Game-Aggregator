/**
 * Contrato IPC entre main, preload e renderer.
 * Fica em src/shared para os três builds importarem (type-only).
 */

export interface LaunchRequest {
  exe: string;
  cwd?: string;
  args?: string[];
}

export interface LaunchResult {
  ok: boolean;
  error?: string;
  pid?: number;
}

export interface DbHealth {
  ok: boolean;
  path?: string;
  appVersion?: string;
  schemaVersion?: number;
  settingsCount?: number;
  error?: string;
}

export interface DesktopApi {
  launchExe(req: LaunchRequest): Promise<LaunchResult>;
  dbHealth(): Promise<DbHealth>;
  openPath(path: string): Promise<{ ok: boolean; error?: string }>;
}
