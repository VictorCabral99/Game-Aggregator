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
      </div>
      <div className="card__title">{game.title}</div>
      {game.lastPlayedAt && <div className="card__meta">Jogado {dateLabel(game.lastPlayedAt)}</div>}
    </button>
  );
}

function dateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
