'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  DEFAULT_COLLAPSED_BANDS,
  groupByRatingBands,
  type RatingBandId,
} from '@/lib/rating-bands';

type Tab = 'library' | 'wishlist';
type LibrarySort = 'name' | 'steam';
type WishlistSort = 'name' | 'price' | 'discount';

const DEFAULT_VISIBLE_STORES: Record<string, boolean> = {
  steam: true,
  epic: true,
  gog: true,
  amazon: true,
};

interface PlatformAccount {
  id: string;
  platform: string;
  externalUserId: string;
  displayName: string | null;
  linkedAt: string;
  lastLibrarySyncAt: string | null;
  lastWishlistSyncAt: string | null;
}

interface GameRating {
  id: string;
  source: string;
  rating: number | null;
  reviewCount?: number | null;
}

interface GameDeal {
  id: string;
  source: string;
  currentPrice: number | null;
  regularPrice: number | null;
  currency: string | null;
  cut: number | null;
  shopName: string | null;
  historicalLow: number | null;
  historicalLowShop: string | null;
  url: string | null;
}

interface LibraryGame {
  id: string;
  platform: string;
  externalId: string;
  gameData: string | Record<string, unknown>;
  ratings: GameRating[];
}

interface WishlistGame {
  id: string;
  platform: string;
  externalId: string;
  gameData: string | Record<string, unknown>;
  deals: GameDeal[];
}

const STORES = [
  {
    id: 'steam',
    name: 'Steam',
    shortName: 'Steam',
    loginPath: '/api/platforms/steam/login',
    color: 'bg-[#1b2838] hover:bg-[#2a475e] text-white',
  },
  {
    id: 'epic',
    name: 'Epic',
    shortName: 'Epic',
    loginPath: '/api/platforms/epic/login',
    color: 'bg-[#2f2f2f] hover:bg-[#3f3f3f] text-white',
  },
  {
    id: 'gog',
    name: 'GOG',
    shortName: 'GOG',
    loginPath: '/api/platforms/gog/login',
    color: 'bg-[#86328a] hover:bg-[#9b3fa0] text-white',
  },
  {
    id: 'amazon',
    name: 'Amazon',
    shortName: 'Amazon',
    loginPath: '/api/platforms/amazon/login',
    color: 'bg-[#ff9900] hover:bg-[#ffad33] text-black',
  },
] as const;

function parseGameData(data: string | Record<string, unknown>) {
  return typeof data === 'string' ? JSON.parse(data) : data;
}

function gameTitle(data: Record<string, unknown>) {
  return (data.name || data.title || 'Jogo') as string;
}

function steamAppId(
  platform: string,
  externalId: string,
  data: Record<string, unknown>
): number | null {
  if (platform === 'steam') {
    const n = parseInt(externalId, 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  const raw = data.appid ?? data.steam_appid;
  if (raw !== undefined && raw !== null && raw !== '') {
    const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return null;
}

function steamDbUrl(
  platform: string,
  externalId: string,
  data: Record<string, unknown>
) {
  const appid = steamAppId(platform, externalId, data);
  if (appid) return `https://steamdb.info/app/${appid}/`;
  const title = gameTitle(data);
  return `https://steamdb.info/search/?a=app&q=${encodeURIComponent(title)}`;
}

function GameTitleLink({
  platform,
  externalId,
  data,
}: {
  platform: string;
  externalId: string;
  data: Record<string, unknown>;
}) {
  const title = gameTitle(data);
  return (
    <a
      href={steamDbUrl(platform, externalId, data)}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:text-blue-300 hover:underline underline-offset-2 transition-colors"
      title="Abrir no SteamDB"
    >
      {title}
    </a>
  );
}

function itadDeal(item: WishlistGame) {
  return item.deals?.find((d) => d.source === 'itad') || item.deals?.[0] || null;
}

const FEED_LIMIT = 2;

/** Fração do jogo atual concluída por stage — barra anda a cada mensagem do stream */
const RATING_STAGE_FRAC: Record<string, number> = {
  start: 0.08,
  rawg: 0.22,
  'rawg-done': 0.48,
  'steam-lookup': 0.58,
  'steam-lookup-done': 0.68,
  steam: 0.74,
  'steam-done': 0.85,
  'steam-miss': 0.78,
  save: 0.9,
  'save-done': 0.96,
  error: 1,
};

const RATING_STAGE_LABEL: Record<string, string> = {
  start: 'iniciando…',
  rawg: 'RAWG/Meta…',
  'rawg-done': 'RAWG/Meta ok',
  'steam-lookup': 'Steam AppID…',
  'steam-lookup-done': 'Steam AppID ok',
  steam: 'Steam %…',
  'steam-done': 'Steam % ok',
  'steam-miss': 'sem Steam',
  save: 'gravando…',
  'save-done': 'gravado',
  error: 'erro',
};

const TIMING_BUCKET_LABEL: Record<string, string> = {
  rawg: 'RAWG/Meta',
  steamLookup: 'Steam AppID',
  steam: 'Steam %',
  save: 'Gravar DB',
};

const SLOW_MS = 1200;

function formatDurationMs(ms: number) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function streamPercent(
  gamesDone: number,
  total: number,
  inFlightFrac: Map<string, number>
): number {
  if (total <= 0) return 100;
  let sum = gamesDone;
  for (const frac of inFlightFrac.values()) sum += frac;
  return Math.min(99, Math.max(1, Math.round((sum / total) * 100)));
}

type TimingStat = {
  count: number;
  totalMs: number;
  avgMs: number;
  maxMs: number;
} | null;

type TimingSummary = {
  rawg?: TimingStat;
  steamLookup?: TimingStat;
  steam?: TimingStat;
  save?: TimingStat;
};

function formatRawgDisplay(rawg: number | null): string | null {
  if (rawg === null || rawg <= 0) return null;
  const value = rawg <= 5 ? Math.round(rawg * 20 * 10) / 10 : rawg;
  return String(value);
}

function formatDealPrice(price: number | null, currency: string | null) {
  if (price === null) return null;
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency || 'BRL',
    }).format(price);
  } catch {
    return `${price} ${currency || ''}`.trim();
  }
}

function ratingPreviewLines(
  preview: {
    title?: string;
    matchedName?: string | null;
    rawg?: number | null;
    metacritic?: number | null;
    steam?: number | null;
  }[]
): string[] {
  return preview.map((item) => {
    const title = item.title || 'Jogo';
    const parts: string[] = [];
    if (item.metacritic && item.metacritic > 0) parts.push(`Meta ${item.metacritic}`);
    const rawg = formatRawgDisplay(item.rawg ?? null);
    if (rawg) parts.push(`RAWG ${rawg}`);
    if (item.steam && item.steam > 0) parts.push(`Steam ${item.steam}%`);
    if (parts.length === 0) return `${title} — sem nota`;
    return `${title} · ${parts.join(' · ')}`;
  });
}

function dealPreviewLines(
  preview: {
    title?: string;
    currentPrice?: number | null;
    currency?: string | null;
    cut?: number | null;
    shopName?: string | null;
  }[]
): string[] {
  return preview.map((item) => {
    const title = item.title || 'Jogo';
    const price = formatDealPrice(item.currentPrice ?? null, item.currency ?? null);
    if (!price) return `${title} — sem preço`;
    const bits = [price];
    if (item.cut && item.cut > 0) bits.push(`-${item.cut}%`);
    if (item.shopName) bits.push(item.shopName);
    return `${title} · ${bits.join(' · ')}`;
  });
}

