import type { Game, GamePlatform } from '../../../shared/api';

export function coverSrc(game: Game): string | null {
  if (game.coverPath) return `cover://img/${encodeURIComponent(game.coverPath)}`;
  if (game.coverUrl) return game.coverUrl;
  return null;
}

interface Props {
  game: Game;
  selected: boolean;
  score?: number | null;
  hideScore?: boolean;
  onSelect: () => void;
  onOpen: () => void;
}

export default function GameCard({ game, selected, score, hideScore, onSelect, onOpen }: Props): JSX.Element {
  const src = coverSrc(game);
  const preferred = game.preferredSource;
  const badges = game.sources.map((s) => PLATFORM_LABELS[s.platform]).filter(Boolean);
  const uniqueBadges = [...new Set(badges)];
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
        {uniqueBadges.length > 0 && (
          <span className="card__badge">{uniqueBadges.join(' · ')}</span>
        )}
        {!hideScore && score !== undefined && score !== null && score > 0 && (
          <span className={`card__score ${score >= 80 ? 'card__score--high' : ''}`}>
            {Math.round(score)}
          </span>
        )}
      </div>
      <div className="card__title">{game.title}</div>
      {preferred?.lastPlayedAt && (
        <div className="card__meta">Jogado {dateLabel(preferred.lastPlayedAt)}</div>
      )}
      {game.sources.length > 1 && (
        <div className="card__meta">{game.sources.length} fontes</div>
      )}
    </button>
  );
}

export const PLATFORM_LABELS: Record<GamePlatform, string> = {
  steam: 'Steam',
  epic: 'Epic',
  gog: 'GOG',
  amazon: 'Amazon',
  emulator: 'Retro',
  local: 'Local',
  manual: 'Manual',
};

function dateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
