// import { RAWGAPI } from '@gagg/providers-meta'; // pausado — timeout + match ruim
import { RatingAggregator, SteamAPI } from '@gagg/providers-meta';
import {
  getCacheRow,
  getLibraryRepository,
  getRatingsRepository,
  getSetting,
  setSetting,
  upsertCache,
} from './db';
import type { EnrichEvent, RatingsSummary, RatingsSyncResult } from '../shared/api';
import type { Game } from './db/games';
import { downloadCoverForGame } from './ipc/cover';
import { createRatingsFileLog, type RatingsFileLog } from './ratings-log';

const RATINGS_TTL_MS = 7 * 24 * 3600 * 1000;
const CONCURRENCY = 3;

// function rawgKey(): string {
//   return process.env.RAWG_API_KEY ?? getSetting('keys.rawg') ?? '';
// }

function steamAppIdKey(gameId: string): string {
  return `steam.appid.${gameId}`;
}

function steamLookupKey(gameId: string): string {
  return `steam.lookup.${gameId}`;
}

function getResolvedSteamAppId(gameId: string): string | null {
  return getSetting(steamAppIdKey(gameId))?.trim() || null;
}

function setResolvedSteamAppId(gameId: string, appid: string): void {
  setSetting(steamAppIdKey(gameId), appid);
}

function isSteamLookupDone(gameId: string): boolean {
  return getSetting(steamLookupKey(gameId)) === '1';
}

function markSteamLookupDone(gameId: string): void {
  setSetting(steamLookupKey(gameId), '1');
}

/** Só fontes emulator → não resolve Steam AppID. */
function isRetroOnly(game: Game): boolean {
  return game.sources.length > 0 && game.sources.every((s) => s.platform === 'emulator');
}

/** Download de capa só para retro — lojas já trazem coverUrl no sync. */
function needsCoverDownload(game: Game): boolean {
  if (game.coverPath) return false;
  return game.sources.some((s) => s.platform === 'emulator');
}

function resolveSteamAppIdForGame(game: Game): string | null {
  const fromSteam = game.sources.find((s) => s.platform === 'steam' && s.externalId)?.externalId;
  if (fromSteam) return fromSteam;
  return getResolvedSteamAppId(game.id);
}

/** Índice: nota Steam útil + fresca. */
function buildSteamRatingsIndex(freshMs: number): {
  usefulSteam: Set<string>;
  freshSteam: Set<string>;
  seenSteam: Set<string>;
} {
  const usefulSteam = new Set<string>();
  const freshSteam = new Set<string>();
  const seenSteam = new Set<string>();
  const latest = new Map<string, number>();

  for (const r of getRatingsRepository().listAll()) {
    if (r.source !== 'steam') continue;
    seenSteam.add(r.gameId);
    if (r.rating != null && r.rating > 0) usefulSteam.add(r.gameId);
    if (!r.lastUpdated) continue;
    const t = new Date(r.lastUpdated).getTime();
    if (Number.isNaN(t)) continue;
    const prev = latest.get(r.gameId) ?? 0;
    if (t > prev) latest.set(r.gameId, t);
  }
  const now = Date.now();
  for (const [gameId, t] of latest) {
    if (now - t < freshMs) freshSteam.add(gameId);
  }
  return { usefulSteam, freshSteam, seenSteam };
}

