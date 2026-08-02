import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CreateGameInput,
  Game,
  GamePlatform,
  GameSource,
  LaunchResult,
  SteamStatus,
  StoreId,
  StoreStatus,
} from '../../shared/api';
import GameCard from './components/GameCard';
import GameDetailModal from './components/GameDetailModal';
import GameFormModal from './components/GameFormModal';
import ProvidersModal from './components/ProvidersModal';
import AboutModal from './components/AboutModal';
import DuplicatesModal from './components/DuplicatesModal';
import EmulationModal from './components/EmulationModal';
import Toast from './components/Toast';

type View =
  | { kind: 'library' }
  | { kind: 'detail'; gameId: string }
  | { kind: 'form'; gameId: string | null }
  | { kind: 'providers' }
  | { kind: 'about' }
  | { kind: 'duplicates' }
  | { kind: 'emulation' };

type PlatformFilter = 'all' | GamePlatform;

interface ToastState {
  message: string;
  kind: 'ok' | 'error';
}

const CARD_W = 200;
const GAP = 16;
const PADDING = 48;

const STORE_LABELS: Array<{ id: StoreId; label: string }> = [
  { id: 'epic', label: 'Epic' },
  { id: 'gog', label: 'GOG' },
  { id: 'amazon', label: 'Amazon' },
];

const FILTER_OPTIONS: Array<{ id: PlatformFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'local', label: 'Local' },
  { id: 'steam', label: 'Steam' },
  { id: 'epic', label: 'Epic' },
  { id: 'gog', label: 'GOG' },
  { id: 'amazon', label: 'Amazon' },
  { id: 'emulator', label: 'Retro' },
];

