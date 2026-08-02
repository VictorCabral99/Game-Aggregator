import { useCallback, useEffect, useRef, useState } from 'react';
import type { CreateGameInput, Game, LaunchResult, SteamStatus } from '../../shared/api';
import GameCard from './components/GameCard';
import GameDetailModal from './components/GameDetailModal';
import GameFormModal from './components/GameFormModal';
import Toast from './components/Toast';

type View =
  | { kind: 'library' }
  | { kind: 'detail'; gameId: string }
  | { kind: 'form'; gameId: string | null };

interface ToastState {
  message: string;
  kind: 'ok' | 'error';
}

const CARD_W = 200;
const GAP = 16;
const PADDING = 48;

export default function App(): JSX.Element {
  const [games, setGames] = useState<Game[]>([]);
  const [view, setView] = useState<View>({ kind: 'library' });
  const [selected, setSelected] = useState(0);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [steam, setSteam] = useState<SteamStatus | null>(null);
  const [steamSyncing, setSteamSyncing] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((message: string, kind: 'ok' | 'error' = 'ok') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, kind });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const refresh = useCallback(async () => {
    const list = await window.api.libraryList();
    setGames(list);
    setSelected((prev) => Math.min(prev, Math.max(list.length - 1, 0)));
  }, []);

  useEffect(() => {
    void refresh().catch((err) => notify(String(err), 'error'));
    void window.api
      .steamStatus()
      .then(setSteam)
      .catch(() => setSteam({ available: false, path: null, gamesCount: 0 }));
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [refresh, notify]);

  const syncSteam = async () => {
    setSteamSyncing(true);
    try {
      const res = await window.api.steamScan();
      setSteam((s) => (s ? { ...s, gamesCount: res.total } : s));
      notify(
        res.inserted > 0
          ? `Steam: ${res.inserted} jogos novos (${res.total} no total)`
          : `Steam: ${res.total} jogos sincronizados`
      );
      await refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSteamSyncing(false);
    }
  };

  const cols = Math.max(1, Math.floor((window.innerWidth - PADDING * 2) / (CARD_W + GAP)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (view.kind !== 'library') return;
      if (e.key === 'n' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setView({ kind: 'form', gameId: null });
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setSelected((i) => Math.min(i + 1, games.length - 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setSelected((i) => Math.max(i - 1, 0));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected((i) => Math.min(i + cols, games.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected((i) => Math.max(i - cols, 0));
      } else if (e.key === 'Enter' && games.length > 0) {
        e.preventDefault();
        setView({ kind: 'detail', gameId: games[selected].id });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, games, selected, cols]);

  const save = async (input: CreateGameInput) => {
    if (view.kind !== 'form') return;
    if (view.gameId) {
      await window.api.libraryUpdate({ id: view.gameId, patch: input });
      notify('Jogo atualizado');
    } else {
      await window.api.libraryAdd(input);
      notify('Jogo adicionado');
    }
    await refresh();
    setView({ kind: 'library' });
  };

  const remove = async () => {
    if (view.kind !== 'detail') return;
    await window.api.libraryRemove(view.gameId);
    notify('Removido da biblioteca');
    await refresh();
    setView({ kind: 'library' });
  };

  const launch = async (game: Game): Promise<LaunchResult> => {
    try {
      const res = await window.api.libraryLaunch(game.id);
      if (res.ok) {
        notify(`Iniciando ${game.title}…`);
        await refresh();
      }
      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      notify(msg, 'error');
      return { ok: false, error: msg };
    }
  };

  const detailGame =
    view.kind === 'detail' ? games.find((g) => g.id === view.gameId) ?? null : null;
  const formGame =
    view.kind === 'form' && view.gameId ? games.find((g) => g.id === view.gameId) ?? null : null;

  return (
    <main className="shell">
      <header className="shell__header">
        <h1>Game Aggregator Launcher</h1>
        <span className="badge">{games.length} jogos</span>
        {steam && (
          <span className={`badge badge--steam ${steam.available ? '' : 'badge--muted'}`}>
            {steam.available
              ? `Steam: ${steam.gamesCount} detectados`
              : 'Steam não encontrado'}
          </span>
        )}
        <div className="header__actions">
          <button
            type="button"
            disabled={!steam?.available || steamSyncing}
            onClick={() => void syncSteam()}
          >
            {steamSyncing ? 'Sincronizando…' : 'Sync Steam'}
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => setView({ kind: 'form', gameId: null })}
          >
            + Adicionar jogo (Ctrl+N)
          </button>
        </div>
      </header>

      {games.length === 0 ? (
        <section className="empty">
          <h2>Biblioteca vazia</h2>
          <p>Adicione o primeiro jogo (.exe) para começar.</p>
          <button type="button" className="primary" onClick={() => setView({ kind: 'form', gameId: null })}>
            Adicionar jogo
          </button>
        </section>
      ) : (
        <section className="grid" role="grid">
          {games.map((game, i) => (
            <GameCard
              key={game.id}
              game={game}
              selected={i === selected}
              onSelect={() => setSelected(i)}
              onOpen={() => setView({ kind: 'detail', gameId: game.id })}
            />
          ))}
        </section>
      )}

      <footer className="hint">
        Navegue com as setas · Enter abre o jogo · Ctrl+N adiciona · Clique duplo joga
      </footer>

      {detailGame && (
        <GameDetailModal
          game={detailGame}
          onClose={() => setView({ kind: 'library' })}
          onEdit={() => setView({ kind: 'form', gameId: detailGame.id })}
          onRemove={() => remove()}
          onLaunch={launch}
        />
      )}

      {view.kind === 'form' && (
        <GameFormModal
          game={formGame}
          onClose={() => setView({ kind: 'library' })}
          onSave={save}
        />
      )}

      <Toast message={toast?.message ?? ''} kind={toast?.kind ?? 'ok'} />
    </main>
  );
}
