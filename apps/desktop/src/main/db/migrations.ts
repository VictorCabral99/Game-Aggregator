import type { DatabaseSync } from 'node:sqlite';

/**
 * Migrations incrementais. version 1 foi criado inline no Fase 0
 * (schema_migrations + app_settings). Novas versões entram aqui.
 */
export const MIGRATIONS: Array<{ version: number; sql: string }> = [
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS games (
        id            TEXT PRIMARY KEY,
        title         TEXT NOT NULL,
        executable    TEXT NOT NULL,
        cwd           TEXT,
        cover_path    TEXT,
        cover_url     TEXT,
        notes         TEXT,
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
        last_played_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_games_title ON games (title COLLATE NOCASE);
    `,
  },
  {
    version: 3,
    sql: `
      CREATE TABLE games_new (
        id            TEXT PRIMARY KEY,
        title         TEXT NOT NULL,
        executable    TEXT,
        cwd           TEXT,
        cover_path    TEXT,
        cover_url     TEXT,
        notes         TEXT,
        platform      TEXT NOT NULL DEFAULT 'local',
        external_id   TEXT,
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
        last_played_at TEXT
      );
      INSERT INTO games_new (id, title, executable, cwd, cover_path, cover_url, notes, platform, external_id, created_at, updated_at, last_played_at)
        SELECT id, title, executable, cwd, cover_path, cover_url, notes, 'local', NULL, created_at, updated_at, last_played_at FROM games;
      DROP TABLE games;
      ALTER TABLE games_new RENAME TO games;
      CREATE INDEX IF NOT EXISTS idx_games_title ON games (title COLLATE NOCASE);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_games_platform_external
        ON games (platform, external_id) WHERE external_id IS NOT NULL;
    `,
  },
  {
    version: 4,
    sql: `
      CREATE TABLE IF NOT EXISTS canonical_games (
        id              TEXT PRIMARY KEY,
        slug            TEXT NOT NULL UNIQUE,
        title           TEXT NOT NULL,
        normalized_title TEXT NOT NULL,
        cover_path      TEXT,
        cover_url       TEXT,
        notes           TEXT,
        summary         TEXT,
        genres_json     TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_canonical_normalized
        ON canonical_games (normalized_title COLLATE NOCASE);

      CREATE TABLE IF NOT EXISTS game_sources (
        id            TEXT PRIMARY KEY,
        game_id       TEXT NOT NULL REFERENCES canonical_games(id) ON DELETE CASCADE,
        platform      TEXT NOT NULL,
        external_id   TEXT,
        title         TEXT NOT NULL,
        install_path  TEXT,
        executable    TEXT,
        cwd           TEXT,
        is_installed  INTEGER NOT NULL DEFAULT 1,
        size_bytes    INTEGER,
        raw_json      TEXT,
        last_played_at TEXT,
        scanned_at    TEXT NOT NULL DEFAULT (datetime('now')),
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sources_platform_external
        ON game_sources (platform, external_id) WHERE external_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_sources_game ON game_sources (game_id);

      INSERT INTO canonical_games (id, slug, title, normalized_title, cover_path, cover_url, notes, created_at, updated_at)
        SELECT id, 'c-' || lower(replace(id, '-', '')), title, lower(title), cover_path, cover_url, notes, created_at, updated_at FROM games;

      INSERT INTO game_sources (id, game_id, platform, external_id, title, install_path, executable, cwd, is_installed, size_bytes, last_played_at, created_at, updated_at)
        SELECT 's-' || id, id, platform, external_id, title, NULL, executable, cwd, 1, NULL, last_played_at, created_at, updated_at FROM games;
    `,
  },
];

export function applyMigrations(db: DatabaseSync): void {
  db.exec(`
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

  const current = (
    db.prepare(`SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations`).get() as {
      v: number;
    }
  ).v;

  for (const mig of MIGRATIONS) {
    if (mig.version <= current) continue;
    db.exec('BEGIN');
    try {
      db.exec(mig.sql);
      db.prepare(`INSERT INTO schema_migrations (version) VALUES (?)`).run(mig.version);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}
