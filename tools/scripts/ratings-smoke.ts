// Smoke Fase 6: avaliações e rediscovery.
// - migration v6 (ratings + api_cache)
// - summaryForGame (prioridade steam % → rawg*20 → metacritic)
// - isFresh TTL 7 dias
// - gamesWithScoreNotPlayed (shelf "Esquecidos")
// - RatingAggregator do @gagg/providers-meta
// Uso: node tools/scripts/ratings-smoke.ts
import { DatabaseSync } from 'node:sqlite';
import { applyMigrations } from '../../apps/desktop/src/main/db/migrations.ts';
import { LibraryRepository } from '../../apps/desktop/src/main/db/games.ts';
import { RatingsRepository } from '../../apps/desktop/src/main/db/ratings.ts';
import { RatingAggregator } from '@gagg/providers-meta';

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
};

const db = new DatabaseSync(':memory:');
applyMigrations(db);
const repo = new LibraryRepository(db);
const ratings = new RatingsRepository(db);

// Biblioteca: 3 jogos (2 com fonte steam, 1 sem)
repo.upsertMany('steam', [
  { externalId: '730', title: 'CS2' },
  { externalId: '570', title: 'Dota 2' },
]);
repo.upsertRom('snes', 'D:\\Roms\\SNES\\Super Mario World (USA).smc', 'Super Mario World');
const games = repo.list();
assert(games.length === 3, `3 jogos (achei ${games.length})`);

const cs2 = games.find((g) => g.title === 'CS2')!;
const dota = games.find((g) => g.title === 'Dota 2')!;
const smw = games.find((g) => g.title === 'Super Mario World')!;

// Upsert de notas
ratings.upsert({ gameId: cs2.id, source: 'steam', rating: 88.5, reviewCount: 800000 });
ratings.upsert({ gameId: cs2.id, source: 'rawg', rating: 4.2, matchedName: 'Counter-Strike 2' });
ratings.upsert({ gameId: dota.id, source: 'rawg', rating: 4.4, matchedName: 'Dota 2' });
ratings.upsert({ gameId: dota.id, source: 'metacritic', rating: 90 });
ratings.upsert({ gameId: smw.id, source: 'rawg', rating: 4.7, matchedName: 'Super Mario World' });

// Prioridade: steam % manda no summary
const cs2Summary = ratings.summaryForGame(cs2.id);
assert(cs2Summary?.score === 88.5, `CS2 summary usa steam % (${cs2Summary?.score})`);
assert(cs2Summary?.source === 'steam', 'CS2 source=steam');
assert(cs2Summary?.sources.length === 2, 'CS2 tem 2 fontes');

// rawg*20 quando só RAWG
const smwSummary = ratings.summaryForGame(smw.id);
assert(smwSummary?.score === 94, `SMW summary rawg*20 (${smwSummary?.score})`);
assert(smwSummary?.source === 'rawg', 'SMW source=rawg');

// Sem nota → null (não 0 falso)
ratings.upsert({ gameId: dota.id, source: 'rawg', rating: null, matchedName: null });
ratings.upsert({ gameId: dota.id, source: 'metacritic', rating: null });
const dotaNoScore = ratings.summaryForGame(dota.id);
assert(dotaNoScore?.score === null, 'sem dados → score null, não 0');

// Shelf: SMW tem nota e nunca foi jogado → aparece
const notPlayed = ratings.gamesWithScoreNotPlayed();
assert(
  notPlayed.some((g) => g.gameId === smw.id && g.score === 94),
  'SMW na shelf esquecidos'
);

// TTL: fresca logo após upsert
assert(ratings.isFresh(cs2.id), 'CS2 fresco após upsert');
// TTL antigo
db.prepare(`UPDATE ratings SET last_updated = datetime('now', '-8 days') WHERE game_id = ?`).run(
  smw.id
);
assert(!ratings.isFresh(smw.id), 'SMW stale após 8 dias');

// api_cache
db.prepare(
  `INSERT INTO api_cache (cache_key, body, fetched_at) VALUES ('rawg:test', '{"x":1}', datetime('now'))`
).run();
const cacheRow = db.prepare(`SELECT body FROM api_cache WHERE cache_key = 'rawg:test'`).get() as {
  body: string;
};
assert(cacheRow.body === '{"x":1}', 'api_cache grava/le');

// RatingAggregator (package providers-meta)
const agg = RatingAggregator.aggregate(90, 4.5, 95);
assert(RatingAggregator.calculateWeighted(agg) > 90, 'weighted > 90');
assert(RatingAggregator.toDisplayScore('rawg', 4.5) === 90, 'rawg 4.5 → 90');

console.log('RATINGS_SMOKE_OK');
