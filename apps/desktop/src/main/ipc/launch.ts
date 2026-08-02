import { ipcMain, shell } from 'electron';
import { spawn } from 'node:child_process';
import type { LaunchRequest, LaunchResult } from '../../shared/api';

export function registerLaunchHandlers(): void {
  ipcMain.handle('launch:exe', async (_event, req: LaunchRequest): Promise<LaunchResult> => {
    if (!req || typeof req.exe !== 'string' || req.exe.length === 0) {
      return { ok: false, error: 'Caminho do executável é obrigatório' };
    }

    return new Promise((resolve) => {
      const child = spawn(req.exe, req.args ?? [], {
        cwd: req.cwd ?? undefined,
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
  });

  ipcMain.handle('shell:open-path', async (_event, path: string) => {
    try {
      await shell.openPath(path);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    if (!/^https?:\/\//i.test(url)) {
      return { ok: false, error: 'URL inválida' };
    }
    try {
      await shell.openExternal(url);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