function appendFeed(prev: string[] | undefined, lines: string[]) {
  return [...(prev || []), ...lines].slice(-FEED_LIMIT);
}

function upsertRating(
  ratings: GameRating[],
  source: string,
  rating: number | null,
  tempId: string,
  reviewCount?: number | null
): GameRating[] {
  const idx = ratings.findIndex((r) => r.source === source);
  if (idx >= 0) {
    const next = ratings.slice();
    next[idx] = {
      ...next[idx],
      rating,
      ...(reviewCount !== undefined ? { reviewCount } : {}),
    };
    return next;
  }
  return [
    ...ratings,
    {
      id: tempId,
      source,
      rating,
      ...(reviewCount !== undefined ? { reviewCount } : {}),
    },
  ];
}

function applyLiveRatings(
  game: LibraryGame,
  patch: {
    rawg: number | null;
    metacritic: number | null;
    steam: number | null;
    steamAppId?: number | null;
    reviewCount?: number | null;
  }
): LibraryGame {
  let ratings = game.ratings ? [...game.ratings] : [];
  ratings = upsertRating(ratings, 'metacritic', patch.metacritic, `live-${game.id}-metacritic`);
  ratings = upsertRating(ratings, 'rawg', patch.rawg, `live-${game.id}-rawg`);
  ratings = upsertRating(
    ratings,
    'steam',
    patch.steam,
    `live-${game.id}-steam`,
    patch.reviewCount
  );

  let gameData = game.gameData;
  if (patch.steamAppId) {
    const data = parseGameData(game.gameData);
    gameData = {
      ...data,
      steam_appid: patch.steamAppId,
      steam_appid_resolved: true,
    };
  }

  return { ...game, ratings, gameData };
}

function applyLiveDeal(
  item: WishlistGame,
  patch: {
    currentPrice: number | null;
    regularPrice: number | null;
    currency: string | null;
    cut: number | null;
    shopName: string | null;
    historicalLow: number | null;
    historicalLowShop: string | null;
    url: string | null;
    found: boolean;
  }
): WishlistGame {
  if (!patch.found) return item;

  const deals = item.deals ? [...item.deals] : [];
  const idx = deals.findIndex((d) => d.source === 'itad');
  const nextDeal: GameDeal = {
    id: idx >= 0 ? deals[idx].id : `live-${item.id}-itad`,
    source: 'itad',
    currentPrice: patch.currentPrice,
    regularPrice: patch.regularPrice,
    currency: patch.currency,
    cut: patch.cut,
    shopName: patch.shopName,
    historicalLow: patch.historicalLow,
    historicalLowShop: patch.historicalLowShop,
    url: patch.url,
  };
  if (idx >= 0) deals[idx] = { ...deals[idx], ...nextDeal, id: deals[idx].id };
  else deals.push(nextDeal);
  return { ...item, deals };
}

async function readNdjsonStream(
  response: Response,
  onEvent: (event: Record<string, unknown>) => void | Promise<void>
) {
  if (!response.body) {
    throw new Error('Resposta sem stream');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Não await trabalho pesado aqui — senão o stream "trava" na UI
      await onEvent(JSON.parse(trimmed) as Record<string, unknown>);
    }
  }

  const tail = buffer.trim();
  if (tail) {
    await onEvent(JSON.parse(tail) as Record<string, unknown>);
  }
}

function ratingValue(ratings: GameRating[] | undefined, source: string): number | null {
  const rating = ratings?.find((r) => r.source === source)?.rating;
  if (rating === null || rating === undefined || Number.isNaN(Number(rating))) {
    return null;
  }
  const numeric = Number(rating);
  // 0 / negativo = sem nota útil (API às vezes grava 0)
  if (numeric <= 0) return null;
  if (source === 'rawg' && numeric <= 5) {
    return Math.round(numeric * 20 * 10) / 10;
  }
  return numeric;
}

/** Compare ratings: always push missing scores to the end; tie-break by name. */
function compareByRating(
  a: LibraryGame,
  b: LibraryGame,
  source: 'steam',
  dir: number
) {
  const ar = ratingValue(a.ratings, source);
  const br = ratingValue(b.ratings, source);
  const aMissing = ar === null;
  const bMissing = br === null;

  if (aMissing && bMissing) {
    return gameTitle(parseGameData(a.gameData)).localeCompare(
      gameTitle(parseGameData(b.gameData)),
      'pt-BR'
    );
  }
  // Sem nota sempre no fim, independente de A→Z / maior→menor
  if (aMissing) return 1;
  if (bMissing) return -1;

  if (ar !== br) return (ar - br) * dir;

  return gameTitle(parseGameData(a.gameData)).localeCompare(
    gameTitle(parseGameData(b.gameData)),
    'pt-BR'
  );
}

function pickDisplayRating(
  ratings: GameRating[] | undefined,
  sort: LibrarySort
): { value: number; source: 'steam' } | null {
  const steam = ratingValue(ratings, 'steam');

  if (sort === 'steam' || sort === 'name') {
    return steam !== null ? { value: steam, source: 'steam' } : null;
  }

  return null;
}

function steamReviewCount(ratings: GameRating[] | undefined): number | null {
  const row = ratings?.find((r) => r.source === 'steam');
  if (!row || row.reviewCount === null || row.reviewCount === undefined) {
    return null;
  }
  const n = Number(row.reviewCount);
  return Number.isNaN(n) ? null : n;
}

