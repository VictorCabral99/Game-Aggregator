import { useEffect } from 'react';

interface Props {
  onClose: () => void;
}

const ATTRIBUTIONS = [
  {
    name: 'Legendary',
    role: 'Backend da Epic Games Store (listagem + launch)',
    url: 'https://github.com/derrod/legendary',
  },
  {
    name: 'gogdl',
    role: 'Backend da GOG Galaxy (listagem + launch)',
    url: 'https://github.com/Heroic-Games-Launcher/heroic-gogdl',
  },
  {
    name: 'Nile',
    role: 'Backend da Amazon Games (listagem + launch)',
    url: 'https://github.com/imLinguin/nile',
  },
];

export default function AboutModal({ onClose }: Props): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--about" onClick={(e) => e.stopPropagation()}>
        <h2>Sobre</h2>
        <p>
          <strong>Game Aggregator Launcher</strong> — launcher unificado de jogos para Windows.
          Produto próprio: não é um fork do Heroic Games Launcher nem do Playnite. Usa CLIs de
          loja (sidecars) apenas como backend de listagem/launch.
        </p>

        <h3 className="about__subtitle">Sidecars (atribuição)</h3>
        <ul className="about__list">
          {ATTRIBUTIONS.map((a) => (
            <li key={a.name}>
              <strong>{a.name}</strong> — {a.role}{' '}
              <a href={a.url} onClick={(e) => e.stopPropagation()}>
                {a.url.replace('https://github.com/', 'github.com/')}
              </a>
            </li>
          ))}
        </ul>

        <p className="hint">
          Steam não usa sidecar: scan local de manifests + launch via{' '}
          <span className="mono">steam://</span>.
        </p>

        <div className="modal__actions">
          <button type="button" onClick={onClose}>Fechar (Esc)</button>
        </div>
      </div>
    </div>
  );
}
