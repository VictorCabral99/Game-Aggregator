import { useEffect, useState } from 'react';
import type { Game, LaunchResult } from '../../../shared/api';
import { coverSrc, PLATFORM_LABELS } from './GameCard';

interface Props {
  game: Game;
  onClose: () => void;
  onEdit: () => void;
  onRemove: () => Promise<void>;
  onLaunch: (game: Game) => Promise<LaunchResult>;
}

export default function GameDetailModal({
  game,
  onClose,
  onEdit,
  onRemove,
  onLaunch,
}: Props): JSX.Element {
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmingRemove) setConfirmingRemove(false);
        else onClose();
      } else if (e.key === 'Enter' && !confirmingRemove) {
        void launch();
      } else if (e.key === 'Delete') {
        setConfirmingRemove(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmingRemove, onClose]);

  const launch = async () => {
    setLaunching(true);
    await onLaunch(game);
    setLaunching(false);
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

        <dl className="modal__meta">
          <div>
            <dt>Plataforma</dt>
            <dd>{PLATFORM_LABELS[game.platform] ?? 'Local'}</dd>
          </div>
          {game.executable && (
            <div>
              <dt>Executável</dt>
              <dd className="mono">{game.executable}</dd>
            </div>
          )}
          {game.cwd && (
            <div>
              <dt>Diretório de trabalho</dt>
              <dd className="mono">{game.cwd}</dd>
            </div>
          )}
          {game.lastPlayedAt && (
            <div>
              <dt>Última vez jogado</dt>
              <dd>{new Date(game.lastPlayedAt).toLocaleString('pt-BR')}</dd>
            </div>
          )}
        </dl>

        {game.platform === 'steam' && (
          <p className="hint">Abre via Steam — o launcher apenas inicia o jogo pela plataforma oficial.</p>
        )}

        <div className="modal__actions">
          <button type="button" className="primary" disabled={launching} onClick={() => void launch()}>
            {launching ? 'Iniciando…' : '▶ Jogar (Enter)'}
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
