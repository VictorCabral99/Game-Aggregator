// Smoke: upgrade de DB da Fase 1 (v2) para v3/v4 preservando jogos locais
// e migrando dados flat → canonical_games + game_sources.
// Uso: node tools/scripts/migration-upgrade-smoke.ts
import { DatabaseSync } from 'node:sqlite';
import { applyMigrations } from '../../apps/desktop/src/main/db/migrations.ts';
import { LibraryRepository } from '../../apps/desktop/src/main/db/games.ts';

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
};

const db = new DatabaseSync(':memory:');

// Simula o schema v2 (Fase 1)
db.exec(`
  CREATE TABLE games (
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
`);
db.prepare(`INSERT INTO games (id, title, executable, cwd) VALUES ('a', 'Notepad', 'C:\\Windows\\System32\\notepad.exe', NULL)`).run();
db.prepare(`INSERT INTO games (id, title, executable, cwd) VALUES ('b', 'Calc', 'C:\\Windows\\System32\\calc.exe', 'C:\\Windows')`).run();

applyMigrations(db);
const repo = new LibraryRepository(db);

const list = repo.list();
assert(list.length === 2, `preservou ${list.length} jogos`);
assert(list.every((g) => g.sources.some((s) => s.platform === 'local')), 'todos sources=local');
assert(list.find((g) => g.id === 'a')?.title === 'Notepad', 'título preservado');
assert(
  list.find((g) => g.id === 'b')?.sources[0].cwd === 'C:\\Windows',
  'cwd preservado na source'
);
assert(list.find((g) => g.id === 'b')?.sources[0].executable === 'C:\\Windows\\System32\\calc.exe', 'exe preservado');

// upsert de jogo de loja funciona após o upgrade
repo.upsertMany('steam', [{ externalId: '730', title: 'CS2' }]);
assert(repo.countByPlatform('steam') === 1, 'steam upsert após upgrade');

console.log('MIGRATION_UPGRADE_SMOKE_OK');
