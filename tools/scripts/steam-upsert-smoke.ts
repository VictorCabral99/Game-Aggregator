// Smoke: scan Steam (fixture) → upsert no banco → re-scan idempotente.
// Uso: node tools/scripts/steam-upsert-smoke.ts
import { DatabaseSync } from 'node:sqlite';
import { SteamProvider } from '../../apps/desktop/src/main/providers/steam.ts';
import { applyMigrations } from '../../apps/desktop/src/main/db/migrations.ts';
import { LibraryRepository } from '../../apps/desktop/src/main/db/games.ts';

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
};

const store = new Map<string, string>();
const provider = new SteamProvider({
  get: (k) => store.get(k) ?? null,
  set: (k, v) => void store.set(k, v),
});
provider.setPathOverride('tools/fixtures/fake-steam');

const games = await provider.scan();
assert(games.length === 3, 'scan count');

const db = new DatabaseSync(':memory:');
applyMigrations(db);
const repo = new LibraryRepository(db);

const first = repo.upsertMany('steam', games);
assert(first.inserted === 3, `upsert first=${first.inserted}`);
assert(repo.countByPlatform('steam') === 3, 'count after first');

const second = repo.upsertMany('steam', games);
assert(second.inserted === 0, `upsert second deve ser 0, foi ${second.inserted}`);

const list = repo.listByPlatform('steam');
assert(list.length === 3, 'list steam');
assert(
  list.every((g) => g.sources.some((s) => s.platform === 'steam' && s.externalId)),
  'source steam/externalId setados'
);
assert(
  list.every((g) => g.sources.every((s) => s.executable === null)),
  'sem executável para jogos de loja'
);

// jogo local não é afetado pelo upsert
const local = repo.add({ title: 'Notepad', executable: 'C:\\Windows\\System32\\notepad.exe' });
assert(repo.countByPlatform('local') === 1, 'local count');
repo.upsertMany('steam', games);
assert(repo.get(local.id)?.sources.some((s) => s.platform === 'local'), 'local preservado');

console.log('STEAM_UPSERT_SMOKE_OK');
