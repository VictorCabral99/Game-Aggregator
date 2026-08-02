import { app, ipcMain } from 'electron';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { DbHealth } from '../../shared/api';
import { applyMigrations } from './migrations';
import { LibraryRepository } from './games';
import { RatingsRepository } from './ratings';
import { WishlistRepository } from './wishlist';
import { AuthRepository } from './auth';

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

export function getRatingsRepository(): RatingsRepository {
  return new RatingsRepository(initDatabase());
}

export function getWishlistRepository(): WishlistRepository {
  return new WishlistRepository(initDatabase());
}

export function getAuthRepository(): AuthRepository {
  return new AuthRepository(initDatabase());
}

export function getSetting(key: string): string | null {
  const row = initDatabase()
    .prepare(`SELECT value FROM app_settings WHERE key = ?`)
    .get(key) as { value?: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  initDatabase()
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, value);
}

export interface CacheEntry {
  body: string;
  fetched_at: string;
}

export function getCacheRow(key: string): CacheEntry | null {
  const row = initDatabase()
    .prepare(`SELECT body, fetched_at FROM api_cache WHERE cache_key = ?`)
    .get(key) as CacheEntry | undefined;
  return row ?? null;
}

export function upsertCache(key: string, body: string): void {
  initDatabase()
    .prepare(
      `INSERT INTO api_cache (cache_key, body, fetched_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT (cache_key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at`
    )
    .run(key, body);
}

export function registerDbHandlers(): void {
  ipcMain.handle('settings:get', (_event, key: string): string | null => {
    if (!key) throw new Error('key é obrigatório');
    return getSetting(key);
  });

  ipcMain.handle('settings:set', (_event, args: { key: string; value: string }): void => {
    if (!args?.key) throw new Error('key é obrigatório');
    setSetting(args.key, String(args.value ?? ''));
  });

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
