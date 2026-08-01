'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';

type Tab = 'library' | 'wishlist';

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

function parseGameData(data: string | Record<string, unknown>) {
  return typeof data === 'string' ? JSON.parse(data) : data;
}

function gameTitle(data: Record<string, unknown>) {
  return (data.name || data.title || 'Jogo') as string;
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const [tab, setTab] = useState<Tab>('library');
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [games, setGames] = useState<LibraryGame[]>([]);
  const [wishlist, setWishlist] = useState<WishlistGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastDailySyncAt, setLastDailySyncAt] = useState<string | null>(null);
  const [steamId, setSteamId] = useState('');
  const [gogToken, setGogToken] = useState('');
  const [message, setMessage] = useState<string | null>(null);

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

  const runDailySync = useCallback(
    async (force = false) => {
      setSyncing(true);
      setMessage(null);
      try {
        const response = await fetch('/api/sync/daily', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force }),
        });
        const data = await response.json();
        if (data.skipped) {
          setMessage('Já atualizado nas últimas 24h');
        } else if (data.success) {
          setMessage('Sincronização concluída');
          setLastDailySyncAt(data.lastDailySyncAt);
        } else {
          setMessage(data.error || 'Falha na sincronização');
        }
        await loadData();
      } catch {
        setMessage('Erro ao sincronizar');
      } finally {
        setSyncing(false);
      }
    },
    [loadData]
  );

  useEffect(() => {
    if (!session) return;

    (async () => {
      setLoading(true);
      try {
        const syncData = await loadData();
        if (syncData.needsSync) {
          await runDailySync(false);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [session, loadData, runDailySync]);

  const linkSteam = async () => {
    if (!steamId.trim()) return;
    setLoading(true);
    try {
      const response = await fetch('/api/platforms/steam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steamId: steamId.trim() }),
      });
      const data = await response.json();
      if (data.success) {
        setSteamId('');
        setMessage('Steam conectada');
        await loadData();
        await runDailySync(true);
      } else {
        setMessage(data.error || 'Falha ao conectar Steam');
      }
    } finally {
      setLoading(false);
    }
  };

  const linkGog = async () => {
    if (!gogToken.trim()) return;
    setLoading(true);
    try {
      const isRefresh = gogToken.trim().length > 80;
      const response = await fetch('/api/platforms/gog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isRefresh
            ? { refreshToken: gogToken.trim() }
            : { accessToken: gogToken.trim() }
        ),
      });
      const data = await response.json();
      if (data.success) {
        setGogToken('');
        setMessage('GOG conectada');
        await loadData();
        await runDailySync(true);
      } else {
        setMessage(data.error || 'Falha ao conectar GOG');
      }
    } finally {
      setLoading(false);
    }
  };

  const unlinkPlatform = async (platform: string) => {
    await fetch('/api/platforms', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform }),
    });
    setMessage(`${platform.toUpperCase()} desconectada`);
    await loadData();
  };

  const getAverageRating = (ratings: GameRating[]) => {
    const normalized = ratings
      .filter((r) => r.rating !== null && r.rating > 0)
      .map((r) => {
        let value = r.rating as number;
        if (r.source === 'rawg' && value <= 5) value = value * 20;
        return value;
      });
    if (normalized.length === 0) return null;
    const sum = normalized.reduce((a, b) => a + b, 0);
    return Math.round((sum / normalized.length) * 10) / 10;
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
          <div className="flex gap-2">
            <button
              onClick={() => runDailySync(true)}
              disabled={syncing}
              className="bg-emerald-700 hover:bg-emerald-600 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded"
            >
              {syncing ? 'Atualizando...' : 'Atualizar agora'}
            </button>
            <button
              onClick={() => signOut()}
              className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded"
            >
              Sair
            </button>
          </div>
        </div>

        {message && (
          <div className="bg-gray-800 border border-gray-700 text-sm text-gray-300 px-4 py-2 rounded">
            {message}
          </div>
        )}

        <section className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Contas conectadas</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-700/60 p-4 rounded-lg space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold">Steam</h3>
                {accountFor('steam') ? (
                  <button
                    onClick={() => unlinkPlatform('steam')}
                    className="text-xs text-red-400 hover:underline"
                  >
                    Desconectar
                  </button>
                ) : null}
              </div>
              {accountFor('steam') ? (
                <p className="text-sm text-green-400">
                  Conectada: {accountFor('steam')?.displayName}
                </p>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Steam ID ou vanity URL"
                    value={steamId}
                    onChange={(e) => setSteamId(e.target.value)}
                    className="flex-1 bg-gray-800 text-white px-3 py-2 rounded text-sm"
                  />
                  <button
                    onClick={linkSteam}
                    disabled={loading || !steamId}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white text-sm px-3 py-2 rounded"
                  >
                    Conectar
                  </button>
                </div>
              )}
            </div>

            <div className="bg-gray-700/60 p-4 rounded-lg space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold">GOG</h3>
                {accountFor('gog') ? (
                  <button
                    onClick={() => unlinkPlatform('gog')}
                    className="text-xs text-red-400 hover:underline"
                  >
                    Desconectar
                  </button>
                ) : null}
              </div>
              {accountFor('gog') ? (
                <p className="text-sm text-green-400">
                  Conectada: {accountFor('gog')?.displayName}
                </p>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder="Access ou refresh token GOG"
                    value={gogToken}
                    onChange={(e) => setGogToken(e.target.value)}
                    className="flex-1 bg-gray-800 text-white px-3 py-2 rounded text-sm"
                  />
                  <button
                    onClick={linkGog}
                    disabled={loading || !gogToken}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white text-sm px-3 py-2 rounded"
                  >
                    Conectar
                  </button>
                </div>
              )}
            </div>

            <div className="bg-gray-700/40 p-4 rounded-lg opacity-70">
              <h3 className="font-semibold">Epic Games</h3>
              <p className="text-sm text-gray-400 mt-2">Em breve</p>
            </div>

            <div className="bg-gray-700/40 p-4 rounded-lg opacity-70">
              <h3 className="font-semibold">Amazon Luna</h3>
              <p className="text-sm text-gray-400 mt-2">Em breve</p>
            </div>
          </div>
        </section>

        <div className="flex gap-2 border-b border-gray-700 pb-2">
          <button
            onClick={() => setTab('library')}
            className={`px-4 py-2 rounded-t font-medium ${
              tab === 'library'
                ? 'bg-gray-800 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Biblioteca ({games.length})
          </button>
          <button
            onClick={() => setTab('wishlist')}
            className={`px-4 py-2 rounded-t font-medium ${
              tab === 'wishlist'
                ? 'bg-gray-800 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Wishlist ({wishlist.length})
          </button>
        </div>

        {tab === 'library' && (
          <section className="bg-gray-800 p-6 rounded-lg">
            <p className="text-sm text-gray-400 mb-4">
              Jogos que você tem — notas Metacritic e RAWG
            </p>
            {games.length === 0 ? (
              <p className="text-gray-400">
                Conecte Steam ou GOG e sincronize para ver sua biblioteca.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {games.map((game) => {
                  const data = parseGameData(game.gameData);
                  const avg = getAverageRating(game.ratings || []);
                  const playtime = Number(data.playtime_forever || 0);
                  return (
                    <div key={game.id} className="bg-gray-700 p-4 rounded-lg">
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <h3 className="font-semibold leading-tight">
                          {gameTitle(data)}
                        </h3>
                        {avg !== null && (
                          <div
                            className={`${getRatingColor(avg)} px-2 py-1 rounded text-sm font-bold shrink-0`}
                          >
                            {avg}
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mb-2">
                        {game.platform.toUpperCase()}
                      </p>
                      {playtime > 0 && (
                        <p className="text-sm text-gray-400 mb-2">
                          {Math.floor(playtime / 60)}h jogadas
                        </p>
                      )}
                      {game.ratings?.length > 0 && (
                        <div className="flex gap-2 flex-wrap mt-2">
                          {game.ratings.map((rating) => {
                            let value = rating.rating;
                            if (
                              rating.source === 'rawg' &&
                              value !== null &&
                              value <= 5
                            ) {
                              value = Math.round(value * 20 * 10) / 10;
                            }
                            return (
                              <span
                                key={rating.id}
                                className="text-xs bg-gray-600 px-2 py-1 rounded"
                              >
                                {rating.source}: {value ?? 'N/A'}
                              </span>
                            );
                          })}
                        </div>
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
            <p className="text-sm text-gray-400 mb-4">
              Wishlist — preços e promoções via IsThereAnyDeal
            </p>
            {wishlist.length === 0 ? (
              <p className="text-gray-400">
                Nenhum item na wishlist. Conecte uma loja e sincronize.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {wishlist.map((item) => {
                  const data = parseGameData(item.gameData);
                  const deal = item.deals?.find((d) => d.source === 'itad');
                  return (
                    <div key={item.id} className="bg-gray-700 p-4 rounded-lg">
                      <h3 className="font-semibold mb-1">{gameTitle(data)}</h3>
                      <p className="text-xs text-gray-400 mb-3">
                        {item.platform.toUpperCase()}
                      </p>
                      {deal ? (
                        <div className="space-y-1">
                          <p className="text-sm">
                            Melhor preço:{' '}
                            <span className="font-semibold text-green-400">
                              {formatPrice(deal.currentPrice, deal.currency)}
                            </span>
                            {deal.shopName && (
                              <span className="text-gray-400">
                                {' '}
                                ({deal.shopName})
                              </span>
                            )}
                            {!!deal.cut && deal.cut > 0 && (
                              <span className="ml-2 text-xs bg-green-800 px-1.5 py-0.5 rounded">
                                -{deal.cut}%
                              </span>
                            )}
                          </p>
                          {deal.historicalLow !== null && (
                            <p className="text-xs text-gray-400">
                              Histórico baixo:{' '}
                              {formatPrice(deal.historicalLow, deal.currency)}
                              {deal.historicalLowShop &&
                                ` (${deal.historicalLowShop})`}
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
                          Sem preço ITAD ainda — use Atualizar agora
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