function needsSteamWork(
  game: Game,
  force: boolean,
  index?: ReturnType<typeof buildSteamRatingsIndex>
): { any: boolean; findSteamId: boolean; ratings: boolean; priority: number } {
  if (isRetroOnly(game)) {
    return { any: false, findSteamId: false, ratings: false, priority: 9 };
  }
  if (force) {
    return {
      any: true,
      findSteamId: true,
      ratings: true,
      priority: resolveSteamAppIdForGame(game) ? 1 : 0,
    };
  }

  const hasAppId = Boolean(resolveSteamAppIdForGame(game));
  const findSteamId = !hasAppId && !isSteamLookupDone(game.id);
  const neverTried = index ? !index.seenSteam.has(game.id) : true;
  const missingUseful = index ? !index.usefulSteam.has(game.id) : true;
  const stale = index ? index.seenSteam.has(game.id) && !index.freshSteam.has(game.id) : true;
  // Sem nota útil: rebusca só se nunca tentou OU stale; miss recente (null fresco) não refila
  const ratings = neverTried || (missingUseful && stale) || (!missingUseful && stale);
  const any = ratings || findSteamId;
  let priority = 9;
  if (neverTried) priority = 1;
  else if (findSteamId) priority = 2;
  else if (stale) priority = 3;
  return { any, findSteamId, ratings, priority };
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

async function ensureSteamAppId(
  game: Game,
  findSteamId: boolean,
  log?: RatingsFileLog
): Promise<string | null> {
  if (isRetroOnly(game)) return null;
  let appid = resolveSteamAppIdForGame(game);
  if (appid || !findSteamId) {
    if (appid) log?.line(`steam · ${game.title} · appid conhecido ${appid}`);
    return appid;
  }

  const steam = new SteamAPI();
  const title = game.title;
  const started = Date.now();
  try {
    const found = await cachedGetJson(
      `steam:find:${title.toLowerCase().trim()}`,
      RATINGS_TTL_MS,
      async () => steam.findAppIdByTitle(title)
    );
    const ms = Date.now() - started;
    if (found.appid) {
      appid = String(found.appid);
      setResolvedSteamAppId(game.id, appid);
      log?.line(
        `steam · ${title} · lookup HIT ${appid} · match=${found.matchedName || '-'} · score=${found.score ?? '-'} · q="${found.query || title}" · ${ms}ms`
      );
    } else {
      log?.line(
        `steam · ${title} · lookup MISS · match=${found.matchedName || '-'} · score=${found.score ?? '-'} · q="${found.query || title}" · ${ms}ms`
      );
    }
  } catch (err) {
    log?.line(
      `steam · ${title} · lookup ERROR · ${err instanceof Error ? err.message : String(err)}`
    );
  }
  markSteamLookupDone(game.id);
  return appid;
}

/** Steam % only — RAWG/Metacritic comentados. */
async function enrichSteamRating(
  game: Game,
  findSteamId: boolean,
  log?: RatingsFileLog
): Promise<{ skipped: boolean; gotScore: boolean }> {
  if (isRetroOnly(game)) return { skipped: true, gotScore: false };

  const ratingsRepo = getRatingsRepository();
  const steam = new SteamAPI();

  try {
    // RAWG/Metacritic pausados:
    // const key = rawgKey();
    // const rawg = new RAWGAPI(key);
    // const rawgRes = await cachedGetJson(`rawg:title:...`, ..., () => rawg.resolveRatingsForTitle(title));

    const appid = await ensureSteamAppId(game, findSteamId, log);
    let steamPercent: number | null = null;
    let steamCount: number | null = null;

    if (appid) {
      const started = Date.now();
      const score = await steam.getReviewScore(appid);
      const ms = Date.now() - started;
      steamPercent = score.percent;
      steamCount = score.totalReviews > 0 ? score.totalReviews : null;
      log?.line(
        `steam · ${game.title} · review ${steamPercent ?? 'null'}% · reviews=${steamCount ?? 0} · appid=${appid} · ${ms}ms`
      );
    } else {
      log?.line(`steam · ${game.title} · sem appid — sem review`);
    }

    ratingsRepo.upsert({
      gameId: game.id,
      source: 'steam',
      rating: steamPercent,
      reviewCount: steamCount,
      matchedName: appid ? `Steam App ${appid}` : null,
    });

    // ratingsRepo.upsert({ gameId, source: 'rawg', ... });
    // ratingsRepo.upsert({ gameId, source: 'metacritic', ... });

    return { skipped: false, gotScore: steamPercent != null && steamPercent > 0 };
  } catch (err) {
    log?.line(
      `steam · ${game.title} · ERROR · ${err instanceof Error ? err.message : String(err)}`
    );
    ratingsRepo.upsert({
      gameId: game.id,
      source: 'steam',
      rating: null,
      reviewCount: null,
      matchedName: null,
    });
    return { skipped: false, gotScore: false };
  }
}

export async function syncAllRatings(): Promise<RatingsSyncResult> {
  return streamEnrichLibrary(() => undefined, {}).then((r) => ({
    attempted: r.attempted,
    updated: r.updated,
    skippedFresh: r.skippedFresh,
    noKey: r.noKey,
  }));
}

function isRetroGame(game: Game): boolean {
  return game.sources.some((s) => s.platform === 'emulator');
}

function sortRetroFirst(a: Game, b: Game): number {
  const ar = isRetroGame(a) ? 0 : 1;
  const br = isRetroGame(b) ? 0 : 1;
  if (ar !== br) return ar - br;
  return a.title.localeCompare(b.title);
}

async function processRetroCovers(
  games: Game[],
  send: (event: EnrichEvent) => void,
  totals: { index: number; total: number },
  repo: ReturnType<typeof getLibraryRepository>,
  log?: RatingsFileLog
): Promise<number> {
  let covers = 0;
  await mapPool(games, CONCURRENCY, async (game) => {
    let coverOk = false;
    try {
      coverOk = await downloadCoverForGame(game);
      if (coverOk) covers += 1;
    } catch {
      coverOk = false;
    }
    const fresh = repo.get(game.id);
    const current = ++totals.index;
    log?.line(`cover · ${game.title} · ${coverOk ? 'OK' : 'MISS'}`);
    send({
      type: 'item',
      index: current,
      total: totals.total,
      gameId: game.id,
      title: `Capa · ${game.title}`,
      coverOk: Boolean(fresh?.coverPath || coverOk),
      coverPath: fresh?.coverPath ?? null,
      summary: getRatingsRepository().summaryForGame(game.id),
      skipped: !coverOk,
    });
  });
  return covers;
}

async function processSteamRatings(
  items: Array<{ game: Game; work: ReturnType<typeof needsSteamWork> }>,
  send: (event: EnrichEvent) => void,
  totals: { index: number; total: number },
  counters: { updated: number; skippedFresh: number; misses: number },
  repo: ReturnType<typeof getLibraryRepository>,
  log?: RatingsFileLog
): Promise<void> {
  await mapPool(items, CONCURRENCY, async ({ game, work }) => {
    let skipped = true;
    let gotScore = false;

    if (work.ratings || work.findSteamId) {
      const result = await enrichSteamRating(game, work.findSteamId || work.ratings, log);
      skipped = result.skipped;
      gotScore = result.gotScore;
      if (gotScore) counters.updated += 1;
      else if (skipped) counters.skippedFresh += 1;
      else counters.misses += 1;
    } else {
      counters.skippedFresh += 1;
    }

    const fresh = repo.get(game.id);
    const current = ++totals.index;
    send({
      type: 'item',
      index: current,
      total: totals.total,
      gameId: game.id,
      title: `Steam · ${game.title}`,
      coverOk: Boolean(fresh?.coverPath || fresh?.coverUrl),
      coverPath: fresh?.coverPath ?? null,
      summary: getRatingsRepository().summaryForGame(game.id),
      skipped: skipped || !gotScore,
    });
  });
}

/**
 * Ordem:
 * 1) capas retro (Libretro)
 * 2) notas Steam % (AppID lookup + reviews) — RAWG/Meta pausados
 */
export async function streamEnrichLibrary(
  send: (event: EnrichEvent) => void,
  opts?: { gameIds?: string[]; force?: boolean; maxGames?: number }
): Promise<RatingsSyncResult & { covers: number }> {
  const log = await createRatingsFileLog();
  const repo = getLibraryRepository();
  let games = repo.list();
  if (opts?.gameIds?.length) {
    const set = new Set(opts.gameIds);
    games = games.filter((g) => set.has(g.id));
  }

  const force = Boolean(opts?.force);
  const index = force ? undefined : buildSteamRatingsIndex(RATINGS_TTL_MS);
  const maxGames = opts?.maxGames && opts.maxGames > 0 ? opts.maxGames : undefined;

  let coverQueue = games.filter((g) => needsCoverDownload(g)).sort(sortRetroFirst);
  if (maxGames && coverQueue.length > maxGames) {
    coverQueue = coverQueue.slice(0, maxGames);
  }

  let ratingItems = games
    .map((g) => ({ game: g, work: needsSteamWork(g, force, index) }))
    .filter((x) => x.work.any)
    .sort((a, b) => {
      if (a.work.priority !== b.work.priority) return a.work.priority - b.work.priority;
      return sortRetroFirst(a.game, b.game);
    });

  if (maxGames) {
    const ratingBudget = Math.max(0, maxGames - coverQueue.length);
    if (ratingItems.length > ratingBudget) {
      ratingItems = ratingItems.slice(0, ratingBudget);
    }
  }

  const total = coverQueue.length + ratingItems.length;
  const skippedFresh = games.length - coverQueue.length - ratingItems.length;

  log.line(
    `start · covers=${coverQueue.length} steamQueue=${ratingItems.length} skippedFresh≈${Math.max(0, skippedFresh)} force=${force} maxGames=${maxGames ?? '∞'} · log=${log.filePath}`
  );
  await log.flush();

  send({ type: 'start', total });

  if (total === 0) {
    log.line(`done · nada pendente — ${games.length} jogos na lib`);
    await log.flush();
    send({ type: 'done', updated: 0, covers: 0, skippedFresh: games.length, noKey: false });
    return { attempted: 0, updated: 0, skippedFresh: games.length, noKey: false, covers: 0 };
  }

  const totals = { index: 0, total };
  let covers = 0;

  if (coverQueue.length > 0) {
    covers = await processRetroCovers(coverQueue, send, totals, repo, log);
  }

  const counters = { updated: 0, skippedFresh: 0, misses: 0 };
  if (ratingItems.length > 0) {
    await processSteamRatings(ratingItems, send, totals, counters, repo, log);
  }

  log.line(
    `done · updated=${counters.updated} misses=${counters.misses} covers=${covers} skipped=${counters.skippedFresh} attempted=${total}`
  );
  await log.flush();

  send({
    type: 'done',
    updated: counters.updated,
    covers,
    skippedFresh: counters.skippedFresh,
    noKey: false, // Steam-only — não exige RAWG
  });

  return {
    attempted: total,
    updated: counters.updated,
    skippedFresh: counters.skippedFresh,
    noKey: false,
    covers,
  };
}

export function aggregateForGame(gameId: string) {
  const ratings = getRatingsRepository().listForGame(gameId);
  return RatingAggregator.aggregate(
    ratings.find((r) => r.source === 'metacritic')?.rating ?? null,
    ratings.find((r) => r.source === 'rawg')?.rating ?? null,
    ratings.find((r) => r.source === 'steam')?.rating ?? null
  );
}

export type { RatingsSummary };