export default function App(): JSX.Element {
  const [games, setGames] = useState<Game[]>([]);
  const [view, setView] = useState<View>({ kind: 'library' });
  const [selected, setSelected] = useState(0);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [steam, setSteam] = useState<SteamStatus | null>(null);
  const [stores, setStores] = useState<Partial<Record<StoreId, StoreStatus | null>>>({});
  const [filter, setFilter] = useState<PlatformFilter>('all');
  const [genreFilter, setGenreFilter] = useState<string>('all');
  const [installedOnly, setInstalledOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [syncingAll, setSyncingAll] = useState(false);
  const [downloadingCovers, setDownloadingCovers] = useState(false);
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
      .catch(() => setSteam({ available: false, path: null, gamesCount: 0, lastScanAt: null, error: null }));
    for (const { id } of STORE_LABELS) {
      void window.api
        .storeStatus(id)
        .then((s) => setStores((prev) => ({ ...prev, [id]: s })))
        .catch(() => setStores((prev) => ({ ...prev, [id]: null })));
    }
    void window.api.coversDownloadMissing().catch(() => undefined);
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [refresh, notify]);

  const syncAll = async () => {
    setSyncingAll(true);
    try {
      const res = await window.api.providersSyncAll();
      notify(
        res.totalInserted > 0
          ? `Sync completo: ${res.totalInserted} jogos novos (${res.totalScanned} no total)`
          : `Sync completo: ${res.totalScanned} jogos verificados`
      );
      await refresh();
      void downloadCovers();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSyncingAll(false);
    }
  };

  const downloadCovers = async () => {
    setDownloadingCovers(true);
    try {
      const res = await window.api.coversDownloadMissing();
      if (res.downloaded > 0) {
        notify(`Capas baixadas: ${res.downloaded}${res.failed > 0 ? ` (${res.failed} falhas)` : ''}`);
      }
      await refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setDownloadingCovers(false);
    }
  };

  const cols = Math.max(1, Math.floor((window.innerWidth - PADDING * 2) / (CARD_W + GAP)));

  const allGenres = useMemo(() => {
    const set = new Set<string>();
    for (const g of games) for (const genre of g.genres) set.add(genre);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [games]);

  const visibleGames = useMemo(() => {
    const q = query.trim().toLowerCase();
    return games.filter((g) => {
      if (filter !== 'all' && !g.sources.some((s) => s.platform === filter)) return false;
      if (installedOnly && !g.sources.some((s) => s.isInstalled)) return false;
      if (genreFilter !== 'all' && !g.genres.includes(genreFilter)) return false;
      if (q) {
        const haystack = `${g.title} ${g.normalizedTitle} ${g.sources.map((s) => s.title).join(' ')}`.toLowerCase();
        if (!q.split(/\s+/).every((token) => haystack.includes(token))) return false;
      }
      return true;
    });
  }, [games, filter, genreFilter, installedOnly, query]);

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
        setSelected((i) => Math.min(i + 1, visibleGames.length - 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setSelected((i) => Math.max(i - 1, 0));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected((i) => Math.min(i + cols, visibleGames.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected((i) => Math.max(i - cols, 0));
      } else if (e.key === 'Enter' && visibleGames.length > 0) {
        e.preventDefault();
        setView({ kind: 'detail', gameId: visibleGames[selected].id });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, visibleGames, selected, cols]);

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

  const separateSource = async (source: GameSource) => {
    if (view.kind !== 'detail') return;
    try {
      await window.api.librarySeparateSource(source.id);
      notify('Fonte separada em um jogo próprio');
      await refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const launch = async (game: Game, source?: GameSource): Promise<LaunchResult> => {
    try {
      const res = source
        ? await window.api.libraryLaunchSource(source.id)
        : await window.api.libraryLaunch(game.id);
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
        {STORE_LABELS.map(({ id, label }) => {
          const s = stores[id];
          const unavailable = !s?.available;
          return (
            <span key={id} className={`badge ${unavailable ? 'badge--muted' : ''}`}>
              {unavailable ? `${label} indisponível` : `${label}: ${s.gamesCount}`}
            </span>
          );
        })}
        <div className="header__actions">
          <button
            type="button"
            disabled={syncingAll}
            onClick={() => void syncAll()}
            title="Sincroniza Steam, Epic, GOG e Amazon de uma vez"
          >
            {syncingAll ? 'Sincronizando…' : 'Sync tudo'}
          </button>
          <button
            type="button"
            disabled={downloadingCovers}
            onClick={() => void downloadCovers()}
            title="Baixa capas que ainda não estão no cache local"
          >
            {downloadingCovers ? 'Baixando capas…' : 'Baixar capas'}
          </button>
          <button type="button" onClick={() => setView({ kind: 'providers' })}>
            Providers
          </button>
          <button type="button" onClick={() => setView({ kind: 'emulation' })}>
            Emulação
          </button>
          <button type="button" onClick={() => setView({ kind: 'duplicates' })}>
            Duplicatas
          </button>
          <button type="button" onClick={() => setView({ kind: 'about' })}>
            Sobre
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

      <div className="filters" role="tablist" aria-label="Filtrar por plataforma">
        {FILTER_OPTIONS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            className={`filter-chip ${filter === id ? 'filter-chip--active' : ''}`}
            onClick={() => {
              setFilter(id);
              setSelected(0);
            }}
          >
            {label}
            <span className="filter-chip__count">
              {id === 'all'
                ? games.length
                : games.filter((g) => g.sources.some((s) => s.platform === id)).length}
            </span>
          </button>
        ))}
        <button
          type="button"
          className={`filter-chip ${installedOnly ? 'filter-chip--active' : ''}`}
          aria-pressed={installedOnly}
          onClick={() => {
            setInstalledOnly((v) => !v);
            setSelected(0);
          }}
        >
          Instalados
          <span className="filter-chip__count">
            {games.filter((g) => g.sources.some((s) => s.isInstalled)).length}
          </span>
        </button>
      </div>

      <div className="toolbar">
        <input
          type="search"
          className="search"
          placeholder="Buscar por nome… (filtra a grade)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
        />
        {allGenres.length > 0 && (
          <select
            className="genre-filter"
            value={genreFilter}
            onChange={(e) => {
              setGenreFilter(e.target.value);
              setSelected(0);
            }}
            aria-label="Filtrar por gênero"
          >
            <option value="all">Todos os gêneros</option>
            {allGenres.map((genre) => (
              <option key={genre} value={genre}>
                {genre}
              </option>
            ))}
          </select>
        )}
        <span className="toolbar__count">{visibleGames.length} de {games.length} jogos</span>
      </div>

      {visibleGames.length === 0 ? (
        <section className="empty">
          {games.length === 0 ? (
            <>
              <h2>Biblioteca vazia</h2>
              <p>Adicione o primeiro jogo (.exe) para começar.</p>
              <button type="button" className="primary" onClick={() => setView({ kind: 'form', gameId: null })}>
                Adicionar jogo
              </button>
            </>
          ) : (
            <>
              <h2>Nenhum jogo nesta plataforma</h2>
              <p>Sincronize a biblioteca ou troque o filtro.</p>
            </>
          )}
        </section>
      ) : (
        <section className="grid" role="grid">
          {visibleGames.map((game, i) => (
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
          onSeparateSource={separateSource}
        />
      )}

      {view.kind === 'form' && (
        <GameFormModal
          game={formGame}
          onClose={() => setView({ kind: 'library' })}
          onSave={save}
        />
      )}

      {view.kind === 'providers' && <ProvidersModal onClose={() => setView({ kind: 'library' })} />}

      {view.kind === 'about' && <AboutModal onClose={() => setView({ kind: 'library' })} />}

      {view.kind === 'duplicates' && (
        <DuplicatesModal
          onClose={() => setView({ kind: 'library' })}
          onMerged={() => void refresh()}
        />
      )}

      {view.kind === 'emulation' && (
        <EmulationModal
          onClose={() => setView({ kind: 'library' })}
          onLaunch={launch}
          onChanged={() => void refresh()}
        />
      )}

      <Toast message={toast?.message ?? ''} kind={toast?.kind ?? 'ok'} />
    </main>
  );
}
