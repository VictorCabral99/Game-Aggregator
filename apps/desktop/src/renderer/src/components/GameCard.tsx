import type { Game } from '../../../shared/api';

export function coverSrc(game: Game): string | null {
  if (game.coverPath) return `cover://img/${encodeURIComponent(game.coverPath)}`;
  if (game.coverUrl) return game.coverUrl;
  return null;
}

interface Props {
  game: Game;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}

export default function GameCard({ game, selected, onSelect, onOpen }: Props): JSX.Element {
  const src = coverSrc(game);
  const platformLabel = game.platform === 'local' ? null : PLATFORM_LABELS[game.platform] ?? null;
  return (
    <button
      type="button"
      className={`card ${selected ? 'card--selected' : ''}`}
      onClick={onSelect}
      onDoubleClick={onOpen}
      title={game.title}
    >
      <div className="card__cover">
        {src ? (
          <img src={src} alt="" loading="lazy" />
        ) : (
          <div className="card__placeholder">{game.title.slice(0, 1).toUpperCase()}</div>
        )}
        {platformLabel && <span className="card__badge">{platformLabel}</span>}
      </div>
      <div className="card__title">{game.title}</div>
      {game.lastPlayedAt && <div className="card__meta">Jogado {dateLabel(game.lastPlayedAt)}</div>}
    </button>
  );
}

export const PLATFORM_LABELS: Record<string, string> = {
  steam: 'Steam',
  epic: 'Epic',
  gog: 'GOG',
  amazon: 'Amazon',
  emulator: 'Retro',
};

function dateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
