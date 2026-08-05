import { useEffect, useState } from 'react';

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
  const [version, setVersion] = useState('');
  const [changelog, setChangelog] = useState('');

  useEffect(() => {
    void window.api.appVersion().then(setVersion).catch(() => undefined);
    void window.api.appChangelog().then(setChangelog).catch(() => undefined);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal--about"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        data-pad-root="1"
      >
        <h2>Sobre</h2>
        <p>
          <strong>Game Aggregator Launcher</strong>
          {version ? ` v${version}` : ''} — launcher unificado de jogos para Windows.
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

        {changelog && (
          <>
            <h3 className="about__subtitle">Changelog</h3>
            <pre className="about__changelog">{changelog.slice(0, 4000)}</pre>
          </>
        )}

        <div className="modal__actions">
          <button type="button" onClick={onClose}>Fechar (Esc)</button>
        </div>
      </div>
    </div>
  );
}
