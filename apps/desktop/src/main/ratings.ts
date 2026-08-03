import { RAWGAPI, RatingAggregator, SteamAPI } from '@gagg/providers-meta';
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

const RAWG_TTL_MS = 7 * 24 * 3600 * 1000;
const CONCURRENCY = 4;

function rawgKey(): string {
  return process.env.RAWG_API_KEY ?? getSetting('keys.rawg') ?? '';
}

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

/** Índice em memória a partir de 1 SELECT em ratings. */
function buildRatingsIndex(freshMs: number): {
  useful: Set<string>;
  fresh: Set<string>;
  seen: Set<string>;
} {
  const useful = new Set<string>();
  const fresh = new Set<string>();
  const seen = new Set<string>();
  const latest = new Map<string, number>();

  for (const r of getRatingsRepository().listAll()) {
    seen.add(r.gameId);
    if (r.rating != null && r.rating > 0) useful.add(r.gameId);
    if (!r.lastUpdated) continue;
    const t = new Date(r.lastUpdated).getTime();
    if (Number.isNaN(t)) continue;
    const prev = latest.get(r.gameId) ?? 0;
    if (t > prev) latest.set(r.gameId, t);
  }
  const now = Date.now();
  for (const [gameId, t] of latest) {
    if (now - t < freshMs) fresh.add(gameId);
  }
  return { useful, fresh, seen };
}

/**
 * Precisa enriquecer se:
 * - falta capa
 * - nunca tentou nota
 * - não-retro sem Steam AppID (e ainda não tentou buscar)
 * - notas com mais de 7 dias
 */
