import { dialog, ipcMain } from 'electron';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { getSetting, setSetting } from '../db';
import type { LaunchResult, MoonlightSettings, MoonlightStatus } from '../../shared/api';

const COMMON_PATHS = [
  join(homedir(), 'AppData', 'Local', 'Programs', 'Moonlight Game Streaming Client', 'Moonlight.exe'),
  join(process.env['ProgramFiles'] ?? 'C:\\Program Files', 'Moonlight Game Streaming Client', 'Moonlight.exe'),
  join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Moonlight Game Streaming Client', 'Moonlight.exe'),
];

function detectMoonlightPath(): string | null {
  const override = getSetting('moonlight.path')?.trim();
  if (override && existsSync(override)) return override;
  for (const p of COMMON_PATHS) {
    if (existsSync(p)) return p;
  }
  return null;
}

function readSettings(): MoonlightSettings {
  return {
    path: getSetting('moonlight.path')?.trim() || detectMoonlightPath() || '',
    host: getSetting('moonlight.host')?.trim() || '',
    app: getSetting('moonlight.app')?.trim() || '',
    extraArgs: getSetting('moonlight.args')?.trim() || '',
  };
}

function status(): MoonlightStatus {
  const settings = readSettings();
  const path = settings.path && existsSync(settings.path) ? settings.path : detectMoonlightPath();
  return {
    available: Boolean(path),
    path,
    host: settings.host || null,
    app: settings.app || null,
    error: path ? null : 'Moonlight não encontrado — configure o path em Configurações',
  };
}

function launchStream(): Promise<LaunchResult> {
  const settings = readSettings();
  const exe = settings.path && existsSync(settings.path) ? settings.path : detectMoonlightPath();
  if (!exe) {
    return Promise.resolve({
      ok: false,
      error: 'Moonlight não encontrado. Instale o client ou aponte o path em Configurações.',
    });
  }
  if (!settings.host) {
    return Promise.resolve({
      ok: false,
      error: 'Configure o host Sunshine/Moonlight em Configurações antes de iniciar o stream.',
    });
  }

  const args: string[] = ['stream', settings.host];
  if (settings.app) args.push(settings.app);
  if (settings.extraArgs) {
    args.push(...settings.extraArgs.split(/\s+/).filter(Boolean));
  }

  return new Promise((resolve) => {
    const child = spawn(exe, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    const fail = (err: Error) => resolve({ ok: false, error: err.message });
    child.once('error', fail);
    child.once('spawn', () => {
      child.removeListener('error', fail);
      child.unref();
      resolve({ ok: true, pid: child.pid });
    });
  });
}

export function registerMoonlightHandlers(): void {
  ipcMain.handle('moonlight:status', (): MoonlightStatus => status());

  ipcMain.handle('moonlight:settings', (): MoonlightSettings => readSettings());

  ipcMain.handle(
    'moonlight:set-settings',
    (_event, patch: Partial<MoonlightSettings>): MoonlightSettings => {
      if (patch.path !== undefined) setSetting('moonlight.path', String(patch.path ?? '').trim());
      if (patch.host !== undefined) setSetting('moonlight.host', String(patch.host ?? '').trim());
      if (patch.app !== undefined) setSetting('moonlight.app', String(patch.app ?? '').trim());
      if (patch.extraArgs !== undefined) setSetting('moonlight.args', String(patch.extraArgs ?? '').trim());
      return readSettings();
    }
  );

  ipcMain.handle('moonlight:pick-exe', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Selecionar Moonlight.exe',
      filters: [{ name: 'Executável', extensions: ['exe'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const path = result.filePaths[0];
    setSetting('moonlight.path', path);
    return path;
  });

  ipcMain.handle('moonlight:launch', (): Promise<LaunchResult> => launchStream());
}