function formatReviewCount(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}k reviews`;
  }
  return `${n} reviews`;
}

function storeLabel(platform: string) {
  return STORES.find((s) => s.id === platform)?.name || platform.toUpperCase();
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('library');
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [games, setGames] = useState<LibraryGame[]>([]);
  const [wishlist, setWishlist] = useState<WishlistGame[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncingWishlist, setSyncingWishlist] = useState(false);
  const [fetchingRatings, setFetchingRatings] = useState(false);
  const [fetchingDeals, setFetchingDeals] = useState(false);
  const [progress, setProgress] = useState<{
    label: string;
    current: number;
    total: number;
    percent: number;
    tone?: 'emerald' | 'indigo' | 'amber';
    feed?: string[];
    timings?: TimingSummary | null;
    bottleneck?: { label: string; avgMs: number; maxMs: number } | null;
  } | null>(null);
  const [lookingIds, setLookingIds] = useState<string[]>([]);
  const [lookingStages, setLookingStages] = useState<Record<string, string>>({});
  const [freshIds, setFreshIds] = useState<string[]>([]);
  const [lastDailySyncAt, setLastDailySyncAt] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [visibleStores, setVisibleStores] = useState<Record<string, boolean>>(DEFAULT_VISIBLE_STORES);
  const [librarySort, setLibrarySort] = useState<LibrarySort>('steam');
  const [wishlistSort, setWishlistSort] = useState<WishlistSort>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [collapsedBands, setCollapsedBands] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(DEFAULT_COLLAPSED_BANDS.map((id) => [id, true]))
  );

  const toggleStore = (platform: string) => {
    setVisibleStores((prev) => ({ ...prev, [platform]: !prev[platform] }));
  };

  const loadData = useCallback(async () => {
    const [accountsRes, libraryRes, wishlistRes, syncRes] = await Promise.all([
      fetch('/api/platforms'),
      fetch('/api/library'),
      fetch('/api/wishlist'),
      fetch('/api/sync/daily'),
    ]);

    const accountsData = await accountsRes.json();
    const libraryData = await libraryRes.json();
    const wishlistData = await wishlistRes.json();
    const syncData = await syncRes.json();

    setAccounts(accountsData.accounts || []);
    setGames(libraryData.games || []);
    setWishlist(wishlistData.items || []);
    setLastDailySyncAt(syncData.lastDailySyncAt || null);
    return syncData;
  }, []);

  const markFresh = useCallback((id: string) => {
    setFreshIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    window.setTimeout(() => {
      setFreshIds((prev) => prev.filter((x) => x !== id));
    }, 1300);
  }, []);

  const setLooking = useCallback((id: string, active: boolean, stage?: string) => {
    setLookingIds((prev) => {
      if (active) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((x) => x !== id);
    });
    setLookingStages((prev) => {
      if (!active) {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      }
      if (!stage) return prev;
      if (prev[id] === stage) return prev;
      return { ...prev, [id]: stage };
    });
  }, []);

  const clearLooking = useCallback(() => {
    setLookingIds([]);
    setLookingStages({});
  }, []);

  const runRatingsFetch = useCallback(async () => {
    if (games.length === 0) {
      setMessage('Nenhum jogo na biblioteca para buscar notas');
      return;
    }

    setTab('library');
    setLibrarySort('steam');
    setSortDir('desc');
    setFetchingRatings(true);
    clearLooking();
    setFreshIds([]);
    setMessage(null);
    let feed: string[] = [];
    let totalEligible = 0;
    let steamTotal = 0;
    let rawgTotal = 0;
    let steamDone = 0;
    let rawgDone = 0;
    let updated = 0;
    /** Steam primeiro; só depois a UI mostra RAWG/Meta. */
    let uiPhase: 'steam' | 'rawg' = 'steam';
    const inFlightFrac = new Map<string, number>();
    let timingSummary: TimingSummary | null = null;
    let bottleneck: { label: string; avgMs: number; maxMs: number } | null =
      null;
    const timingLog: Array<{ title: string; bucket: string; ms: number }> = [];

    const overallDone = () => (uiPhase === 'rawg' ? rawgDone : steamDone);
    const overallTotal = () =>
      uiPhase === 'rawg'
        ? Math.max(1, rawgTotal)
        : Math.max(1, steamTotal || totalEligible);

    const pushProgress = (
      label: string,
      opts?: {
        done?: boolean;
        timings?: TimingSummary | null;
        bottleneck?: { label: string; avgMs: number; maxMs: number } | null;
      }
    ) => {
      if (opts?.timings !== undefined) timingSummary = opts.timings;
      if (opts?.bottleneck !== undefined) bottleneck = opts.bottleneck;
      const percent = opts?.done
        ? 100
        : Math.min(
            99,
            Math.max(
              2,
              Math.round((overallDone() / overallTotal()) * 100)
            )
          );
      setProgress({
        label,
        current: overallDone(),
        total:
          uiPhase === 'rawg' ? rawgTotal : steamTotal || totalEligible,
        percent,
        tone: uiPhase === 'rawg' ? 'amber' : 'indigo',
        feed,
        timings: timingSummary,
        bottleneck,
      });
    };

    const enterRawgPhase = (label?: string) => {
      if (uiPhase === 'rawg') return;
      uiPhase = 'rawg';
      inFlightFrac.clear();
      clearLooking();
      setFetchingRatings(true);
      const phaseLabel =
        label ||
        (rawgTotal > 0
          ? `RAWG/Meta — ${rawgTotal} jogos`
          : 'RAWG/Meta…');
      if (steamTotal > 0 || steamDone > 0) {
        feed = appendFeed(feed, [
          `Steam ok — ${steamDone || steamTotal} jogos`,
          phaseLabel,
        ]);
      } else {
        feed = appendFeed(feed, [phaseLabel]);
      }
      pushProgress(phaseLabel);
      setMessage(phaseLabel);
    };

    const recordTiming = (event: Record<string, unknown>) => {
      const ms = typeof event.ms === 'number' ? event.ms : null;
      const bucket = typeof event.bucket === 'string' ? event.bucket : null;
      const title = typeof event.title === 'string' ? event.title : null;
      if (ms === null || !bucket || !title) return;
      timingLog.push({ title, bucket, ms });
    };

    setProgress({
      label: 'Preparando busca de notas...',
      current: 0,
      total: 0,
      percent: 2,
      tone: 'indigo',
      feed: [],
      timings: null,
      bottleneck: null,
    });

    try {
      const response = await fetch('/api/ratings/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: false, bypassMissCooldown: true }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setMessage(data.error || 'Falha ao buscar notas');
        return;
      }

      await readNdjsonStream(response, (event) => {
        const type = String(event.type || '');
        const streamMsg =
          typeof event.message === 'string' ? event.message : null;

        if (type === 'error') {
          setMessage(String(event.error || 'Falha ao buscar notas'));
          return;
        }

        if (type === 'meta') {
          totalEligible = Number(event.totalEligible) || 0;
          steamTotal = Number(event.steamTotal) || 0;
          rawgTotal = Number(event.rawgTotal) || 0;
          const skippedFresh = Number(event.skippedFresh) || 0;
          const rawgOnly = Number(event.rawgOnlyAlreadySteam) || 0;
          const metaMsg =
            streamMsg ||
            (steamTotal > 0
              ? `Buscando Steam em ${steamTotal} jogos` +
                (rawgTotal > 0 ? ` · depois RAWG/Meta ${rawgTotal}` : '')
              : totalEligible > 0
                ? `RAWG/Meta em ${rawgTotal} jogos` +
                  (rawgOnly > 0 ? ` (${rawgOnly} já com Steam)` : '')
                : skippedFresh > 0
                  ? `Nenhuma pendente — ${skippedFresh} com nota recente`
                  : 'Nenhuma nota pendente');
          feed = appendFeed(feed, [metaMsg]);
          if (totalEligible === 0) {
            pushProgress(metaMsg, { done: true });
            setMessage(
              skippedFresh > 0
                ? `Nenhuma nota pendente — ${skippedFresh} jogos já têm nota recente`
                : 'Nenhuma nota pendente (já atualizadas nesta semana)'
            );
          } else if (steamTotal === 0 && rawgTotal > 0) {
            // Steam já ok — UI já entra na fase RAWG/Meta
            enterRawgPhase(metaMsg);
          } else {
            pushProgress(metaMsg);
          }
          return;
        }

        if (type === 'phase') {
          const phase = String(event.phase || '');
          if (phase === 'rawg') {
            enterRawgPhase(streamMsg || undefined);
            return;
          }
          const label = streamMsg || 'Buscando reviews Steam…';
          feed = appendFeed(feed, [label]);
          pushProgress(label);
          return;
        }

        if (type === 'looking' || type === 'stage') {
          recordTiming(event);
          const phase = String(event.phase || uiPhase);
          // Só mostra stages da fase ativa na UI
          if (phase === 'rawg' && uiPhase !== 'rawg') return;
          if (phase === 'steam' && uiPhase === 'rawg') return;

          const title = String(event.title || 'Jogo');
          const gameId = typeof event.gameId === 'string' ? event.gameId : null;
          const stage = String(event.stage || 'start');
          const detail = typeof event.detail === 'string' ? event.detail : null;
          const stageLabel = RATING_STAGE_LABEL[stage] || detail || stage;
          const label = streamMsg || `${title} — ${stageLabel}`;

          if (gameId) {
            if (stage === 'error' || stage === 'deferred') {
              setLooking(gameId, false);
            } else {
              setLooking(gameId, true, stageLabel);
            }
          }

          feed = appendFeed(feed, [label]);
          pushProgress(label);
          return;
        }

        if (type === 'item') {
          const gameId = typeof event.gameId === 'string' ? event.gameId : null;
          const phase = String(event.phase || '');
          const current = Number(event.current) || 0;

          const rawg = (event.rawg as number | null) ?? null;
          const metacritic = (event.metacritic as number | null) ?? null;
          const steam = (event.steam as number | null) ?? null;
          const steamAppId = (event.steamAppId as number | null) ?? null;

          if (phase === 'steam') steamDone = current;
          else if (phase === 'rawg') rawgDone = current;
          else steamDone = current;

          if (gameId) {
            setLooking(gameId, false);
            inFlightFrac.delete(gameId);
            setGames((prev) =>
              prev.map((g) => {
                if (g.id !== gameId) return g;
                const existingRawg =
                  g.ratings?.find((r) => r.source === 'rawg')?.rating ?? null;
                const existingMeta =
                  g.ratings?.find((r) => r.source === 'metacritic')?.rating ??
                  null;
                const existingSteam =
                  g.ratings?.find((r) => r.source === 'steam')?.rating ?? null;

                if (phase === 'steam') {
                  return applyLiveRatings(g, {
                    rawg: existingRawg,
                    metacritic: existingMeta,
                    steam,
                    steamAppId,
                    reviewCount:
                      typeof event.reviewCount === 'number'
                        ? event.reviewCount
                        : null,
                  });
                }
                if (phase === 'rawg') {
                  return applyLiveRatings(g, {
                    rawg,
                    metacritic,
                    steam: existingSteam,
                  });
                }
                return applyLiveRatings(g, {
                  rawg,
                  metacritic,
                  steam,
                  steamAppId,
                  reviewCount:
                    typeof event.reviewCount === 'number'
                      ? event.reviewCount
                      : undefined,
                });
              })
            );
            markFresh(gameId);
          }

          updated += 1;

          // Steam items só na UI da Steam; RAWG só depois que a fase UI mudou
          if (phase === 'rawg' && uiPhase !== 'rawg') return;
          if (phase === 'steam' && uiPhase === 'rawg') return;

          const resultLine =
            streamMsg ||
            ratingPreviewLines([
              {
                title: String(event.title || 'Jogo'),
                matchedName: (event.matchedName as string | null) ?? null,
                rawg,
                metacritic,
                steam,
              },
            ])[0];

          feed = appendFeed(feed, [resultLine]);
          pushProgress(
            uiPhase === 'rawg'
              ? `RAWG/Meta: ${rawgDone}/${rawgTotal}`
              : `Steam: ${steamDone}/${steamTotal}`
          );
          return;
        }

        if (type === 'done') {
          updated = Number(event.updated) || updated;
          totalEligible = Number(event.totalEligible) || totalEligible;
          steamDone = Number(event.steamTotal) || steamDone;
          rawgDone = Number(event.rawgTotal) || rawgDone;
          inFlightFrac.clear();
          clearLooking();

          const timings = (event.timings as TimingSummary | undefined) || null;
          const bn = event.bottleneck as
            | {
                label?: string;
                avgMs?: number;
                maxMs?: number;
              }
            | null
            | undefined;
          const bnView =
            bn?.label && typeof bn.avgMs === 'number'
              ? {
                  label: bn.label,
                  avgMs: bn.avgMs,
                  maxMs: typeof bn.maxMs === 'number' ? bn.maxMs : bn.avgMs,
                }
              : null;

          const serverLog = Array.isArray(event.log)
            ? (event.log as Array<{ title: string; bucket: string; ms: number }>)
            : timingLog;

          const logFile =
            typeof event.logFile === 'string' ? event.logFile : null;

          const rows = serverLog.map((row) => ({
            jogo: row.title,
            chamada: TIMING_BUCKET_LABEL[row.bucket] || row.bucket,
            ms: row.ms,
            s: Number((row.ms / 1000).toFixed(2)),
            pass: (row as { pass?: string }).pass || '',
          }));
          console.groupCollapsed(
            `[notas] log de timings (${rows.length} chamadas)` +
              (logFile ? ` · ${logFile}` : '')
          );
          console.table(rows);
          if (timings) console.log('[notas] resumo', timings);
          if (bnView) console.log('[notas] gargalo', bnView);
          if (logFile) console.log('[notas] arquivo', logFile);
          console.groupEnd();

          const doneMsg =
            streamMsg ||
            (updated > 0
              ? `Notas concluídas — ${updated} atualizados`
              : 'Nenhuma nota pendente');
          feed = appendFeed(feed, [doneMsg]);

          pushProgress(doneMsg, {
            done: true,
            timings,
            bottleneck: bnView,
          });
          setMessage(
            bnView
              ? `Notas ok · gargalo: ${bnView.label} (média ${formatDurationMs(bnView.avgMs)})` +
                (logFile ? ` · ${logFile}` : '')
              : updated > 0
                ? `Notas atualizadas em ${updated} jogos` +
                  (logFile ? ` · ${logFile}` : '')
                : 'Nenhuma nota pendente (já atualizadas nesta semana)'
          );
        }
      });

      await loadData();
    } catch {
      setMessage('Erro ao buscar notas');
    } finally {
      setFetchingRatings(false);
      clearLooking();
      setTimeout(() => setProgress(null), 5000);
    }
  }, [games.length, loadData, markFresh, setLooking, clearLooking]);

  const busy = syncing || syncingWishlist || fetchingRatings || fetchingDeals;

  const runDealsFetch = useCallback(async (opts?: { ignoreLocalEmpty?: boolean; force?: boolean }) => {
    if (wishlist.length === 0 && !opts?.ignoreLocalEmpty) {
      setMessage('Wishlist vazia — use Buscar wishlist primeiro');
      return;
    }

    const force = opts?.force ?? true;

    setTab('wishlist');
    setFetchingDeals(true);
    clearLooking();
    setFreshIds([]);
    setMessage('Buscando preços no IsThereAnyDeal...');
    let feed: string[] = [];
    let totalEligible = 0;
    let updated = 0;
    let scanned = 0;

    setProgress({
      label: 'Preparando busca de preços...',
      current: 0,
      total: 0,
      percent: 2,
      tone: 'amber',
      feed: [],
    });

    try {
      const response = await fetch('/api/deals/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setMessage(data.error || 'Falha ao buscar preços');
        return;
      }

      await readNdjsonStream(response, (event) => {
        const type = String(event.type || '');

        if (type === 'error') {
          setMessage(String(event.error || 'Falha ao buscar preços'));
          return;
        }

        if (type === 'meta') {
          totalEligible = Number(event.totalEligible) || 0;
          setProgress({
            label:
              totalEligible > 0
                ? `Preços: 0 de ${totalEligible} itens`
                : 'Nenhum preço pendente',
            current: 0,
            total: totalEligible,
            percent: totalEligible > 0 ? 3 : 100,
            tone: 'amber',
            feed,
          });
          if (totalEligible === 0) {
            setMessage(
              force
                ? 'Wishlist sem itens para precificar'
                : 'Nenhum preço pendente (já atualizados nesta semana)'
            );
          }
          return;
        }

        if (type === 'looking') {
          const title = String(event.title || 'Jogo');
          const itemId = typeof event.itemId === 'string' ? event.itemId : null;
          const current = Number(event.current) || 0;
          const total = Number(event.total) || totalEligible;
          const percent =
            total > 0 ? Math.min(99, Math.round((current / total) * 100)) : 5;

          if (itemId) setLooking(itemId, true, 'ITAD…');

          feed = appendFeed(feed, [`Consultando ${title}…`]);
          setProgress({
            label: `Consultando ${title}…`,
            current,
            total,
            percent: Math.max(percent, 3),
            tone: 'amber',
            feed,
          });
          return;
        }

        if (type === 'item') {
          const itemId = typeof event.itemId === 'string' ? event.itemId : null;
          const current = Number(event.current) || 0;
          const total = Number(event.total) || totalEligible;
          const percent =
            total > 0 ? Math.min(99, Math.round((current / total) * 100)) : 50;

          const found = Boolean(event.found);
          const currentPrice = (event.currentPrice as number | null) ?? null;
          const regularPrice = (event.regularPrice as number | null) ?? null;
          const currency = (event.currency as string | null) ?? null;
          const cut = (event.cut as number | null) ?? null;
          const shopName = (event.shopName as string | null) ?? null;
          const historicalLow = (event.historicalLow as number | null) ?? null;
          const historicalLowShop =
            (event.historicalLowShop as string | null) ?? null;
          const url = (event.url as string | null) ?? null;

          if (itemId) {
            setLooking(itemId, false);
            if (found) {
              setWishlist((prev) =>
                prev.map((w) =>
                  w.id === itemId
                    ? applyLiveDeal(w, {
                        currentPrice,
                        regularPrice,
                        currency,
                        cut,
                        shopName,
                        historicalLow,
                        historicalLowShop,
                        url,
                        found,
                      })
                    : w
                )
              );
              markFresh(itemId);
              updated += 1;
            }
          }

          if (feed.length > 0 && feed[feed.length - 1].startsWith('Consultando ')) {
            feed = feed.slice(0, -1);
          }
          feed = appendFeed(
            feed,
            dealPreviewLines([
              {
                title: String(event.title || 'Jogo'),
                currentPrice,
                currency,
                cut,
                shopName,
              },
            ])
          );

          scanned += 1;
          setProgress({
            label: `Preços: ${current} de ${total || '?'} itens`,
            current,
            total,
            percent: Math.max(percent, 5),
            tone: 'amber',
            feed,
          });
          return;
        }

        if (type === 'done') {
          updated = Number(event.updated) || updated;
          scanned = Number(event.scanned) || scanned;
          totalEligible = Number(event.totalEligible) || totalEligible;
          clearLooking();
          setProgress({
            label: `Preços concluídos (${updated} atualizados)`,
            current: totalEligible || scanned || updated,
            total: totalEligible || scanned || updated,
            percent: 100,
            tone: 'amber',
            feed,
          });
          if (totalEligible === 0 && !force) {
            setMessage('Nenhum preço pendente (já atualizados nesta semana)');
          } else if (updated > 0) {
            setMessage(`Preços atualizados em ${updated} itens`);
          } else if (scanned > 0) {
            setMessage(
              `Consulta concluída em ${scanned} itens — nenhum preço encontrado no ITAD`
            );
          } else {
            setMessage('Nenhum item para buscar preços');
          }
        }
      });

      await loadData();
    } catch {
      setMessage('Erro ao buscar preços');
    } finally {
      setFetchingDeals(false);
      clearLooking();
      setTimeout(() => setProgress(null), 2000);
    }
  }, [wishlist.length, loadData, markFresh, setLooking, clearLooking]);

  const runDailySync = useCallback(
    async (opts: { force?: boolean; stage?: 'library' | 'wishlist' | 'all' } = {}) => {
      const force = opts.force ?? false;
      const stage = opts.stage ?? (force ? 'library' : 'all');

      setSyncing(true);
      setMessage(null);
      try {
        if (!force) {
          const statusRes = await fetch('/api/sync/daily');
          const status = await statusRes.json();
          if (!status.needsSync) {
            setMessage('Já atualizado nesta semana');
            return;
          }
        }

        const label =
          stage === 'wishlist'
            ? 'Buscando wishlists nas lojas...'
            : stage === 'library'
              ? 'Buscando biblioteca nas lojas...'
              : 'Buscando biblioteca e wishlists...';

        setProgress({
          label,
          current: 1,
          total: 1,
          percent: 15,
          tone: 'emerald',
        });
        setMessage(label);

        const response = await fetch('/api/sync/daily', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: true, stage }),
        });
        const data = await response.json();
        await loadData();

        const libErrors = [
          ...(data.results?.library?.errors || []),
          ...(data.results?.wishlist?.errors || []),
        ].filter(Boolean);
        const gameCount = data.results?.library?.gameCount;
        const wishCount = data.results?.wishlist?.itemCount;

        if (data.lastDailySyncAt) {
          setLastDailySyncAt(data.lastDailySyncAt);
        }

        setProgress({
          label: 'Sincronização concluída',
          current: 1,
          total: 1,
          percent: 100,
          tone: 'emerald',
        });

        if (libErrors.length > 0) {
          setMessage(`Sync com avisos: ${libErrors.join(' | ')}`);
        } else if (stage === 'library') {
          setMessage(
            `Biblioteca sincronizada${
              typeof gameCount === 'number' ? ` · ${gameCount} jogos` : ''
            } — use Buscar notas`
          );
        } else if (stage === 'wishlist') {
          setMessage(
            `Wishlist sincronizada${
              typeof wishCount === 'number' ? ` · ${wishCount} itens` : ''
            } — use Buscar preços`
          );
        } else {
          setMessage(
            `Lojas sincronizadas${
              typeof gameCount === 'number' ? ` · ${gameCount} jogos` : ''
            }${
              typeof wishCount === 'number' ? ` · ${wishCount} wishlist` : ''
            }`
          );
        }
      } catch {
        setMessage('Erro ao sincronizar');
        await loadData();
      } finally {
        setSyncing(false);
        setTimeout(() => setProgress(null), 1200);
      }
    },
    [loadData]
  );

  const runWishlistSync = useCallback(async () => {
    setSyncingWishlist(true);
    setMessage(null);
    setProgress({
      label: 'Buscando wishlists nas lojas...',
      current: 1,
      total: 1,
      percent: 20,
      tone: 'emerald',
    });
    setMessage('Buscando wishlists nas lojas...');

    let startDeals = false;

    try {
      const response = await fetch('/api/wishlist', { method: 'POST' });
      const data = await response.json();
      await loadData();

      const wishErrors = [...(data.errors || [])].filter(Boolean);
      const wishCount = Number(data.itemCount) || 0;

      setProgress({
        label: 'Wishlist sincronizada',
        current: 1,
        total: 1,
        percent: 100,
        tone: 'emerald',
      });

      if (wishErrors.length > 0) {
        setMessage(`Wishlist · ${wishCount} itens: ${wishErrors.join(' | ')}`);
      } else {
        setMessage(`Wishlist sincronizada · ${wishCount} itens`);
      }

      startDeals = wishCount > 0;
    } catch {
      setMessage('Erro ao sincronizar wishlist');
      await loadData();
    } finally {
      setSyncingWishlist(false);
      if (!startDeals) {
        setTimeout(() => setProgress(null), 1200);
      }
    }

    if (startDeals) {
      await runDealsFetch({ ignoreLocalEmpty: true, force: true });
    }
  }, [loadData, runDealsFetch]);

  useEffect(() => {
    const linked = searchParams.get('linked');
    const error = searchParams.get('error');
    if (linked) {
      setMessage(`${linked.toUpperCase()} conectada`);
      router.replace('/dashboard');
      runDailySync({ force: true, stage: 'all' });
    } else if (error) {
      setMessage(error);
      router.replace('/dashboard');
    }
  }, [searchParams, router, runDailySync]);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const syncData = await loadData();
      if (syncData.needsSync) {
        await runDailySync({ force: false, stage: 'all' });
      }
    })();
  }, [session, loadData, runDailySync]);

  const unlinkPlatform = async (platform: string) => {
    await fetch('/api/platforms', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform }),
    });
    setMessage(`${platform} desconectada`);
    await loadData();
  };

  const getRatingColor = (rating: number | null) => {
    if (!rating) return 'bg-gray-600';
    if (rating >= 85) return 'bg-green-600';
    if (rating >= 70) return 'bg-yellow-600';
    if (rating >= 50) return 'bg-orange-600';
    return 'bg-red-600';
  };

  const formatPrice = (price: number | null, currency: string | null) => {
    if (price === null) return 'N/A';
    try {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: currency || 'BRL',
      }).format(price);
    } catch {
      return `${price} ${currency || ''}`.trim();
    }
  };

  const accountFor = (platform: string) =>
    accounts.find((a) => a.platform === platform);

  const gamesByPlatform = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const game of games) {
      counts[game.platform] = (counts[game.platform] || 0) + 1;
    }
    return counts;
  }, [games]);

  const wishlistByPlatform = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of wishlist) {
      counts[item.platform] = (counts[item.platform] || 0) + 1;
    }
    return counts;
  }, [wishlist]);

  const visibleGames = useMemo(() => {
    let list = games.filter((g) => visibleStores[g.platform] !== false);

    const dir = sortDir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      if (librarySort === 'name') {
        const an = gameTitle(parseGameData(a.gameData)).toLocaleLowerCase('pt-BR');
        const bn = gameTitle(parseGameData(b.gameData)).toLocaleLowerCase('pt-BR');
        return an.localeCompare(bn, 'pt-BR') * dir;
      }

      const source = 'steam' as const;
      return compareByRating(a, b, source, dir);
    });

    return list;
  }, [games, visibleStores, librarySort, sortDir]);

  const libraryGroups = useMemo(() => {
    if (librarySort !== 'steam') return null;
    const dir = sortDir === 'asc' ? 1 : -1;
    const inputs = visibleGames.map((g) => ({
      id: g.id,
      title: gameTitle(parseGameData(g.gameData)),
      steamRating: ratingValue(g.ratings, 'steam'),
      reviewCount: steamReviewCount(g.ratings),
      game: g,
    }));
    return groupByRatingBands(inputs, dir);
  }, [visibleGames, librarySort, sortDir]);

  const toggleBand = (id: RatingBandId) => {
    setCollapsedBands((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderLibraryCard = (game: LibraryGame) => {
    const data = parseGameData(game.gameData);
    const playtime = Number(data.playtime_forever || 0);
    const display = pickDisplayRating(game.ratings, librarySort);
    const reviews = steamReviewCount(game.ratings);
    const isLooking = lookingIds.includes(game.id);
    const stageLabel = lookingStages[game.id];
    const justUpdated = freshIds.includes(game.id);
    const sourceLabel = display?.source === 'steam' ? 'Steam' : '';
    return (
      <div
        key={game.id}
        className={`bg-gray-700 p-4 rounded-lg transition-[outline,box-shadow,background-color] duration-300 ${
          isLooking ? 'live-looking' : ''
        } ${justUpdated ? 'live-just-updated' : ''}`}
      >
        <div className="flex justify-between items-start gap-3 mb-2">
          <h3 className="font-semibold leading-tight min-w-0 flex-1">
            <GameTitleLink
              platform={game.platform}
              externalId={game.externalId}
              data={data}
            />
          </h3>
          <div className="w-[4.5rem] shrink-0 flex flex-col items-center">
            <div
              className={`w-12 h-8 flex items-center justify-center rounded text-sm font-bold tabular-nums ${
                display
                  ? getRatingColor(display.value)
                  : isLooking
                    ? 'bg-indigo-900/80 text-indigo-200 animate-pulse'
                    : 'bg-gray-600 text-gray-300'
              }`}
            >
              {display
                ? display.source === 'steam'
                  ? `${Math.round(display.value)}%`
                  : display.value
                : isLooking
                  ? '…'
                  : '—'}
            </div>
            <p className="h-4 w-full text-center text-[10px] leading-4 text-indigo-300/90 mt-0.5 truncate">
              {isLooking && stageLabel
                ? stageLabel.replace(/…$/, '')
                : sourceLabel || '\u00A0'}
            </p>
            {reviews !== null && !isLooking && (
              <p className="w-full text-center text-[9px] leading-3 text-gray-500 mt-0.5 truncate">
                {formatReviewCount(reviews)}
              </p>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-400 mb-2">{storeLabel(game.platform)}</p>
        {playtime > 0 && (
          <p className="text-sm text-gray-400 mb-2">
            {Math.floor(playtime / 60)}h jogadas
          </p>
        )}
      </div>
    );
  };

  const visibleWishlist = useMemo(() => {
    const list = wishlist.filter((g) => visibleStores[g.platform] !== false);
    const dir = sortDir === 'asc' ? 1 : -1;

    return [...list].sort((a, b) => {
      const an = gameTitle(parseGameData(a.gameData));
      const bn = gameTitle(parseGameData(b.gameData));
      const nameCmp = an.localeCompare(bn, 'pt-BR');

      if (wishlistSort === 'name') {
        return nameCmp * dir;
      }

      const da = itadDeal(a);
      const db = itadDeal(b);

      if (wishlistSort === 'price') {
        const ap = da?.currentPrice;
        const bp = db?.currentPrice;
        const aMissing = ap === null || ap === undefined;
        const bMissing = bp === null || bp === undefined;
        if (aMissing && bMissing) return nameCmp;
        if (aMissing) return 1;
        if (bMissing) return -1;
        if (ap !== bp) return (Number(ap) - Number(bp)) * dir;
        return nameCmp;
      }

      // discount %
      const ac = da?.cut;
      const bc = db?.cut;
      const aMissing = ac === null || ac === undefined || Number(ac) <= 0;
      const bMissing = bc === null || bc === undefined || Number(bc) <= 0;
      if (aMissing && bMissing) return nameCmp;
      if (aMissing) return 1;
      if (bMissing) return -1;
      if (ac !== bc) return (Number(ac) - Number(bc)) * dir;
      return nameCmp;
    });
  }, [wishlist, visibleStores, wishlistSort, sortDir]);

  const storeToggleButtons = (counts: Record<string, number>) => (
    <div className="flex flex-wrap gap-2">
      {STORES.map((store) => {
        const on = visibleStores[store.id] !== false;
        const count = counts[store.id] || 0;
        return (
          <button
            key={store.id}
            type="button"
            onClick={() => toggleStore(store.id)}
            aria-pressed={on}
            className={`inline-flex items-center whitespace-nowrap text-sm font-medium h-9 px-3 rounded-lg border transition-colors ${
              on
                ? `${store.color} border-transparent`
                : 'bg-transparent border-gray-600 text-gray-500 hover:border-gray-400 hover:text-gray-300'
            }`}
          >
            {store.shortName}
            <span className={`ml-1.5 ${on ? 'opacity-90' : 'opacity-60'}`}>({count})</span>
          </button>
        );
      })}
    </div>
  );

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Carregando...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <h1 className="text-3xl font-bold mb-4">Game Aggregator</h1>
          <p className="text-gray-400 mb-6">
            Login com Google é obrigatório para conectar suas lojas de jogos.
          </p>
          <button
            onClick={() => signIn('google')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            Entrar com Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-gray-400">Bem-vindo, {session.user?.name}</p>
            <p className="text-xs text-gray-500 mt-1">
              Última atualização:{' '}
              {lastDailySyncAt
                ? new Date(lastDailySyncAt).toLocaleString('pt-BR')
                : 'nunca'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => runDailySync({ force: true, stage: 'library' })}
              disabled={busy}
              className="bg-emerald-700 hover:bg-emerald-600 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded"
            >
              {syncing ? 'Buscando biblioteca...' : 'Buscar jogos'}
            </button>
            <button
              onClick={() => runWishlistSync()}
              disabled={busy}
              className="bg-teal-700 hover:bg-teal-600 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded"
            >
              {syncingWishlist ? 'Buscando wishlist...' : 'Buscar wishlist'}
            </button>
            <button
              onClick={() => runRatingsFetch()}
              disabled={busy || games.length === 0}
              className="bg-indigo-700 hover:bg-indigo-600 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded"
            >
              {fetchingRatings ? 'Buscando notas...' : 'Buscar notas'}
            </button>
            <button
              onClick={() => runDealsFetch()}
              disabled={busy || wishlist.length === 0}
              className="bg-amber-700 hover:bg-amber-600 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded"
            >
              {fetchingDeals ? 'Buscando preços...' : 'Buscar preços'}
            </button>
            <button
              onClick={() => signOut()}
              className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded"
            >
              Sair
            </button>
          </div>
        </div>

        {progress && (
          <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-gray-200 truncate font-medium">{progress.label}</span>
              <span className="text-gray-400 tabular-nums shrink-0">
                {progress.total > 0
                  ? `${progress.current}/${progress.total}`
                  : `${progress.percent}%`}
                {progress.total > 0 ? ` · ${progress.percent}%` : ''}
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-gray-700 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ease-out ${
                  progress.tone === 'amber'
                    ? 'bg-amber-500'
                    : progress.tone === 'indigo' || fetchingRatings
                      ? 'bg-indigo-500'
                      : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
              />
            </div>
            {progress.bottleneck && (
              <p className="text-xs text-amber-300/90">
                Gargalo:{' '}
                <span className="font-semibold">{progress.bottleneck.label}</span>
                {' · '}média {formatDurationMs(progress.bottleneck.avgMs)}
                {' · '}máx {formatDurationMs(progress.bottleneck.maxMs)}
              </p>
            )}
            {progress.timings && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] tabular-nums">
                {(
                  [
                    ['steam', 'Steam %'],
                    ['steamLookup', 'Steam AppID'],
                    ['save', 'Gravar DB'],
                  ] as const
                ).map(([key, name]) => {
                  const stat = progress.timings?.[key];
                  if (!stat) {
                    return (
                      <div
                        key={key}
                        className="rounded bg-gray-900/50 px-2 py-1.5 text-gray-600"
                      >
                        {name}
                        <div className="text-gray-600">—</div>
                      </div>
                    );
                  }
                  const hot =
                    progress.bottleneck?.label === name ||
                    stat.avgMs >= SLOW_MS;
                  return (
                    <div
                      key={key}
                      className={`rounded px-2 py-1.5 ${
                        hot
                          ? 'bg-amber-950/60 text-amber-200 ring-1 ring-amber-700/50'
                          : 'bg-gray-900/50 text-gray-400'
                      }`}
                    >
                      {name}
                      <div className="text-gray-200">
                        ~{formatDurationMs(stat.avgMs)}
                        <span className="text-gray-500">
                          {' '}
                          / máx {formatDurationMs(stat.maxMs)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {progress.feed && progress.feed.length > 0 && (
              <ul className="border-t border-gray-700/80 pt-2 font-mono text-[11px] leading-snug text-gray-400 space-y-0.5">
                {progress.feed.map((line, idx) => {
                  const isLatest = idx === progress.feed!.length - 1;
                  return (
                    <li
                      key={`${idx}-${line.slice(0, 48)}`}
                      className={`truncate ${isLatest ? 'text-gray-300' : 'text-gray-500'}`}
                      title={line}
                    >
                      <span className="text-indigo-400/70 mr-1.5">›</span>
                      {line}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {message && (
          <div className="bg-gray-800 border border-gray-700 text-sm text-gray-300 px-4 py-2 rounded">
            {message}
          </div>
        )}

        <section className="bg-gray-800/80 px-4 py-3 rounded-lg">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="text-sm font-semibold text-gray-300">Lojas</h2>
            <p className="text-xs text-gray-500 hidden sm:block">
              Conecte para sincronizar a biblioteca
            </p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {STORES.map((store) => {
              const linked = accountFor(store.id);
              const count = gamesByPlatform[store.id] || 0;
              return (
                <div
                  key={store.id}
                  className="bg-gray-700/40 rounded-lg px-3 py-2 flex items-center justify-between gap-2 min-h-[44px] overflow-hidden"
                >
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <p className="text-sm font-medium truncate">{store.name}</p>
                    {linked ? (
                      <p className="text-xs text-green-400 truncate">
                        {count} jogos
                        {linked.displayName && linked.displayName !== linked.externalUserId
                          ? ` · ${linked.displayName}`
                          : ''}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-500">Não conectada</p>
                    )}
                  </div>
                  {linked ? (
                    <button
                      onClick={() => unlinkPlatform(store.id)}
                      className="text-[11px] text-red-400/80 hover:text-red-300 shrink-0 whitespace-nowrap"
                      title="Desconectar"
                    >
                      Sair
                    </button>
                  ) : (
                    <a
                      href={store.loginPath}
                      className={`${store.color} inline-flex items-center justify-center h-7 px-2.5 text-xs font-semibold rounded shrink-0 whitespace-nowrap`}
                    >
                      Entrar
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <div className="flex gap-2 border-b border-gray-700 pb-2">
          <button
            onClick={() => setTab('library')}
            className={`px-4 py-2 rounded-t font-medium ${
              tab === 'library' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Biblioteca ({games.length})
          </button>
          <button
            onClick={() => setTab('wishlist')}
            className={`px-4 py-2 rounded-t font-medium ${
              tab === 'wishlist' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Wishlist ({wishlist.length})
          </button>
        </div>

        {tab === 'library' && (
          <section className="bg-gray-800 p-6 rounded-lg">
            <div className="flex flex-col gap-4 mb-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-sm text-gray-400">
                    Jogos que você tem — nota Steam %
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Mostrando {visibleGames.length} de {games.length}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <label className="text-xs text-gray-400 flex flex-col gap-1">
                    Ordenar por
                    <select
                      value={librarySort}
                      onChange={(e) => {
                        const next = e.target.value as LibrarySort;
                        setLibrarySort(next);
                        // Notas: maior → menor; nome: A → Z
                        setSortDir(next === 'name' ? 'asc' : 'desc');
                      }}
                      className="bg-gray-700 text-white text-sm rounded px-3 py-2 min-w-[160px]"
                    >
                      <option value="steam">Reviews Steam %</option>
                      <option value="name">Nome</option>
                    </select>
                  </label>
                  <label className="text-xs text-gray-400 flex flex-col gap-1">
                    Direção
                    <select
                      value={sortDir}
                      onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')}
                      className="bg-gray-700 text-white text-sm rounded px-3 py-2 min-w-[140px]"
                    >
                      {librarySort === 'name' ? (
                        <>
                          <option value="asc">A → Z</option>
                          <option value="desc">Z → A</option>
                        </>
                      ) : (
                        <>
                          <option value="desc">Maior → menor</option>
                          <option value="asc">Menor → maior</option>
                        </>
                      )}
                    </select>
                  </label>
                </div>
              </div>
              {storeToggleButtons(gamesByPlatform)}
            </div>

            {games.length === 0 ? (
              <p className="text-gray-400">
                Conecte uma loja e clique em Buscar jogos.
              </p>
            ) : visibleGames.length === 0 ? (
              <p className="text-gray-400">Nenhuma loja visível — ative pelo menos uma acima.</p>
            ) : libraryGroups ? (
              <div className="flex flex-col gap-4">
                {libraryGroups.map((group) => {
                  const collapsed = !!collapsedBands[group.id];
                  return (
                    <div key={group.id}>
                      <button
                        type="button"
                        onClick={() => toggleBand(group.id)}
                        aria-expanded={!collapsed}
                        className="w-full flex items-center justify-between gap-3 text-left px-3 py-2 rounded-lg bg-gray-700/40 hover:bg-gray-700/80 border border-gray-700 text-sm font-medium text-gray-200"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="text-gray-500 tabular-nums w-4 shrink-0">
                            {collapsed ? '▸' : '▾'}
                          </span>
                          <span className="truncate">{group.label}</span>
                          <span className="text-gray-500 font-normal shrink-0">
                            · {group.games.length}
                          </span>
                        </span>
                      </button>
                      {!collapsed && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
                          {group.games.map((item) =>
                            renderLibraryCard(item.game)
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleGames.map((game) => renderLibraryCard(game))}
              </div>
            )}
          </section>
        )}

        {tab === 'wishlist' && (
          <section className="bg-gray-800 p-6 rounded-lg">
            <div className="flex flex-col gap-4 mb-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-sm text-gray-400">
                    Wishlist — Steam (pública) + GOG + ITAD. Epic/Amazon ainda sem API.
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Mostrando {visibleWishlist.length} de {wishlist.length}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <label className="text-xs text-gray-400 flex flex-col gap-1">
                    Ordenar por
                    <select
                      value={wishlistSort}
                      onChange={(e) => {
                        const next = e.target.value as WishlistSort;
                        setWishlistSort(next);
                        setSortDir(
                          next === 'discount' ? 'desc' : next === 'price' ? 'asc' : 'asc'
                        );
                      }}
                      className="bg-gray-700 text-white text-sm rounded px-3 py-2 min-w-[160px]"
                    >
                      <option value="name">Nome</option>
                      <option value="price">Preço</option>
                      <option value="discount">% desconto</option>
                    </select>
                  </label>
                  <label className="text-xs text-gray-400 flex flex-col gap-1">
                    Direção
                    <select
                      value={sortDir}
                      onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')}
                      className="bg-gray-700 text-white text-sm rounded px-3 py-2 min-w-[140px]"
                    >
                      {wishlistSort === 'name' ? (
                        <>
                          <option value="asc">A → Z</option>
                          <option value="desc">Z → A</option>
                        </>
                      ) : wishlistSort === 'price' ? (
                        <>
                          <option value="asc">Mais barato</option>
                          <option value="desc">Mais caro</option>
                        </>
                      ) : (
                        <>
                          <option value="desc">Maior %</option>
                          <option value="asc">Menor %</option>
                        </>
                      )}
                    </select>
                  </label>
                </div>
              </div>
              {storeToggleButtons(wishlistByPlatform)}
            </div>
            {wishlist.length === 0 ? (
              <p className="text-gray-400">
                Nenhum item ainda. Torne a wishlist Steam pública e use Buscar wishlist.
              </p>
            ) : visibleWishlist.length === 0 ? (
              <p className="text-gray-400">Nenhuma loja visível — ative pelo menos uma acima.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleWishlist.map((item) => {
                  const data = parseGameData(item.gameData);
                  const deal = itadDeal(item);
                  const hasCut = !!deal?.cut && deal.cut > 0;
                  const isLooking = lookingIds.includes(item.id);
                  const justUpdated = freshIds.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`bg-gray-700 p-4 rounded-lg transition-[outline,box-shadow,background-color] duration-300 ${
                        isLooking ? 'live-looking' : ''
                      } ${justUpdated ? 'live-just-updated' : ''}`}
                    >
                      <div className="flex justify-between items-start gap-3 mb-2">
                        <h3 className="font-semibold leading-tight min-w-0 flex-1">
                          <GameTitleLink
                            platform={item.platform}
                            externalId={item.externalId}
                            data={data}
                          />
                        </h3>
                        {hasCut ? (
                          <span className="shrink-0 text-xs font-bold bg-green-800 text-green-100 px-2 py-1 rounded tabular-nums">
                            -{deal!.cut}%
                          </span>
                        ) : isLooking ? (
                          <span className="shrink-0 text-[10px] text-amber-300/90 animate-pulse px-1">
                            buscando…
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-gray-400 mb-3">{storeLabel(item.platform)}</p>
                      {deal && deal.currentPrice !== null ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-0.5">
                                Atual
                              </p>
                              <p className="text-lg font-semibold text-green-400 tabular-nums leading-tight">
                                {formatPrice(deal.currentPrice, deal.currency)}
                              </p>
                              {deal.regularPrice !== null &&
                                deal.regularPrice > (deal.currentPrice || 0) && (
                                  <p className="text-xs text-gray-500 line-through tabular-nums">
                                    {formatPrice(deal.regularPrice, deal.currency)}
                                  </p>
                                )}
                              {deal.shopName && (
                                <p className="text-xs text-gray-400 mt-0.5 truncate">
                                  {deal.shopName}
                                </p>
                              )}
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-0.5">
                                Mín. histórico
                              </p>
                              {deal.historicalLow !== null ? (
                                <>
                                  <p className="text-lg font-semibold text-sky-300 tabular-nums leading-tight">
                                    {formatPrice(deal.historicalLow, deal.currency)}
                                  </p>
                                  {deal.historicalLowShop && (
                                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                                      {deal.historicalLowShop}
                                    </p>
                                  )}
                                </>
                              ) : (
                                <p className="text-lg font-semibold text-gray-500 tabular-nums leading-tight">
                                  —
                                </p>
                              )}
                            </div>
                          </div>
                          {deal.url && (
                            <a
                              href={deal.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-400 hover:underline inline-block"
                            >
                              Ver no ITAD
                            </a>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400">
                          Sem preço — use Buscar preços
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