function needsWork(
  game: Game,
  force: boolean,
  index?: { useful: Set<string>; fresh: Set<string>; seen: Set<string> }
): { any: boolean; cover: boolean; ratings: boolean; findSteamId: boolean; priority: number } {
  const cover = needsCoverDownload(game);
  if (force) {
    return {
      any: true,
      cover,
      ratings: true,
      findSteamId: !isRetroOnly(game),
      priority: cover ? 0 : 1,
    };
  }

  const neverTried = index ? !index.seen.has(game.id) : true;
  const missingUseful = index ? !index.useful.has(game.id) : true;
  const stale = index ? index.seen.has(game.id) && !index.fresh.has(game.id) : true;
  // Sem nota útil: só busca se nunca tentou; se tentou e falhou, espera TTL
  const ratings = neverTried || (missingUseful && stale) || (!missingUseful && stale);
  const findSteamId =
    !isRetroOnly(game) && !resolveSteamAppIdForGame(game) && !isSteamLookupDone(game.id);
  const any = cover || ratings || findSteamId;
  let priority = 9;
  if (cover) priority = 0;
  else if (neverTried) priority = 1;
  else if (findSteamId) priority = 2;
  else if (stale) priority = 3;
  return { any, cover, ratings, findSteamId, priority };
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

/** Resolve e persiste Steam AppID (não-retro). Retorna o appid se houver. */
async function ensureSteamAppId(game: Game, findSteamId: boolean): Promise<string | null> {
  if (isRetroOnly(game)) return null;
  let appid = resolveSteamAppIdForGame(game);
  if (appid || !findSteamId) return appid;

  const steam = new SteamAPI();
  const title = game.title;
  try {
    const found = await cachedGetJson(
      `steam:find:${title.toLowerCase().trim()}`,
      RAWG_TTL_MS,
      async () => steam.findAppIdByTitle(title)
    );
    if (found.appid) {
      appid = String(found.appid);
      setResolvedSteamAppId(game.id, appid);
    }
  } catch {
    // ignore
  }
  markSteamLookupDone(game.id);
  return appid;
}

async function enrichGameRatings(
  game: Game,
  findSteamId: boolean
): Promise<{ skipped: boolean }> {
  const key = rawgKey();
  if (!key) return { skipped: true };

  const ratingsRepo = getRatingsRepository();
  const rawg = new RAWGAPI(key);
  const steam = new SteamAPI();
  const title = game.title;

  try {
    const rawgRes = await cachedGetJson(
      `rawg:title:${title.toLowerCase().trim()}`,
      RAWG_TTL_MS,
      async () => rawg.resolveRatingsForTitle(title)
    );

    const appid = await ensureSteamAppId(game, findSteamId);
    let steamPercent: number | null = null;
    let steamCount: number | null = null;

    if (appid && !isRetroOnly(game)) {
      const score = await steam.getReviewScore(appid);
      steamPercent = score.percent;
      steamCount = score.totalReviews > 0 ? score.totalReviews : null;
    }

    ratingsRepo.upsert({
      gameId: game.id,
      source: 'rawg',
      rating: rawgRes.rawg,
      reviewCount: null,
      matchedName: rawgRes.matchedName,
    });
    ratingsRepo.upsert({
      gameId: game.id,
      source: 'metacritic',
      rating: rawgRes.metacritic,
      reviewCount: null,
      matchedName: rawgRes.matchedName,
    });
    if (!isRetroOnly(game)) {
      ratingsRepo.upsert({
        gameId: game.id,
        source: 'steam',
        rating: steamPercent,
        reviewCount: steamCount,
        matchedName: appid ? `Steam App ${appid}` : null,
      });
    }
  } catch {
    for (const source of ['rawg', 'metacritic', 'steam'] as const) {
      if (source === 'steam' && isRetroOnly(game)) continue;
      ratingsRepo.upsert({
        gameId: game.id,
        source,
        rating: null,
        reviewCount: null,
        matchedName: null,
      });
    }
  }
  return { skipped: false };
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
  repo: ReturnType<typeof getLibraryRepository>
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

async function processRatingsOnly(
  items: Array<{ game: Game; work: ReturnType<typeof needsWork> }>,
  send: (event: EnrichEvent) => void,
  totals: { index: number; total: number },
  counters: { updated: number; skippedFresh: number },
  repo: ReturnType<typeof getLibraryRepository>
): Promise<void> {
  await mapPool(items, CONCURRENCY, async ({ game, work }) => {
    if (work.findSteamId) {
      await ensureSteamAppId(game, true);
    }

    let skipped = true;
    if (work.ratings) {
      const result = await enrichGameRatings(game, work.findSteamId);
      skipped = result.skipped;
      if (skipped) counters.skippedFresh += 1;
      else counters.updated += 1;
    } else if (work.findSteamId) {
      const appid = await ensureSteamAppId(game, true);
      if (appid) {
        try {
          const steam = new SteamAPI();
          const score = await steam.getReviewScore(appid);
          getRatingsRepository().upsert({
            gameId: game.id,
            source: 'steam',
            rating: score.percent,
            reviewCount: score.totalReviews > 0 ? score.totalReviews : null,
            matchedName: `Steam App ${appid}`,
          });
          counters.updated += 1;
          skipped = false;
        } catch {
          counters.skippedFresh += 1;
        }
      } else {
        counters.skippedFresh += 1;
      }
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
      title: `Nota · ${game.title}`,
      coverOk: Boolean(fresh?.coverPath || fresh?.coverUrl),
      coverPath: fresh?.coverPath ?? null,
      summary: getRatingsRepository().summaryForGame(game.id),
      skipped,
    });
  });
}

/**
 * Ordem fixa:
 * 1) capas retro (Libretro)
 * 2) notas (retro primeiro, depois lojas) + Steam AppID
 */
export async function streamEnrichLibrary(
  send: (event: EnrichEvent) => void,
  opts?: { gameIds?: string[]; force?: boolean; maxGames?: number }
): Promise<RatingsSyncResult & { covers: number }> {
  const key = rawgKey();
  const repo = getLibraryRepository();
  let games = repo.list();
  if (opts?.gameIds?.length) {
    const set = new Set(opts.gameIds);
    games = games.filter((g) => set.has(g.id));
  }

  const force = Boolean(opts?.force);
  const index = force ? undefined : buildRatingsIndex(RAWG_TTL_MS);
  const maxGames = opts?.maxGames && opts.maxGames > 0 ? opts.maxGames : undefined;

  // Fase 1 — todas as capas retro faltantes (antes de qualquer nota)
  let coverQueue = games.filter((g) => needsCoverDownload(g)).sort(sortRetroFirst);
  if (maxGames && coverQueue.length > maxGames) {
    coverQueue = coverQueue.slice(0, maxGames);
  }

  // Fase 2 — notas / steam id (retro primeiro)
  let ratingItems = games
    .map((g) => ({ game: g, work: needsWork(g, force, index) }))
    .filter((x) => x.work.ratings || x.work.findSteamId)
    .sort((a, b) => sortRetroFirst(a.game, b.game));

  if (maxGames) {
    // reserva espaço: capas já contam; notas no restante
    const ratingBudget = Math.max(0, maxGames - coverQueue.length);
    if (ratingItems.length > ratingBudget) {
      ratingItems = ratingItems.slice(0, ratingBudget);
    }
  }

  const total = coverQueue.length + ratingItems.length;
  send({ type: 'start', total });

  if (total === 0) {
    send({ type: 'done', updated: 0, covers: 0, skippedFresh: 0, noKey: !key });
    return { attempted: 0, updated: 0, skippedFresh: 0, noKey: !key, covers: 0 };
  }

  const totals = { index: 0, total };
  let covers = 0;

  if (coverQueue.length > 0) {
    covers = await processRetroCovers(coverQueue, send, totals, repo);
  }

  const counters = { updated: 0, skippedFresh: 0 };
  if (ratingItems.length > 0) {
    if (!key) {
      // sem RAWG: marca restantes como skipped (capas já feitas)
      for (const { game } of ratingItems) {
        const current = ++totals.index;
        send({
          type: 'item',
          index: current,
          total,
          gameId: game.id,
          title: `Nota · ${game.title}`,
          coverOk: Boolean(game.coverPath || game.coverUrl),
          coverPath: game.coverPath ?? null,
          summary: getRatingsRepository().summaryForGame(game.id),
          skipped: true,
        });
        counters.skippedFresh += 1;
      }
    } else {
      await processRatingsOnly(ratingItems, send, totals, counters, repo);
    }
  }

  send({
    type: 'done',
    updated: counters.updated,
    covers,
    skippedFresh: counters.skippedFresh,
    noKey: !key,
  });

  return {
    attempted: total,
    updated: counters.updated,
    skippedFresh: counters.skippedFresh,
    noKey: !key,
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
