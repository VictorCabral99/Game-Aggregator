import type { Game } from '../../../../shared/api';
import { FILTER_OPTIONS, type PlatformFilter, type SortBy } from '../../lib/app-types';

interface Props {
  games: Game[];
  filter: PlatformFilter;
  installedOnly: boolean;
  minRating: number;
  ratings: Record<string, { score: number | null } | null>;
  query: string;
  sortBy: SortBy;
  genreFilter: string;
  allGenres: string[];
  useRatingGroups: boolean;
  visibleCount: number;
  filteredCount: number;
  searchRef: React.RefObject<HTMLInputElement>;
  onFilter: (id: PlatformFilter) => void;
  onInstalledOnly: () => void;
  onToggleMinRating: () => void;
  onQuery: (value: string) => void;
  onSortBy: (value: SortBy) => void;
  onGenreFilter: (value: string) => void;
}

export default function LibraryToolbar({
  games,
  filter,
  installedOnly,
  minRating,
  ratings,
  query,
  sortBy,
  genreFilter,
  allGenres,
  useRatingGroups,
  visibleCount,
  filteredCount,
  searchRef,
  onFilter,
  onInstalledOnly,
  onToggleMinRating,
  onQuery,
  onSortBy,
  onGenreFilter,
}: Props): JSX.Element {
  return (
    <>
      <div className="filters" role="tablist" aria-label="Filtrar por plataforma">
        {FILTER_OPTIONS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            className={`filter-chip ${filter === id ? 'filter-chip--active' : ''}`}
            onClick={() => onFilter(id)}
          >
            {label}
            <span className="filter-chip__count">
              {id === 'all'
                ? games.length
                : games.filter((g) => g.sources.some((s) => s.platform === id)).length}
            </span>
          </button>
        ))}
        <button
          type="button"
          className={`filter-chip ${installedOnly ? 'filter-chip--active' : ''}`}
          aria-pressed={installedOnly}
          onClick={onInstalledOnly}
        >
          Instalados
          <span className="filter-chip__count">
            {games.filter((g) => g.sources.some((s) => s.isInstalled)).length}
          </span>
        </button>
        <button
          type="button"
          className={`filter-chip ${minRating === 80 ? 'filter-chip--active' : ''}`}
          aria-pressed={minRating === 80}
          onClick={onToggleMinRating}
        >
          Nota ≥ 80
          <span className="filter-chip__count">
            {games.filter((g) => (ratings[g.id]?.score ?? 0) >= 80).length}
          </span>
        </button>
      </div>

      <div className="toolbar">
        <input
          ref={searchRef}
          type="search"
          className="search"
          placeholder="Buscar por nome… (Y no controle)"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
        <select
          className="genre-filter"
          value={sortBy}
          onChange={(e) => onSortBy(e.target.value as SortBy)}
          aria-label="Ordenar por"
        >
          <option value="name">Ordenar: nome</option>
          <option value="rating">Ordenar: nota (Steam %)</option>
        </select>
        {allGenres.length > 0 && (
          <select
            className="genre-filter"
            value={genreFilter}
            onChange={(e) => onGenreFilter(e.target.value)}
            aria-label="Filtrar por gênero"
          >
            <option value="all">Todos os gêneros</option>
            {allGenres.map((genre) => (
              <option key={genre} value={genre}>
                {genre}
              </option>
            ))}
          </select>
        )}
        <span className="toolbar__count">
          {useRatingGroups
            ? `${visibleCount} visíveis · ${filteredCount} de ${games.length}`
            : `${visibleCount} de ${games.length} jogos`}
        </span>
      </div>
    </>
  );
}
