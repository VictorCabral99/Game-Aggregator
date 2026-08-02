'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';

type Tab = 'library' | 'wishlist';
type LibrarySort = 'name' | 'rawg' | 'metacritic' | 'steam';
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
    loginPath: '/api/platforms/steam/login',
    color: 'bg-[#1b2838] hover:bg-[#2a475e] text-white',
  },
  {
    id: 'epic',
    name: 'Epic Games',
    loginPath: '/api/platforms/epic/login',
    color: 'bg-[#2f2f2f] hover:bg-[#3f3f3f] text-white',
  },
  {
    id: 'gog',
    name: 'GOG',
    loginPath: '/api/platforms/gog/login',
    color: 'bg-[#86328a] hover:bg-[#9b3fa0] text-white',
  },
  {
    id: 'amazon',
    name: 'Amazon Games',
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

const FEED_LIMIT = 4;

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
  source: 'rawg' | 'metacritic' | 'steam',
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
): { value: number; source: 'rawg' | 'metacritic' | 'steam' } | null {
  const rawg = ratingValue(ratings, 'rawg');
  const metacritic = ratingValue(ratings, 'metacritic');
  const steam = ratingValue(ratings, 'steam');

  if (sort === 'rawg') {
    return rawg !== null ? { value: rawg, source: 'rawg' } : null;
  }
  if (sort === 'metacritic') {
    return metacritic !== null ? { value: metacritic, source: 'metacritic' } : null;
  }
  if (sort === 'steam') {
    return steam !== null ? { value: steam, source: 'steam' } : null;
  }

  // Por nome: mostra a maior nota disponível (todas na escala ~0–100)
  const candidates: { value: number; source: 'rawg' | 'metacritic' | 'steam' }[] =
    [];
  if (metacritic !== null) candidates.push({ value: metacritic, source: 'metacritic' });
  if (rawg !== null) candidates.push({ value: rawg, source: 'rawg' });
  if (steam !== null) candidates.push({ value: steam, source: 'steam' });
  if (candidates.length === 0) return null;
  return candidates.reduce((best, cur) => (cur.value > best.value ? cur : best));
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
  const [fetchingRatings, setFetchingRatings] = useState(false);
  const [fetchingDeals, setFetchingDeals] = useState(false);
  const [progress, setProgress] = useState<{
    label: string;
    current: number;
    total: number;
    percent: number;
    tone?: 'emerald' | 'indigo' | 'amber';
    feed?: string[];
  } | null>(null);
  const [lastDailySyncAt, setLastDailySyncAt] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [visibleStores, setVisibleStores] = useState<Record<string, boolean>>(DEFAULT_VISIBLE_STORES);
  const [librarySort, setLibrarySort] = useState<LibrarySort>('name');
  const [wishlistSort, setWishlistSort] = useState<WishlistSort>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

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

  const runRatingsFetch = useCallback(async () => {
    if (games.length === 0) {
      setMessage('Nenhum jogo na biblioteca para buscar notas');
      return;
    }

    setFetchingRatings(true);
    setMessage('Buscando notas no RAWG e Metacritic...');
    let feed: string[] = [];
    let totalEligible = 0;
    let updated = 0;
    let itemsSinceReload = 0;

    setProgress({
      label: 'Preparando busca de notas...',
      current: 0,
      total: 0,
      percent: 2,
      tone: 'indigo',
      feed: [],
    });

    try {
      const response = await fetch('/api/ratings/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: false }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setMessage(data.error || 'Falha ao buscar notas');
        return;
      }

      await readNdjsonStream(response, async (event) => {
        const type = String(event.type || '');

        if (type === 'error') {
          setMessage(String(event.error || 'Falha ao buscar notas'));
          return;
        }

        if (type === 'meta') {
          totalEligible = Number(event.totalEligible) || 0;
          setProgress({
            label:
              totalEligible > 0
                ? `Notas: 0 de ${totalEligible} jogos`
                : 'Nenhuma nota pendente',
            current: 0,
            total: totalEligible,
            percent: totalEligible > 0 ? 3 : 100,
            tone: 'indigo',
            feed,
          });
          return;
        }

        if (type === 'looking') {
          const title = String(event.title || 'Jogo');
          const current = Number(event.current) || 0;
          const total = Number(event.total) || totalEligible;
          const percent =
            total > 0 ? Math.min(99, Math.round(((current - 1) / total) * 100)) : 5;

          feed = appendFeed(feed, [`Consultando ${title}…`]);
          setProgress({
            label: `Consultando ${title}…`,
            current: Math.max(0, current - 1),
            total,
            percent: Math.max(percent, 3),
            tone: 'indigo',
            feed,
          });
          setMessage(`Consultando ${title}…`);
          return;
        }

        if (type === 'item') {
          const current = Number(event.current) || 0;
          const total = Number(event.total) || totalEligible;
          const percent =
            total > 0 ? Math.min(99, Math.round((current / total) * 100)) : 50;

          // Troca o "Consultando…" pelo resultado
          if (feed.length > 0 && feed[feed.length - 1].startsWith('Consultando ')) {
            feed = feed.slice(0, -1);
          }
          feed = appendFeed(
            feed,
            ratingPreviewLines([
              {
                title: String(event.title || 'Jogo'),
                matchedName: (event.matchedName as string | null) ?? null,
                rawg: (event.rawg as number | null) ?? null,
                metacritic: (event.metacritic as number | null) ?? null,
                steam: (event.steam as number | null) ?? null,
              },
            ])
          );

          updated += 1;
          itemsSinceReload += 1;
          setProgress({
            label: `Notas: ${current} de ${total || '?'} jogos`,
            current,
            total,
            percent: Math.max(percent, 5),
            tone: 'indigo',
            feed,
          });

          if (itemsSinceReload >= 5) {
            itemsSinceReload = 0;
            await loadData();
          }
          return;
        }

        if (type === 'done') {
          updated = Number(event.updated) || updated;
          totalEligible = Number(event.totalEligible) || totalEligible;
          setProgress({
            label: `Notas concluídas (${updated} atualizados)`,
            current: totalEligible || updated,
            total: totalEligible || updated,
            percent: 100,
            tone: 'indigo',
            feed,
          });
          setMessage(
            updated > 0
              ? `Notas atualizadas em ${updated} jogos`
              : 'Nenhuma nota pendente (já atualizadas nesta semana)'
          );
        }
      });

      await loadData();
    } catch {
      setMessage('Erro ao buscar notas');
    } finally {
      setFetchingRatings(false);
      setTimeout(() => setProgress(null), 2000);
    }
  }, [games.length, loadData]);

  const busy = syncing || fetchingRatings || fetchingDeals;

  const runDealsFetch = useCallback(async () => {
    if (wishlist.length === 0) {
      setMessage('Wishlist vazia — busque jogos nas lojas primeiro');
      return;
    }

    setFetchingDeals(true);
    setMessage('Buscando preços no IsThereAnyDeal...');
    let feed: string[] = [];
    let totalEligible = 0;
    let updated = 0;
    let itemsSinceReload = 0;

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
        body: JSON.stringify({ force: false }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setMessage(data.error || 'Falha ao buscar preços');
        return;
      }

      await readNdjsonStream(response, async (event) => {
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
          return;
        }

        if (type === 'looking') {
          const title = String(event.title || 'Jogo');
          const current = Number(event.current) || 0;
          const total = Number(event.total) || totalEligible;
          const percent =
            total > 0 ? Math.min(99, Math.round(((current - 1) / total) * 100)) : 5;

          feed = appendFeed(feed, [`Consultando ${title}…`]);
          setProgress({
            label: `Consultando ${title}…`,
            current: Math.max(0, current - 1),
            total,
            percent: Math.max(percent, 3),
            tone: 'amber',
            feed,
          });
          setMessage(`Consultando ${title}…`);
          return;
        }

        if (type === 'item') {
          const current = Number(event.current) || 0;
          const total = Number(event.total) || totalEligible;
          const percent =
            total > 0 ? Math.min(99, Math.round((current / total) * 100)) : 50;

          if (feed.length > 0 && feed[feed.length - 1].startsWith('Consultando ')) {
            feed = feed.slice(0, -1);
          }
          feed = appendFeed(
            feed,
            dealPreviewLines([
              {
                title: String(event.title || 'Jogo'),
                currentPrice: (event.currentPrice as number | null) ?? null,
                currency: (event.currency as string | null) ?? null,
                cut: (event.cut as number | null) ?? null,
                shopName: (event.shopName as string | null) ?? null,
              },
            ])
          );

          updated += 1;
          itemsSinceReload += 1;
          setProgress({
            label: `Preços: ${current} de ${total || '?'} itens`,
            current,
            total,
            percent: Math.max(percent, 5),
            tone: 'amber',
            feed,
          });

          if (itemsSinceReload >= 5) {
            itemsSinceReload = 0;
            await loadData();
          }
          return;
        }

        if (type === 'done') {
          updated = Number(event.updated) || updated;
          totalEligible = Number(event.totalEligible) || totalEligible;
          setProgress({
            label: `Preços concluídos (${updated} atualizados)`,
            current: totalEligible || updated,
            total: totalEligible || updated,
            percent: 100,
            tone: 'amber',
            feed,
          });
          setMessage(
            updated > 0
              ? `Preços atualizados em ${updated} itens`
              : 'Nenhum preço pendente (já atualizados nesta semana)'
          );
        }
      });

      await loadData();
    } catch {
      setMessage('Erro ao buscar preços');
    } finally {
      setFetchingDeals(false);
      setTimeout(() => setProgress(null), 2000);
    }
  }, [wishlist.length, loadData]);

  const runDailySync = useCallback(
    async (force = false) => {
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

        setProgress({
          label: 'Buscando jogos e wishlists nas lojas...',
          current: 1,
          total: 1,
          percent: 15,
          tone: 'emerald',
        });
        setMessage('Buscando jogos e wishlists nas lojas...');

        const response = await fetch('/api/sync/daily', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: true, stage: 'library' }),
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
          setMessage(`Sync concluído com avisos: ${libErrors.join(' | ')}`);
        } else {
          setMessage(
            `Lojas sincronizadas${
              typeof gameCount === 'number' ? ` · ${gameCount} jogos` : ''
            }${
              typeof wishCount === 'number' ? ` · ${wishCount} wishlist` : ''
            } — use Buscar notas / Buscar preços`
          );
        }
      } catch {
        setMessage('Erro ao sincronizar — tente Buscar jogos nas lojas de novo');
        await loadData();
      } finally {
        setSyncing(false);
        setTimeout(() => setProgress(null), 1200);
      }
    },
    [loadData]
  );

  useEffect(() => {
    const linked = searchParams.get('linked');
    const error = searchParams.get('error');
    if (linked) {
      setMessage(`${linked.toUpperCase()} conectada`);
      router.replace('/dashboard');
      runDailySync(true);
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
        await runDailySync(false);
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

      const source =
        librarySort === 'rawg'
          ? 'rawg'
          : librarySort === 'metacritic'
            ? 'metacritic'
            : 'steam';
      return compareByRating(a, b, source, dir);
    });

    return list;
  }, [games, visibleStores, librarySort, sortDir]);

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
            className={`text-sm font-medium px-3 py-2 rounded-lg border transition-colors ${
              on
                ? `${store.color} border-transparent`
                : 'bg-transparent border-gray-600 text-gray-500 hover:border-gray-400 hover:text-gray-300'
            }`}
          >
            {store.name}
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
              onClick={() => runDailySync(true)}
              disabled={busy}
              className="bg-emerald-700 hover:bg-emerald-600 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded"
            >
              {syncing ? 'Buscando nas lojas...' : 'Buscar jogos nas lojas'}
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
              <span className="text-gray-300 truncate">{progress.label}</span>
              <span className="text-gray-400 tabular-nums shrink-0">
                {progress.total > 0
                  ? `${progress.current}/${progress.total}`
                  : `${progress.percent}%`}
                {progress.total > 0 ? ` · ${progress.percent}%` : ''}
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-gray-700 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  progress.tone === 'amber'
                    ? 'bg-amber-500'
                    : progress.tone === 'indigo' || fetchingRatings
                      ? 'bg-indigo-500'
                      : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
              />
            </div>
            {progress.feed && progress.feed.length > 0 && (
              <ul className="max-h-20 overflow-hidden space-y-0.5 border-t border-gray-700/80 pt-2 font-mono text-[11px] leading-snug text-gray-400">
                {progress.feed.map((line, idx) => {
                  const age = progress.feed!.length - 1 - idx;
                  const opacity =
                    age === 0 ? 1 : age === 1 ? 0.75 : age === 2 ? 0.5 : 0.35;
                  return (
                    <li
                      key={`${line}-${idx}`}
                      className="truncate transition-opacity duration-300"
                      style={{ opacity }}
                      title={line}
                    >
                      <span className="text-gray-500 mr-1.5">›</span>
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
                  className="bg-gray-700/40 rounded-lg px-3 py-2 flex items-center justify-between gap-2 min-h-[44px]"
                >
                  <div className="min-w-0">
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
                      className="text-[11px] text-red-400/80 hover:text-red-300 shrink-0"
                      title="Desconectar"
                    >
                      Sair
                    </button>
                  ) : (
                    <a
                      href={store.loginPath}
                      className={`${store.color} text-xs font-semibold py-1.5 px-2.5 rounded shrink-0`}
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
                    Jogos que você tem — a nota segue o filtro ativo
                    {librarySort === 'name' ? ' (maior entre RAWG/Meta/Steam)' : ''}
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
                      <option value="name">Nome</option>
                      <option value="rawg">Nota RAWG</option>
                      <option value="metacritic">Nota Metacritic</option>
                      <option value="steam">Reviews Steam %</option>
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
                Conecte uma loja e clique em Buscar jogos nas lojas.
              </p>
            ) : visibleGames.length === 0 ? (
              <p className="text-gray-400">Nenhuma loja visível — ative pelo menos uma acima.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleGames.map((game) => {
                  const data = parseGameData(game.gameData);
                  const playtime = Number(data.playtime_forever || 0);
                  const display = pickDisplayRating(game.ratings, librarySort);
                  const sourceLabel =
                    display?.source === 'rawg'
                      ? 'RAWG'
                      : display?.source === 'metacritic'
                        ? 'Meta'
                        : display?.source === 'steam'
                          ? 'Steam'
                          : '';
                  return (
                    <div key={game.id} className="bg-gray-700 p-4 rounded-lg">
                      <div className="flex justify-between items-start gap-3 mb-2">
                        <h3 className="font-semibold leading-tight min-w-0 flex-1">
                          <GameTitleLink
                            platform={game.platform}
                            externalId={game.externalId}
                            data={data}
                          />
                        </h3>
                        <div className="w-12 shrink-0 flex flex-col items-center">
                          <div
                            className={`w-12 h-8 flex items-center justify-center rounded text-sm font-bold tabular-nums ${
                              display
                                ? getRatingColor(display.value)
                                : 'bg-gray-600 text-gray-300'
                            }`}
                          >
                            {display
                              ? display.source === 'steam'
                                ? `${Math.round(display.value)}%`
                                : display.value
                              : '—'}
                          </div>
                          <p className="h-4 w-full text-center text-[10px] leading-4 text-gray-400 mt-0.5 truncate">
                            {sourceLabel || '\u00A0'}
                          </p>
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
                })}
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
                    Wishlist — Steam (pública) + ITAD. Epic/Amazon ainda sem API de wishlist.
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
                Nenhum item ainda. Torne a wishlist Steam pública e use Buscar jogos nas lojas.
              </p>
            ) : visibleWishlist.length === 0 ? (
              <p className="text-gray-400">Nenhuma loja visível — ative pelo menos uma acima.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleWishlist.map((item) => {
                  const data = parseGameData(item.gameData);
                  const deal = itadDeal(item);
                  const hasCut = !!deal?.cut && deal.cut > 0;
                  return (
                    <div key={item.id} className="bg-gray-700 p-4 rounded-lg">
                      <div className="flex justify-between items-start gap-3 mb-2">
                        <h3 className="font-semibold leading-tight min-w-0 flex-1">
                          <GameTitleLink
                            platform={item.platform}
                            externalId={item.externalId}
                            data={data}
                          />
                        </h3>
                        {hasCut && (
                          <span className="shrink-0 text-xs font-bold bg-green-800 text-green-100 px-2 py-1 rounded tabular-nums">
                            -{deal!.cut}%
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mb-3">{storeLabel(item.platform)}</p>
                      {deal && deal.currentPrice !== null ? (
                        <div className="space-y-1">
                          <p className="text-lg font-semibold text-green-400 tabular-nums">
                            {formatPrice(deal.currentPrice, deal.currency)}
                          </p>
                          {deal.regularPrice !== null &&
                            deal.regularPrice > (deal.currentPrice || 0) && (
                              <p className="text-xs text-gray-500 line-through tabular-nums">
                                {formatPrice(deal.regularPrice, deal.currency)}
                              </p>
                            )}
                          {deal.shopName && (
                            <p className="text-xs text-gray-400">{deal.shopName}</p>
                          )}
                          {deal.historicalLow !== null && (
                            <p className="text-xs text-gray-500">
                              Mín. histórico:{' '}
                              {formatPrice(deal.historicalLow, deal.currency)}
                              {deal.historicalLowShop
                                ? ` · ${deal.historicalLowShop}`
                                : ''}
                            </p>
                          )}
                          {deal.url && (
                            <a
                              href={deal.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-400 hover:underline inline-block mt-1"
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
