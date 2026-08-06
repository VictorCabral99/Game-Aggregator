import type { Game, GamePlatform, RatingsSummary } from '../../../shared/api';

export function coverSrc(game: Game): string | null {
  if (game.coverPath) return `cover://img/${encodeURIComponent(game.coverPath)}`;
  if (game.coverUrl) return game.coverUrl;
  return null;
}

interface Props {
  game: Game;
  selected: boolean;
  score?: number | null;
  ratingSummary?: RatingsSummary | null;
  hideScore?: boolean;
  onSelect: () => void;
  onOpen: () => void;
}

function displaySourceScore(
  summary: RatingsSummary | null | undefined,
  source: 'rawg' | 'metacritic' | 'steam'
): number | null {
  const row = summary?.sources.find((s) => s.source === source);
  if (row?.score == null || row.score <= 0) return null;
  if (source === 'rawg' && row.score <= 5) return Math.round(row.score * 20 * 10) / 10;
  return row.score;
}

export default function GameCard({
  game,
  selected,
  score,
  ratingSummary,
  hideScore,
  onSelect,
  onOpen,
}: Props): JSX.Element {
  const src = coverSrc(game);
  const preferred = game.preferredSource;
  const badges = game.sources.map((s) => PLATFORM_LABELS[s.platform]).filter(Boolean);
  const uniqueBadges = [...new Set(badges)];
  const meta = displaySourceScore(ratingSummary, 'metacritic');
  const rawg = displaySourceScore(ratingSummary, 'rawg');
  const steam = displaySourceScore(ratingSummary, 'steam');
  const showScore = !hideScore && score != null && score > 0;
  const steamReviews =
    ratingSummary?.sources.find((s) => s.source === 'steam')?.reviewCount ?? null;
  // Breakdown só se houver fontes além da nota principal já no canto (evita duplicar Steam %)
  const extraBreakdown =
    !hideScore && Boolean(meta || rawg || (steam != null && ratingSummary?.source !== 'steam'));

  const metaBits: string[] = [];
  if (preferred?.lastPlayedAt) metaBits.push(`Jogado ${dateLabel(preferred.lastPlayedAt)}`);
  if (game.sources.length > 1) metaBits.push(`${game.sources.length} fontes`);

  const scoreTitle =
    ratingSummary?.source === 'steam'
      ? `Steam ${Math.round(score ?? 0)}%` +
        (steamReviews != null && steamReviews > 0
          ? ` · ${steamReviews.toLocaleString('pt-BR')} reviews`
          : '')
      : `Nota ${Math.round(score ?? 0)}`;

  return (
    <button
      type="button"
      className={`card ${selected ? 'card--selected' : ''}`}
      data-game-id={game.id}
      onClick={onSelect}
      onFocus={onSelect}
      onDoubleClick={onOpen}
      title={game.title}
    >
      <div className="card__cover">
        {src ? (
          <img src={src} alt="" loading="lazy" />
        ) : (
          <div className="card__placeholder">{game.title.slice(0, 1).toUpperCase()}</div>
        )}
        <div className="card__chrome">
          <div className="card__badges">
            {uniqueBadges.length > 0 && (
              <span className="card__badge" title={uniqueBadges.join(' · ')}>
                {uniqueBadges.length <= 2
                  ? uniqueBadges.join(' · ')
                  : `${uniqueBadges[0]} +${uniqueBadges.length - 1}`}
              </span>
            )}
            {game.isRemote && <span className="card__badge card__badge--remote">Remote</span>}
          </div>
          {showScore && (
            <span
              className={`card__score ${score >= 80 ? 'card__score--high' : ''}`}
              title={scoreTitle}
            >
              {Math.round(score)}
              {ratingSummary?.source === 'steam' ? '%' : ''}
            </span>
          )}
        </div>
      </div>
      <div className="card__body">
        <div className="card__title">{game.title}</div>
        {extraBreakdown && (
          <div className="card__ratings" title="Metacritic · RAWG · Steam">
            {meta != null && (
              <span className="card__rating card__rating--meta">MC {Math.round(meta)}</span>
            )}
            {rawg != null && <span className="card__rating card__rating--rawg">R {rawg}</span>}
            {steam != null && ratingSummary?.source !== 'steam' && (
              <span className="card__rating card__rating--steam">S {Math.round(steam)}%</span>
            )}
          </div>
        )}
        {metaBits.length > 0 && <div className="card__meta">{metaBits.join(' · ')}</div>}
      </div>
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
