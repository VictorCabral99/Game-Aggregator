import { app, ipcMain } from 'electron';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { autoUpdater } from 'electron-updater';
import { getSetting, initDatabase, setSetting } from '../db';
import { coversDir } from './cover';
import type { UpdateCheckResult } from '../../shared/api';

let updaterConfigured = false;

function configureUpdater(): void {
  if (updaterConfigured) return;
  updaterConfigured = true;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  // Sem feed configurado (dev / sem publish), checkForUpdates falha de forma controlada.
  autoUpdater.logger = null;
}

export function registerSystemHandlers(): void {
  ipcMain.handle('app:version', () => app.getVersion());

  ipcMain.handle('app:changelog', (): string => {
    const candidates = [
      join(app.getAppPath(), 'CHANGELOG.md'),
      join(process.cwd(), 'CHANGELOG.md'),
      join(process.cwd(), 'apps/desktop/CHANGELOG.md'),
      join(__dirname, '../../CHANGELOG.md'),
    ];
    for (const path of candidates) {
      if (existsSync(path)) return readFileSync(path, 'utf8');
    }
    return '# Changelog\n\nNenhuma nota de versão empacotada.\n';
  });

  ipcMain.handle('cache:clear', () => {
    const db = initDatabase();
    db.prepare(`DELETE FROM api_cache`).run();
    const dir = coversDir();
    let coversRemoved = 0;
    if (existsSync(dir)) {
      try {
        rmSync(dir, { recursive: true, force: true });
        coversRemoved = 1;
      } catch {
        // ignore
      }
    }
    return { ok: true, coversRemoved };
  });

  ipcMain.handle('telemetry:status', () => ({
    enabled: getSetting('telemetry.sentry') === '1',
    dsnConfigured: Boolean(getSetting('keys.sentryDsn')?.trim()),
  }));

  ipcMain.handle('telemetry:set', (_event, enabled: boolean) => {
    setSetting('telemetry.sentry', enabled ? '1' : '0');
    return { enabled };
  });

  ipcMain.handle('updater:check', async (): Promise<UpdateCheckResult> => {
    if (!app.isPackaged) {
      return {
        ok: true,
        updateAvailable: false,
        currentVersion: app.getVersion(),
        message: 'Atualizações só são verificadas no build instalado (não no dev).',
      };
    }
    configureUpdater();
    try {
      const result = await autoUpdater.checkForUpdates();
      const info = result?.updateInfo;
      const updateAvailable = Boolean(info && info.version !== app.getVersion());
      return {
        ok: true,
        updateAvailable,
        currentVersion: app.getVersion(),
        latestVersion: info?.version ?? null,
        message: updateAvailable
          ? `Nova versão ${info?.version} disponível`
          : 'Você está na versão mais recente',
      };
    } catch (err) {
      return {
        ok: false,
        updateAvailable: false,
        currentVersion: app.getVersion(),
        message: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle('updater:download', async (): Promise<UpdateCheckResult> => {
    if (!app.isPackaged) {
      return {
        ok: false,
        updateAvailable: false,
        currentVersion: app.getVersion(),
        message: 'Download de update só no app empacotado',
      };
    }
    configureUpdater();
    try {
      await autoUpdater.downloadUpdate();
      return {
        ok: true,
        updateAvailable: true,
        currentVersion: app.getVersion(),
        message: 'Update baixado — será aplicado ao sair do app',
      };
    } catch (err) {
      return {
        ok: false,
        updateAvailable: false,
        currentVersion: app.getVersion(),
        message: err instanceof Error ? err.message : String(err),
      };
    }
  });
}

/** Crash reporting opt-in (P9-06): só ativa com setting + DSN. */
export function initTelemetry(): void {
  if (getSetting('telemetry.sentry') !== '1') return;
  const dsn = getSetting('keys.sentryDsn')?.trim();
  if (!dsn) return;

  // Stub leve: log local. Integração Sentry completa pode plugar aqui sem mudar a UI.
  process.on('uncaughtException', (err) => {
    console.error('[telemetry]', err);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[telemetry:rejection]', reason);
  });
  console.info('[telemetry] opt-in ativo (DSN configurado)');
}
