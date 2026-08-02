import { app, ipcMain } from 'electron';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { DbHealth } from '../../shared/api';

let db: DatabaseSync | null = null;
let dbPath = '';

export function initDatabase(): DatabaseSync {
  if (db) return db;

  dbPath = join(app.getPath('userData'), 'launcher.db');
  const instance = new DatabaseSync(dbPath);
  instance.exec(`PRAGMA journal_mode = WAL;`);

  instance.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const row = instance
    .prepare(`SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1`)
    .get() as { version?: number } | undefined;
  if (!row) {
    instance.prepare(`INSERT INTO schema_migrations (version) VALUES (1)`).run();
  }

  db = instance;
  return db;
}

export function registerDbHandlers(): void {
  ipcMain.handle('db:health', (): DbHealth => {
    try {
      const instance = initDatabase();
      const settingsCount = (
        instance.prepare(`SELECT COUNT(*) AS n FROM app_settings`).get() as { n: number }
      ).n;
      const schema = instance.prepare(`SELECT MAX(version) AS v FROM schema_migrations`).get() as {
        v: number;
      };
      return {
        ok: true,
        path: dbPath,
        appVersion: app.getVersion(),
        schemaVersion: schema.v,
        settingsCount,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
}
