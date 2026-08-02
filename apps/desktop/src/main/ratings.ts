import { RAWGAPI, RatingAggregator, SteamAPI } from '@gagg/providers-meta';
import {
  getCacheRow,
  getLibraryRepository,
  getRatingsRepository,
  getSetting,
  upsertCache,
} from './db';
import type { RatingsSyncResult } from '../shared/api';

const RAWG_TTL_MS = 7 * 24 * 3600 * 1000;
const CONCURRENCY = 3;

function rawgKey(): string {
  return process.env.RAWG_API_KEY ?? getSetting('keys.rawg') ?? '';
}

async function cachedGetJson<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const row = getCacheRow(key);
  if (row && Date.now() - new Date(row.fetched_at).getTime() < ttlMs) {
    return JSON.parse(row.body) as T;
  }
  const body = await fetcher();
  upsertCache(key, JSON.stringify(body));
  return body;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor;
      cursor += 1;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function enrichGame(gameId: string, title: string, steamAppId: string | null): Promise<void> {
  const ratingsRepo = getRatingsRepository();
  if (ratingsRepo.isFresh(gameId, RAWG_TTL_MS)) return;

  const key = rawgKey();
  const rawg = new RAWGAPI(key);
  const steam = new SteamAPI();

  try {
    const rawgRes = await cachedGetJson(
      `rawg:title:${title.toLowerCase().trim()}`,
      RAWG_TTL_MS,
      async () => rawg.resolveRatingsForTitle(title)
    );

    // Steam: usa appid da biblioteca quando existir; senão tenta buscar por título.
    let steamPercent: number | null = null;
    let steamCount: number | null = null;
    let appid: string | null = steamAppId;
    if (!appid) {
      const found = await cachedGetJson(
        `steam:find:${title.toLowerCase().trim()}`,
        7 * 24 * 3600 * 1000,
        async () => steam.findAppIdByTitle(title)
      );
      if (found.appid) appid = String(found.appid);
    }
    if (appid) {
      const score = await steam.getReviewScore(appid);
      steamPercent = score.percent;
      steamCount = score.totalReviews > 0 ? score.totalReviews : null;
    }

    ratingsRepo.upsert({
      gameId,
      source: 'rawg',
      rating: rawgRes.rawg,
      reviewCount: null,
      matchedName: rawgRes.matchedName,
    });
    ratingsRepo.upsert({
      gameId,
      source: 'metacritic',
      rating: rawgRes.metacritic,
      reviewCount: null,
      matchedName: rawgRes.matchedName,
    });
    ratingsRepo.upsert({
      gameId,
      source: 'steam',
      rating: steamPercent,
      reviewCount: steamCount,
      matchedName: appid ? `Steam App ${appid}` : null,
    });
  } catch {
    // Sem nota desta vez; marca tentativa para respeitar TTL de "sem dados".
    for (const source of ['rawg', 'metacritic', 'steam'] as const) {
      ratingsRepo.upsert({ gameId, source, rating: null, reviewCount: null, matchedName: null });
    }
  }
}

export async function syncAllRatings(): Promise<RatingsSyncResult> {
  const key = rawgKey();
  const repo = getLibraryRepository();
  const games = repo.list();

  if (!key) {
    return { attempted: games.length, updated: 0, skippedFresh: 0, noKey: true };
  }

  let updated = 0;
  let skippedFresh = 0;
  await mapPool(games, CONCURRENCY, async (game) => {
    const steamSource = game.sources.find((s) => s.platform === 'steam');
    const steamAppId = steamSource?.externalId ?? null;
    const wasFresh = getRatingsRepository().isFresh(game.id, RAWG_TTL_MS);
    await enrichGame(game.id, game.title, steamAppId);
    const isNowFresh = getRatingsRepository().isFresh(game.id, RAWG_TTL_MS);
    if (wasFresh) skippedFresh += 1;
    else if (isNowFresh) updated += 1;
  });

  return { attempted: games.length, updated, skippedFresh, noKey: false };
}

export function aggregateForGame(gameId: string) {
  const ratings = getRatingsRepository().listForGame(gameId);
  return RatingAggregator.aggregate(
    ratings.find((r) => r.source === 'metacritic')?.rating ?? null,
    ratings.find((r) => r.source === 'rawg')?.rating ?? null,
    ratings.find((r) => r.source === 'steam')?.rating ?? null
  );
}
