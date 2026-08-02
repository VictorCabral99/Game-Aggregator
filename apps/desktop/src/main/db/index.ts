import { app, ipcMain } from 'electron';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { DbHealth } from '../../shared/api';
import { applyMigrations } from './migrations';
import { LibraryRepository } from './games';

let db: DatabaseSync | null = null;
let dbPath = '';

export function initDatabase(): DatabaseSync {
  if (db) return db;

  dbPath = join(app.getPath('userData'), 'launcher.db');
  const instance = new DatabaseSync(dbPath);
  instance.exec(`PRAGMA journal_mode = WAL;`);

  applyMigrations(instance);

  db = instance;
  return db;
}

export function getLibraryRepository(): LibraryRepository {
  return new LibraryRepository(initDatabase());
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
