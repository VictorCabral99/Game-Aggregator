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
  {
    version: 5,
    sql: `
      CREATE TABLE IF NOT EXISTS consoles (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        short_name      TEXT NOT NULL,
        extensions_json TEXT NOT NULL,
        bios_hint       TEXT,
        default_emulator TEXT NOT NULL,
        default_folder  TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS console_emulator_options (
        console_id  TEXT NOT NULL REFERENCES consoles(id) ON DELETE CASCADE,
        emulator_id TEXT NOT NULL,
        core        TEXT,
        args        TEXT,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (console_id, emulator_id, core)
      );

      ALTER TABLE game_sources ADD COLUMN console_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_sources_console ON game_sources (console_id);

      INSERT INTO consoles (id, name, short_name, extensions_json, bios_hint, default_emulator, default_folder) VALUES
        ('nes',     'Nintendo Entertainment System', 'NES',     '["nes"]',          NULL, 'retroarch', ''),
        ('snes',    'Super Nintendo Entertainment System', 'SNES', '["smc","sfc"]', NULL, 'retroarch', ''),
        ('gba',     'Game Boy Advance',              'GBA',     '["gba"]',          NULL, 'retroarch', ''),
        ('gbc',     'Game Boy / Game Boy Color',     'GB(C)',   '["gb","gbc"]',     NULL, 'retroarch', ''),
        ('genesis', 'Sega Genesis / Mega Drive',     'Genesis', '["md","gen","bin"]', NULL, 'retroarch', ''),
        ('ps1',     'PlayStation',                   'PS1',     '["cue","chd","pbp","bin"]', 'PS1 BIOS', 'duckstation', ''),
        ('ps2',     'PlayStation 2',                 'PS2',     '["iso","chd","cso"]', 'PS2 BIOS', 'pcsx2', '');

      INSERT INTO console_emulator_options (console_id, emulator_id, core, args, sort_order) VALUES
        ('nes',     'retroarch', 'nestopia_libretro.dll', NULL, 0),
        ('nes',     'retroarch', 'fceumm_libretro.dll',   NULL, 1),
        ('nes',     'bsnes',     NULL, NULL, 2),
        ('snes',    'retroarch', 'snes9x_libretro.dll',   NULL, 0),
        ('snes',    'retroarch', 'bsnes_libretro.dll',    NULL, 1),
        ('snes',    'bsnes',     NULL, NULL, 2),
        ('gba',     'retroarch', 'mgba_libretro.dll',     NULL, 0),
        ('gba',     'mGBA',      NULL, NULL, 1),
        ('gbc',     'retroarch', 'gambatte_libretro.dll', NULL, 0),
        ('genesis', 'retroarch', 'genesis_plus_gx_libretro.dll', NULL, 0),
        ('genesis', 'retroarch', 'picodrive_libretro.dll', NULL, 1),
        ('ps1',     'duckstation', NULL, NULL, 0),
        ('ps1',     'retroarch', 'pcsx_rearmed_libretro.dll', NULL, 1),
        ('ps2',     'pcsx2',     NULL, NULL, 0),
        ('ps2',     'retroarch', 'pcsx2_libretro.dll',    NULL, 1);
    `,
  },
  {
    version: 6,
    sql: `
      CREATE TABLE IF NOT EXISTS ratings (
        game_id      TEXT NOT NULL REFERENCES canonical_games(id) ON DELETE CASCADE,
        source       TEXT NOT NULL,
        rating       REAL,
        review_count INTEGER,
        url          TEXT,
        matched_name TEXT,
        last_updated TEXT,
        PRIMARY KEY (game_id, source)
      );

      CREATE INDEX IF NOT EXISTS idx_ratings_game ON ratings (game_id);

      CREATE TABLE IF NOT EXISTS api_cache (
        cache_key   TEXT PRIMARY KEY,
        body        TEXT NOT NULL,
        fetched_at  TEXT NOT NULL
      );
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
