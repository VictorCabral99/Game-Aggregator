import { useEffect, useState } from 'react';
import type { Game, GameSource, LaunchResult, RatingsSummary } from '../../../shared/api';
import { coverSrc, PLATFORM_LABELS } from './GameCard';

interface Props {
  game: Game;
  rating?: RatingsSummary | null;
  hideScore?: boolean;
  onClose: () => void;
  onEdit: () => void;
  onRemove: () => Promise<void>;
  onLaunch: (game: Game, source?: GameSource) => Promise<LaunchResult>;
  onSeparateSource: (source: GameSource) => Promise<void>;
  onSyncRating?: () => void;
}

const SOURCE_NAMES: Record<string, string> = {
  steam: 'Steam',
  rawg: 'RAWG',
  metacritic: 'Metacritic',
};

function sourceLabel(source: GameSource): string {
  const platform = PLATFORM_LABELS[source.platform] ?? source.platform;
  if (source.platform === 'local' && source.executable) {
    return `${platform} · ${source.executable}`;
  }
  if (source.externalId) return `${platform} · ${source.externalId}`;
  return platform;
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
  onSeparateSource,
  onSyncRating,
}: Props): JSX.Element {
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [launching, setLaunching] = useState<GameSource | 'preferred' | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmingRemove) setConfirmingRemove(false);
        else onClose();
      } else if (e.key === 'Enter' && !confirmingRemove) {
        void launch('preferred');
      } else if (e.key === 'Delete') {
        setConfirmingRemove(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmingRemove, onClose]);

  const launch = async (source: GameSource | 'preferred') => {
    setLaunching(source);
    try {
      await onLaunch(game, source === 'preferred' ? undefined : source);
    } finally {
      setLaunching(null);
    }
  };

  const src = coverSrc(game);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--detail" onClick={(e) => e.stopPropagation()}>
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
            </div>
            {!rating || rating.sources.every((s) => s.score === null) ? (
              <p className="ratings__empty">Sem avaliação.</p>
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
            <p className="sources__title">Iniciar por fonte</p>
            {game.sources.map((source) => {
              const isPreferred = game.preferredSource?.id === source.id;
              const busy = launching === source;
              return (
                <div
                  key={source.id}
                  className={`source-row ${isPreferred ? 'source-row--preferred' : ''}`}
                  title={
                    source.platform !== 'local'
                      ? 'Abre via plataforma oficial — o launcher apenas inicia o jogo'
                      : undefined
                  }
                >
                  <span className="source-row__label">
                    {sourceLabel(source)}
                    {isPreferred && <span className="badge">padrão</span>}
                  </span>
                  <span className="source-row__launch">
                    <button
                      type="button"
                      className="source-row__play"
                      disabled={busy}
                      onClick={() => void launch(source)}
                    >
                      {busy ? 'Iniciando…' : '▶ Jogar'}
                    </button>
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
          <button
            type="button"
            className="primary"
            disabled={!game.preferredSource || launching !== null}
            onClick={() => void launch('preferred')}
          >
            {launching === 'preferred' ? 'Iniciando…' : '▶ Jogar (Enter)'}
          </button>
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
      </div>
    </div>
  );
}
