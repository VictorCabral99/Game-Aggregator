// Smoke perf Fase 3 (P3-15): 200 jogos, list + filtro < 300ms.
// Uso: node tools/scripts/perf-filter-smoke.ts
import { DatabaseSync } from 'node:sqlite';
import { applyMigrations } from '../../apps/desktop/src/main/db/migrations.ts';
import { LibraryRepository } from '../../apps/desktop/src/main/db/games.ts';

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
};

const db = new DatabaseSync(':memory:');
applyMigrations(db);
const repo = new LibraryRepository(db);

const N = 200;
const titles: string[] = [];
for (let i = 0; i < N; i++) {
  titles.push(`Game Test ${i} - Edition ${i % 3}`);
}
const startUpsert = performance.now();
repo.upsertMany('steam', titles.map((t, i) => ({ externalId: String(100000 + i), title: t })));
const upsertMs = performance.now() - startUpsert;

assert(repo.list().length === N, `seed: ${N} jogos`);
assert(upsertMs < 3000, `upsert 200 itens razoável (${upsertMs.toFixed(0)}ms)`);

// list()
const t0 = performance.now();
const games = repo.list();
const listMs = performance.now() - t0;

// filtro por plataforma
const t1 = performance.now();
const filtered = games.filter((g) => g.sources.some((s) => s.platform === 'steam'));
const filterMs = performance.now() - t1;
assert(filtered.length === N, 'filtro plataforma retorna todos');

// busca por nome
const t2 = performance.now();
const q = 'game test 10';
const search = games.filter((g) =>
  `${g.title} ${g.normalizedTitle}`.toLowerCase().includes(q.toLowerCase())
);
const searchMs = performance.now() - t2;
assert(search.length > 0, 'busca retorna resultados');

// combinação filtro + busca (o que a UI faz a cada keystroke)
const filterPlatform = 'steam';
const t3 = performance.now();
const combined = games.filter((g) => {
  if (filterPlatform !== 'all' && !g.sources.some((s) => s.platform === filterPlatform)) return false;
  if (!g.genres.includes('RPG')) return false;
  const hay = `${g.title} ${g.normalizedTitle}`.toLowerCase();
  if (!hay.includes('game')) return false;
  return true;
});
const combinedMs = performance.now() - t3;

const total = listMs + filterMs + searchMs + combinedMs;
const totalMs = performance.now() - t0;
console.log(
  `PERF list=${listMs.toFixed(1)}ms filter=${filterMs.toFixed(1)}ms search=${searchMs.toFixed(1)}ms combined=${combinedMs.toFixed(1)}ms (total ${totalMs.toFixed(1)}ms)`
);
assert(totalMs < 300, `filtro 200 itens < 300ms (total ${totalMs.toFixed(0)}ms)`);

console.log('PERF_FILTER_SMOKE_OK');
