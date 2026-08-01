'use client';

import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-400">Carregando...</p>
        </div>
      </div>
    );
  }

  if (session) {
    router.push('/dashboard');
    return null;
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
            Game Aggregator
          </h1>
          <p className="text-xl text-gray-400 mb-8">
            Seus jogos de Steam, GOG, Epic e Amazon Luna em um só lugar
          </p>
          
          <button
            onClick={() => signIn('google')}
            className="bg-white hover:bg-gray-100 text-gray-800 font-bold py-3 px-6 rounded-lg flex items-center gap-3 mx-auto transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Entrar com Google
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-800 p-6 rounded-lg hover:bg-gray-700 transition-colors">
            <h2 className="text-xl font-semibold mb-2">Steam</h2>
            <p className="text-gray-400">Conecte sua conta Steam</p>
          </div>
          <div className="bg-gray-800 p-6 rounded-lg hover:bg-gray-700 transition-colors">
            <h2 className="text-xl font-semibold mb-2">GOG</h2>
            <p className="text-gray-400">Conecte sua conta GOG</p>
          </div>
          <div className="bg-gray-800 p-6 rounded-lg hover:bg-gray-700 transition-colors">
            <h2 className="text-xl font-semibold mb-2">Epic Games</h2>
            <p className="text-gray-400">Conecte sua conta Epic</p>
          </div>
          <div className="bg-gray-800 p-6 rounded-lg hover:bg-gray-700 transition-colors">
            <h2 className="text-xl font-semibold mb-2">Amazon Luna</h2>
            <p className="text-gray-400">Conecte sua conta Luna</p>
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-2xl font-semibold mb-4">Recursos</h2>
          <ul className="space-y-2 text-gray-400">
            <li>✅ Agregação de jogos de múltiplas plataformas</li>
            <li>✅ Notas do Metacritic, RAWG e GG.deals</li>
            <li>✅ Sistema de média ponderada</li>
            <li>✅ Dashboard personalizado</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
