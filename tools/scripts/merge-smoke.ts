// Smoke: auto-merge por título normalizado + merge manual + separar (P3-06/07/09).
// Uso: node tools/scripts/merge-smoke.ts
import { DatabaseSync } from 'node:sqlite';
import { applyMigrations } from '../../apps/desktop/src/main/db/migrations.ts';
import { LibraryRepository } from '../../apps/desktop/src/main/db/games.ts';

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
};

const db = new DatabaseSync(':memory:');
applyMigrations(db);
const repo = new LibraryRepository(db);

// Auto-merge: mesmo título normalizado em Steam e Epic vira um canonical com 2 sources
repo.upsertMany('steam', [{ externalId: '570', title: 'Dota 2' }]);
repo.upsertMany('epic', [{ externalId: 'dota-2-epic', title: 'DOTA 2' }]);

const list = repo.list();
assert(list.length === 1, `auto-merge: 1 canonical, foi ${list.length}`);
assert(list[0].sources.length === 2, `auto-merge: 2 sources, foi ${list[0].sources.length}`);
assert(
  list[0].sources.map((s) => s.platform).sort().join(',') === 'epic,steam',
  'sources steam+epic'
);
assert(list[0].sources[0].id !== list[0].sources[1].id, 'sources distintas');

// Idempotência continua
repo.upsertMany('steam', [{ externalId: '570', title: 'Dota 2' }]);
assert(repo.list().length === 1, 'idempotente pós-merge');
assert(repo.list()[0].sources.length === 2, 'sem nova source duplicada');

// Título distinto não auto-mergeia
repo.upsertMany('steam', [{ externalId: '730', title: 'Counter-Strike 2' }]);
assert(repo.list().length === 2, 'jogo distinto separado');

// Merge manual: edições que o auto-merge (normalizado) não juntou
repo.upsertMany('epic', [{ externalId: 'dishonored-epic', title: 'Dishonored - Definitive Edition' }]);
repo.upsertMany('steam', [{ externalId: '205100', title: 'Dishonored' }]);
const dhEpic = repo.list().find((g) => g.sources.some((s) => s.externalId === 'dishonored-epic'));
const dhSteam = repo.list().find((g) => g.sources.some((s) => s.externalId === '205100'));
assert(dhEpic && dhSteam, 'dois canonicals Dishonored');
assert(dhEpic.id !== dhSteam.id, 'ainda separados (sem auto-merge de edições)');

const merged = repo.mergeSources(dhSteam.id, [dhEpic.sources[0].id]);
assert(merged.sources.length === 2, 'merge manual: 2 sources');
const afterMerge = repo.list();
if (afterMerge.length !== 3) {
  console.error('DEBUG canonicals após merge:', afterMerge.map((g) => `${g.title} [${g.sources.map((s) => s.platform).join(',')}]`));
}
assert(afterMerge.length === 3, 'um canonical a menos após merge manual');
const mergedDh = repo.get(dhSteam.id);
assert(mergedDh !== null && mergedDh.sources.length === 2, 'canonical alvo com 2 sources');

// Separar: volta a ser canonicals separados
const separated = repo.separateSource(mergedDh!.sources.find((s) => s.externalId === 'dishonored-epic')!.id);
assert(separated.sources.length === 1, 'separar: source isolada');
assert(separated.sources[0].externalId === 'dishonored-epic', 'separar: source correta');
assert(repo.list().length === 4, 'separar: canonical novo');

// possibleDuplicates retorna pares plausíveis (Dishonored vs Definitive Edition)
const dupes = repo.possibleDuplicates();
assert(Array.isArray(dupes), 'possibleDuplicates retorna array');

console.log('MERGE_SMOKE_OK');
