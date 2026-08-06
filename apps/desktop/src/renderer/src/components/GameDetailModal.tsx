import { useEffect, useState } from 'react';
import type { Game, GameSource, LaunchResult, RatingsSummary } from '../../../shared/api';
import { steamDbInfoUrl } from '../../../shared/api';
import { coverSrc, PLATFORM_LABELS } from './GameCard';

interface Props {
  game: Game;
  rating?: RatingsSummary | null;
  hideScore?: boolean;
  onClose: () => void;
  onEdit: () => void;
  onRemove: () => Promise<void>;
  onLaunch: (game: Game, source?: GameSource) => Promise<LaunchResult>;
  onInstall: (game: Game, source?: GameSource) => Promise<LaunchResult>;
  onSeparateSource: (source: GameSource) => Promise<void>;
  onSyncRating?: () => void;
}

const SOURCE_NAMES: Record<string, string> = {
  steam: 'Steam',
  rawg: 'RAWG',
  metacritic: 'Metacritic',
};

const STORE_PLATFORMS = new Set(['steam', 'epic', 'gog', 'amazon']);

function sourceLabel(source: GameSource): string {
  const platform = PLATFORM_LABELS[source.platform] ?? source.platform;
  if (source.platform === 'local' && source.executable) {
    return `${platform} · ${source.executable}`;
  }
  if (source.externalId) return `${platform} · ${source.externalId}`;
  return platform;
}

function canInstall(source: GameSource): boolean {
  return STORE_PLATFORMS.has(source.platform) && !source.isInstalled && Boolean(source.externalId);
}

function canPlay(source: GameSource): boolean {
  if (source.platform === 'local' || source.platform === 'manual' || source.platform === 'emulator') {
    return true;
  }
  return source.isInstalled;
}

function isStale(iso: string): boolean {
  const ageDays = (Date.now() - new Date(iso).getTime()) / 86400000;
  return ageDays > 7;
}

function dateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function GameDetailModal({
  game,
  rating,
  hideScore,
  onClose,
  onEdit,
  onRemove,
  onLaunch,
  onInstall,
  onSeparateSource,
  onSyncRating,
}: Props): JSX.Element {
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const preferred = game.preferredSource;
  const preferredNeedsInstall = preferred ? canInstall(preferred) : false;
  const preferredCanPlay = preferred ? canPlay(preferred) : false;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmingRemove) setConfirmingRemove(false);
        else onClose();
      } else if (e.key === 'Enter' && !confirmingRemove && preferred) {
        if (preferredNeedsInstall) void runInstall('preferred');
        else if (preferredCanPlay) void runLaunch('preferred');
      } else if (e.key === 'Delete') {
        setConfirmingRemove(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmingRemove, onClose, preferredNeedsInstall, preferredCanPlay]);

  const runLaunch = async (source: GameSource | 'preferred') => {
    const key = source === 'preferred' ? 'launch:preferred' : `launch:${source.id}`;
    setBusy(key);
    try {
      await onLaunch(game, source === 'preferred' ? undefined : source);
    } finally {
      setBusy(null);
    }
  };

  const runInstall = async (source: GameSource | 'preferred') => {
    const key = source === 'preferred' ? 'install:preferred' : `install:${source.id}`;
    setBusy(key);
    try {
      await onInstall(game, source === 'preferred' ? undefined : source);
    } finally {
      setBusy(null);
    }
  };

  const src = coverSrc(game);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal--detail"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        data-pad-root="1"
      >
        {src && (
          <div className="modal__hero">
            <img src={src} alt="" />
          </div>
        )}
        <h2>{game.title}</h2>

        {game.summary && <p className="modal__summary">{game.summary}</p>}

        <dl className="modal__meta">
          <div>
            <dt>Fontes</dt>
            <dd>{game.sources.length > 0 ? game.sources.map((s) => PLATFORM_LABELS[s.platform]).join(' · ') : 'Nenhuma'}</dd>
          </div>
          {game.genres.length > 0 && (
            <div>
              <dt>Gêneros</dt>
              <dd>{game.genres.join(', ')}</dd>
            </div>
          )}
          {game.preferredSource?.lastPlayedAt && (
            <div>
              <dt>Última vez jogado</dt>
              <dd>{new Date(game.preferredSource.lastPlayedAt).toLocaleString('pt-BR')}</dd>
            </div>
          )}
          {game.launchArgs && (
            <div>
              <dt>Launch args</dt>
              <dd>
                <code>{game.launchArgs}</code>
              </dd>
            </div>
          )}
          {game.isRemote && (
            <div>
              <dt>Remote</dt>
              <dd>Marcado como stream / outro PC</dd>
            </div>
          )}
          {game.steamAppId && (
            <div>
              <dt>Steam AppID</dt>
              <dd>
                <code>{game.steamAppId}</code>
                {' · '}
                <button
                  type="button"
                  className="linkish"
                  onClick={() => void window.api.openExternal(steamDbInfoUrl(game.steamAppId!))}
                >
                  Abrir no SteamDB
                </button>
              </dd>
            </div>
          )}
        </dl>

        {!hideScore && (
          <div className="ratings">
            <div className="ratings__head">
              <strong>Notas</strong>
              {rating?.updatedAt && (
                <span
                  className={`ratings__stale ${isStale(rating.updatedAt) ? 'ratings__stale--stale' : ''}`}
                >
                  {isStale(rating.updatedAt) ? 'desatualizadas' : `atualizadas ${dateLabel(rating.updatedAt)}`}
                </span>
              )}
              {onSyncRating && (
                <button type="button" className="ratings__sync" onClick={onSyncRating}>
                  Atualizar
                </button>
              )}
              {game.steamAppId && (
                <button
                  type="button"
                  className="ratings__steamdb"
                  onClick={() => void window.api.openExternal(steamDbInfoUrl(game.steamAppId!))}
                  title={`SteamDB · App ${game.steamAppId}`}
                >
                  SteamDB
                </button>
              )}
            </div>
            {!rating || rating.sources.every((s) => s.score === null) ? (
              <p className="ratings__empty">
                {game.steamAppId
                  ? 'Sem avaliação.'
                  : 'Sem avaliação. Use Atualizar para buscar Steam AppID / nota.'}
              </p>
            ) : (
              <div className="ratings__grid">
                {rating.sources.map((s) => {
                  if (s.score === null) return null;
                  const display =
                    s.source === 'rawg' && s.score <= 5 ? Math.round(s.score * 20 * 10) / 10 : s.score;
                  return (
                    <div key={s.source} className="ratings__cell">
                      <span className="ratings__value">{Math.round(display)}</span>
                      <span className="ratings__label">{SOURCE_NAMES[s.source] ?? s.source}</span>
                      {s.reviewCount !== null && s.reviewCount > 0 && (
                        <span className="ratings__count">
                          {s.reviewCount >= 1000
                            ? `${(s.reviewCount / 1000).toFixed(1)}k`
                            : s.reviewCount}{' '}
                          reviews
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {game.sources.length > 0 && (
          <div className="sources">
            <p className="sources__title">Fontes</p>
            {game.sources.map((source) => {
              const isPreferred = game.preferredSource?.id === source.id;
              const installing = busy === `install:${source.id}`;
              const launching = busy === `launch:${source.id}`;
              const showInstall = canInstall(source);
              const showPlay = canPlay(source);
              return (
                <div
                  key={source.id}
                  className={`source-row ${isPreferred ? 'source-row--preferred' : ''} ${
                    !source.isInstalled && STORE_PLATFORMS.has(source.platform)
                      ? 'source-row--missing'
                      : ''
                  }`}
                  title={
                    source.platform !== 'local'
                      ? 'Abre via cliente oficial da loja'
                      : undefined
                  }
                >
                  <span className="source-row__label">
                    {sourceLabel(source)}
                    {isPreferred && <span className="badge">padrão</span>}
                    {STORE_PLATFORMS.has(source.platform) && !source.isInstalled && (
                      <span className="badge badge--muted">não instalado</span>
                    )}
                    {source.isInstalled && STORE_PLATFORMS.has(source.platform) && (
                      <span className="badge badge--ok">instalado</span>
                    )}
                  </span>
                  <span className="source-row__launch">
                    {showInstall && (
                      <button
                        type="button"
                        className="source-row__install"
                        disabled={busy !== null}
                        onClick={() => void runInstall(source)}
                      >
                        {installing ? 'Abrindo…' : 'Instalar'}
                      </button>
                    )}
                    {showPlay && (
                      <button
                        type="button"
                        className="source-row__play"
                        disabled={busy !== null}
                        onClick={() => void runLaunch(source)}
                      >
                        {launching ? 'Iniciando…' : '▶ Iniciar'}
                      </button>
                    )}
                    {game.sources.length > 1 && (
                      <button
                        type="button"
                        className="source-row__separate"
                        onClick={() => void onSeparateSource(source)}
                        title="Separar em um jogo próprio"
                      >
                        Separar
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="modal__actions">
          {preferredNeedsInstall ? (
            <button
              type="button"
              className="primary"
              disabled={!preferred || busy !== null}
              onClick={() => void runInstall('preferred')}
            >
              {busy === 'install:preferred' ? 'Abrindo loja…' : '⬇ Instalar (Enter)'}
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              disabled={!preferred || !preferredCanPlay || busy !== null}
              onClick={() => void runLaunch('preferred')}
            >
              {busy === 'launch:preferred' ? 'Iniciando…' : '▶ Iniciar (Enter)'}
            </button>
          )}
          <button type="button" onClick={onEdit}>Editar</button>
          {confirmingRemove ? (
            <>
              <button type="button" className="danger" onClick={() => void onRemove()}>
                Confirmar remoção
              </button>
              <button type="button" onClick={() => setConfirmingRemove(false)}>Cancelar</button>
            </>
          ) : (
            <button type="button" className="danger-ghost" onClick={() => setConfirmingRemove(true)}>
              Remover da biblioteca
            </button>
          )}
        </div>
        {confirmingRemove && (
          <p className="hint">Remove apenas da biblioteca — não apaga arquivos do disco.</p>
        )}
        {preferredNeedsInstall && (
          <p className="hint">
            A instalação abre o cliente oficial da loja. Depois, sincronize a loja em Lojas para
            marcar como instalado.
          </p>
        )}
      </div>
    </div>
  );
}
