// Benchmark Fase 9: seed 1000 jogos + filtro/list <300ms (documentado).
// Uso: node tools/scripts/bench-1k-smoke.ts
import { DatabaseSync } from 'node:sqlite';
import { applyMigrations } from '../../apps/desktop/src/main/db/migrations.ts';
import { LibraryRepository } from '../../apps/desktop/src/main/db/games.ts';
import { normalizeTitle } from '../../packages/core/src/normalize.ts';

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
};

const N = 1000;
const db = new DatabaseSync(':memory:');
applyMigrations(db);
const repo = new LibraryRepository(db);

const tSeed0 = performance.now();
for (let i = 0; i < N; i++) {
  const title = `Bench Game ${String(i).padStart(4, '0')}`;
  // bypass existsSync via direct SQL-ish path: use upsertMany for speed
  void title;
}
// Seed rápido via upsertMany (Steam-like)
const items = Array.from({ length: N }, (_, i) => ({
  externalId: `bench-${i}`,
  title: `Bench Game ${String(i).padStart(4, '0')}`,
  isInstalled: i % 3 !== 0,
  coverUrl: null as string | null,
}));
const { inserted } = repo.upsertMany('steam', items);
const seedMs = performance.now() - tSeed0;
assert(inserted === N, `seed inserted=${inserted}`);

const tList0 = performance.now();
const list = repo.list();
const listMs = performance.now() - tList0;
assert(list.length === N, `list length=${list.length}`);

const query = 'bench game 05';
const tFilter0 = performance.now();
const filtered = list.filter((g) => {
  const hay = `${g.title} ${g.normalizedTitle}`.toLowerCase();
  return query.split(/\s+/).every((tok) => hay.includes(tok));
});
const filterMs = performance.now() - tFilter0;
assert(filtered.length > 0, 'filtro retornou itens');
assert(filterMs < 300, `filtro ${filterMs.toFixed(1)}ms >= 300ms`);
assert(listMs < 500, `list ${listMs.toFixed(1)}ms >= 500ms`);
assert(typeof normalizeTitle('Bench Game™') === 'string', 'normalize ok');

console.log(
  JSON.stringify({
    ok: true,
    n: N,
    seedMs: Math.round(seedMs),
    listMs: Math.round(listMs * 10) / 10,
    filterMs: Math.round(filterMs * 10) / 10,
    filtered: filtered.length,
  })
);
console.log('BENCH_1K_SMOKE_OK');
