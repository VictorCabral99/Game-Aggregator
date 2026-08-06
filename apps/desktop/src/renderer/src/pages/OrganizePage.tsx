import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  OrganizeDiscoverResult,
  OrganizeGame,
  OrganizeRootStatus,
  OrganizeTransferEvent,
} from '../../../shared/api';

interface Props {
  onMenu?: () => void;
  onLibraryChanged?: () => void;
}

function formatBytes(n: number | null): string {
  if (n == null || n <= 0) return '—';
  const gb = n / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = n / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

function shortPath(p: string): string {
  if (p.length <= 56) return p;
  return `…${p.slice(-54)}`;
}

function pathBasename(p: string): string {
  const parts = p.replace(/[/\\]+$/, '').split(/[/\\]/);
  return parts[parts.length - 1] || p;
}

const FOLDER_LABEL: Record<string, string> = {
  Epic: 'Epic',
  GOG: 'GOG',
  Luna: 'Amazon',
  Steam: 'Steam',
  Outros: 'Outros',
};

export default function OrganizePage({ onMenu, onLibraryChanged }: Props): JSX.Element {
  const [root, setRoot] = useState<OrganizeRootStatus | null>(null);
  const [result, setResult] = useState<OrganizeDiscoverResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<'discover' | 'transfer' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'move' | 'ok'>('all');
  const [includeSteam, setIncludeSteam] = useState(false);
  const [extraFolders, setExtraFolders] = useState<string[]>([]);

  const reloadRoot = useCallback(async () => {
    const status = await window.api.organizeGetRoot();
    setRoot(status);
  }, []);

  useEffect(() => {
    void reloadRoot().catch((err) => setError(String(err)));
  }, [reloadRoot]);

  useEffect(() => {
    return window.api.onOrganizeTransferProgress((ev: OrganizeTransferEvent) => {
      if (ev.type === 'start') {
        setProgress(`Movendo 0/${ev.total}…`);
      } else if (ev.type === 'item') {
        const stage =
          ev.stage === 'move'
            ? 'movendo'
            : ev.stage === 'patch'
              ? 'atualizando launcher'
              : ev.stage === 'error'
                ? 'erro'
                : 'ok';
        setProgress(`${ev.index}/${ev.total} — ${ev.title} (${stage})${ev.message ? `: ${ev.message}` : ''}`);
      } else if (ev.type === 'done') {
        setProgress(`Concluído: ${ev.moved} movidos, ${ev.failed} falhas`);
      }
    });
  }, []);

  const isMovable = (g: OrganizeGame) => !g.alreadyStandard && g.canMove !== false;

  const runDiscover = async (folders = extraFolders) => {
    setBusy('discover');
    setError(null);
    setProgress(null);
    try {
      await window.api.organizeEnsureDirs();
      await reloadRoot();
      const res = await window.api.organizeDiscover({
        includeSteam,
        extraFolders: folders,
      });
      setResult(res);
      setSelected(new Set(res.items.filter(isMovable).map((g) => g.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const discover = async () => {
    await runDiscover();
  };

  const pickScanFolder = async () => {
    setError(null);
    try {
      const folder = await window.api.organizePickScanFolder();
      if (!folder) return;
      const next = extraFolders.includes(folder) ? extraFolders : [...extraFolders, folder];
      setExtraFolders(next);
      await runDiscover(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const pickRoot = async () => {
    setError(null);
    try {
      const status = await window.api.organizePickRoot();
      if (status) {
        setRoot(status);
        setResult(null);
        setSelected(new Set());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const items = result?.items ?? [];
  const visible = useMemo(() => {
    if (filter === 'move') return items.filter(isMovable);
    if (filter === 'ok') return items.filter((g) => g.alreadyStandard || g.canMove === false);
    return items;
  }, [items, filter]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectVisibleMovable = () => {
    setSelected(new Set(visible.filter(isMovable).map((g) => g.id)));
  };

  const transfer = async () => {
    const ids = [...selected].filter((id) => {
      const g = items.find((x) => x.id === id);
      return g && isMovable(g);
    });
    if (ids.length === 0) {
      setError('Nenhum jogo selecionado para mover');
      return;
    }
    setBusy('transfer');
    setError(null);
    try {
      const res = await window.api.organizeTransfer(ids);
      if (res.failed > 0) {
        setError(
          res.errors.map((e) => `${e.title}: ${e.error}`).join(' · ') ||
            `${res.failed} falha(s)`
        );
      }
      const refreshed = await window.api.organizeDiscover({
        includeSteam,
        extraFolders,
      });
      setResult(refreshed);
      setSelected(new Set(refreshed.items.filter(isMovable).map((g) => g.id)));
      onLibraryChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const movableCount = items.filter(isMovable).length;
  const selectedMovable = [...selected].filter((id) =>
    items.some((g) => g.id === id && isMovable(g))
  ).length;

  return (
    <div className="organize-page" data-pad-root="1">
      <header className="organize-page__header">
        <div className="organize-page__heading">
          {onMenu && (
            <button type="button" className="icon-btn" aria-label="Menu" onClick={onMenu}>
              ☰
            </button>
          )}
          <div>
            <h2>Organizar</h2>
            <p className="organize-page__lead">
              Scrape o PC em busca de pastas que pareçam jogos e mova para (
              {root?.gamesRoot || 'C:\\Games'}
              \Loja\Jogo). Feche Heroic/Steam antes de mover.
            </p>
          </div>
        </div>
        <div className="organize-page__actions">
          <label className="organize-page__steam-toggle">
            <input
              type="checkbox"
              checked={includeSteam}
              disabled={busy !== null}
              onChange={(e) => setIncludeSteam(e.target.checked)}
            />
            Incluir Steam
          </label>
          <button type="button" className="ghost" onClick={() => void pickRoot()} disabled={busy !== null}>
            Escolher pasta
          </button>
          <button type="button" className="ghost" onClick={() => void pickScanFolder()} disabled={busy !== null}>
            Escanear pasta…
          </button>
          <button type="button" className="primary" onClick={() => void discover()} disabled={busy !== null}>
            {busy === 'discover' ? 'Procurando…' : 'Procurar no PC'}
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => void transfer()}
            disabled={busy !== null || selectedMovable === 0}
          >
            {busy === 'transfer' ? 'Movendo…' : `Mover selecionados (${selectedMovable})`}
          </button>
        </div>
      </header>

      {root && (
        <p className="organize-page__root">
          Raiz: <code>{root.gamesRoot}</code>
          {root.dirsReady ? ' · pastas prontas' : ' · pastas serão criadas no scan'}
          {extraFolders.length > 0 && (
            <> · extras: {extraFolders.map((f) => pathBasename(f)).join(', ')}</>
          )}
        </p>
      )}

      {error && <p className="organize-page__error">{error}</p>}
      {progress && <p className="organize-page__progress">{progress}</p>}

      {result && (
        <>
          <div className="organize-page__toolbar">
            <span>
              {items.length} encontrados · {movableCount} fora do padrão
            </span>
            <div className="organize-page__filters">
              <button
                type="button"
                className={`filter-chip ${filter === 'all' ? 'filter-chip--active' : ''}`}
                onClick={() => setFilter('all')}
              >
                Todos
              </button>
              <button
                type="button"
                className={`filter-chip ${filter === 'move' ? 'filter-chip--active' : ''}`}
                onClick={() => setFilter('move')}
              >
                A mover
              </button>
              <button
                type="button"
                className={`filter-chip ${filter === 'ok' ? 'filter-chip--active' : ''}`}
                onClick={() => setFilter('ok')}
              >
                Já padronizados / Store
              </button>
              <button type="button" className="ghost" onClick={selectVisibleMovable}>
                Selecionar visíveis
              </button>
            </div>
          </div>

          <ul className="organize-list">
            {visible.map((game: OrganizeGame) => {
              const movable = isMovable(game);
              return (
              <li
                key={game.id}
                className={`organize-list__item ${!movable ? 'organize-list__item--ok' : ''}`}
              >
                <label className="organize-list__check">
                  <input
                    type="checkbox"
                    checked={selected.has(game.id)}
                    disabled={!movable || busy === 'transfer'}
                    onChange={() => toggle(game.id)}
                  />
                  <span className="organize-list__body">
                    <span className="organize-list__title">
                      {game.title}
                      <span className="organize-list__badge">{FOLDER_LABEL[game.folder] ?? game.folder}</span>
                      {game.alreadyStandard && (
                        <span className="organize-list__badge organize-list__badge--ok">ok</span>
                      )}
                      {game.canMove === false && !game.alreadyStandard && (
                        <span className="organize-list__badge">só listar</span>
                      )}
                    </span>
                    <span className="organize-list__paths">
                      <span title={game.currentPath}>{shortPath(game.currentPath)}</span>
                      {movable && (
                        <>
                          <span aria-hidden="true"> → </span>
                          <span title={game.suggestedPath}>{shortPath(game.suggestedPath)}</span>
                        </>
                      )}
                    </span>
                    <span className="organize-list__meta">
                      {game.source} · {formatBytes(game.sizeBytes)}
                      {game.hint ? ` · ${game.hint}` : ''}
                    </span>
                  </span>
                </label>
              </li>
              );
            })}
          </ul>
        </>
      )}

      {!result && !busy && (
        <p className="organize-page__empty">
          <strong>Procurar no PC</strong> faz scrape profundo: Heroic, XboxGames, Program
          Files, atalhos do Menu Iniciar/Desktop e registro de instalação. Use{' '}
          <strong>Escanear pasta…</strong> para roots extras. Steam só com o checkbox.
        </p>
      )}
    </div>
  );
}
