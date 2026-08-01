'use client';

import { useState, useEffect } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';

interface Game {
  id: string;
  platform: string;
  externalId: string;
  gameData: any;
  syncedAt: string;
  ratings?: GameRating[];
}

interface GameRating {
  id: string;
  source: string;
  rating: number | null;
  reviewCount: number | null;
  url: string | null;
  lastUpdated: string;
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [steamId, setSteamId] = useState('');

  useEffect(() => {
    if (session) {
      fetchGames();
    }
  }, [session]);

  const fetchGames = async () => {
    try {
      const response = await fetch('/api/steam');
      const data = await response.json();
      if (data.games) {
        // Fetch ratings for each game
        const gamesWithRatings = await Promise.all(
          data.games.map(async (game: Game) => {
            const ratingsResponse = await fetch(`/api/ratings?gameLibraryId=${game.id}`);
            const ratingsData = await ratingsResponse.json();
            return {
              ...game,
              ratings: ratingsData.ratings || [],
            };
          })
        );
        setGames(gamesWithRatings);
      }
    } catch (error) {
      console.error('Failed to fetch games:', error);
    }
  };

  const syncSteamGames = async () => {
    if (!steamId) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/steam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steamId }),
      });
      const data = await response.json();
      if (data.success) {
        await fetchGames();
      }
    } catch (error) {
      console.error('Failed to sync Steam games:', error);
    } finally {
      setLoading(false);
    }
  };

  const syncRatings = async (gameId: string) => {
    try {
      const response = await fetch('/api/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameLibraryId: gameId }),
      });
      const data = await response.json();
      if (data.success) {
        await fetchGames();
      }
    } catch (error) {
      console.error('Failed to sync ratings:', error);
    }
  };

  const getAverageRating = (ratings: GameRating[]) => {
    const validRatings = ratings.filter(r => r.rating !== null && r.rating > 0);
    if (validRatings.length === 0) return null;
    const sum = validRatings.reduce((acc, r) => acc + (r.rating || 0), 0);
    return Math.round((sum / validRatings.length) * 10) / 10;
  };

  const getRatingColor = (rating: number | null) => {
    if (!rating) return 'bg-gray-600';
    if (rating >= 85) return 'bg-green-600';
    if (rating >= 70) return 'bg-yellow-600';
    if (rating >= 50) return 'bg-orange-600';
    return 'bg-red-600';
  };

  if (status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Game Aggregator</h1>
          <p className="text-gray-400 mb-6">Faça login para ver seus jogos</p>
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
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-gray-400">Bem-vindo, {session.user?.name}</p>
          </div>
          <button
            onClick={() => signOut()}
            className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded"
          >
            Sair
          </button>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg mb-6">
          <h2 className="text-xl font-semibold mb-4">Sincronizar Steam</h2>
          <div className="flex gap-4">
            <input
              type="text"
              placeholder="Steam ID (ex: 76561198000000000)"
              value={steamId}
              onChange={(e) => setSteamId(e.target.value)}
              className="flex-1 bg-gray-700 text-white px-4 py-2 rounded"
            />
            <button
              onClick={syncSteamGames}
              disabled={loading || !steamId}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded"
            >
              {loading ? 'Sincronizando...' : 'Sincronizar'}
            </button>
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">
            Seus Jogos ({games.length})
          </h2>
          {games.length === 0 ? (
            <p className="text-gray-400">Nenhum jogo sincronizado ainda</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {games.map((game) => {
                const gameData = typeof game.gameData === 'string' 
                  ? JSON.parse(game.gameData) 
                  : game.gameData;
                const avgRating = getAverageRating(game.ratings || []);
                return (
                  <div key={game.id} className="bg-gray-700 p-4 rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold">{gameData.name}</h3>
                      {avgRating && (
                        <div className={`${getRatingColor(avgRating)} px-2 py-1 rounded text-sm font-bold`}>
                          {avgRating}
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-gray-400 mb-2">
                      {game.platform.toUpperCase()}
                    </p>
                    {gameData.playtime_forever > 0 && (
                      <p className="text-sm text-gray-400 mb-2">
                        {Math.floor(gameData.playtime_forever / 60)}h jogadas
                      </p>
                    )}
                    {game.ratings && game.ratings.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-600">
                        <p className="text-xs text-gray-400 mb-1">Notas:</p>
                        <div className="flex gap-2 flex-wrap">
                          {game.ratings.map((rating) => (
                            <span
                              key={rating.id}
                              className="text-xs bg-gray-600 px-2 py-1 rounded"
                            >
                              {rating.source}: {rating.rating || 'N/A'}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => syncRatings(game.id)}
                      className="mt-3 text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded"
                    >
                      Atualizar notas
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
