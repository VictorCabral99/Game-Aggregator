import { useEffect, useState } from 'react';

interface Props {
  steamAvailable: boolean;
  steamGames: number;
  onSyncSteam: () => Promise<void>;
  onSkip: () => void;
  onAddLocal: () => void;
}

/** Primeiro uso: detectar Steam e oferecer sync (P9-03). */
export default function OnboardingModal({
  steamAvailable,
  steamGames,
  onSyncSteam,
  onSkip,
  onAddLocal,
}: Props): JSX.Element {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSkip]);

  const sync = async () => {
    setBusy(true);
    try {
      await onSyncSteam();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onSkip}>
      <div className="modal modal--onboarding" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" data-pad-root="1">
        <h2>Bem-vindo ao Launcher</h2>
        <p className="onboarding__lead">
          Biblioteca unificada com Steam, lojas, emulação, notas e wishlist — tudo em tela cheia.
        </p>

        {steamAvailable ? (
          <div className="onboarding__card">
            <strong>Steam detectado</strong>
            <p>
              {steamGames > 0
                ? `${steamGames} jogos instalados encontrados. Sincronize para preencher a grade.`
                : 'Steam está instalado. Sincronize para importar a biblioteca local.'}
            </p>
            <button type="button" className="primary" disabled={busy} onClick={() => void sync()}>
              {busy ? 'Sincronizando…' : 'Sincronizar Steam'}
            </button>
          </div>
        ) : (
          <div className="onboarding__card">
            <strong>Steam não encontrado</strong>
            <p>Você pode adicionar jogos locais (.exe) agora ou configurar o path depois em Configurações.</p>
            <button type="button" className="primary" onClick={onAddLocal}>
              Adicionar jogo local
            </button>
          </div>
        )}

        <div className="modal__actions">
          <button type="button" onClick={onSkip} disabled={busy}>
            Pular por agora
          </button>
        </div>
      </div>
    </div>
  );
}
