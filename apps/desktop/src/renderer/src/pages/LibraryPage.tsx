import type { Game, RatingsSummary, SteamStatus, StoreId, StoreStatus, ProfileTokens } from '../../../shared/api';
import type { GridRow, RatingBandId } from '../lib/rating-groups';
import type { PlatformFilter, SortBy } from '../lib/app-types';
import VirtualizedGameGrid from '../components/VirtualizedGameGrid';
import LibraryHeader from '../components/layout/LibraryHeader';
import LibraryToolbar from '../components/layout/LibraryToolbar';

interface Props {
  games: Game[];
  steam: SteamStatus | null;
  stores: Partial<Record<StoreId, StoreStatus | null>>;
  showMenuButton: boolean;
  sideNavOpen: boolean;
  headerMenuOpen: boolean;
  headerMenuRef: React.RefObject<HTMLDivElement>;
  searchRef: React.RefObject<HTMLInputElement>;
  syncingAll: boolean;
  syncingRatings: boolean;
  enrichProgress: { index: number; total: number; title: string } | null;
  filter: PlatformFilter;
  installedOnly: boolean;
  minRating: number;
  ratings: Record<string, RatingsSummary | null>;
  query: string;
  sortBy: SortBy;
  genreFilter: string;
  allGenres: string[];
  useRatingGroups: boolean;
  visibleGames: Game[];
  filteredGames: Game[];
  gridRows: GridRow[] | undefined;
  cols: number;
  selected: number;
  hideNotes: boolean;
  profileTokens: ProfileTokens;
  ready: boolean;
  onToggleSideNav: () => void;
  onToggleHeaderMenu: () => void;
  onCloseHeaderMenu: () => void;
  onAddGame: () => void;
  onSyncAll: () => void;
  onSyncRatings: () => void;
  onProviders: () => void;
  onDuplicates: () => void;
  onSettings: () => void;
  onAbout: () => void;
  onFilter: (id: PlatformFilter) => void;
  onInstalledOnly: () => void;
  onToggleMinRating: () => void;
  onQuery: (value: string) => void;
  onSortBy: (value: SortBy) => void;
  onGenreFilter: (value: string) => void;
  onSelect: (index: number) => void;
  onOpen: (gameId: string) => void;
  onToggleGroup: (groupId: RatingBandId) => void;
}

export default function LibraryPage(props: Props): JSX.Element {
  const {
    games,
    enrichProgress,
    filteredGames,
    visibleGames,
    gridRows,
    cols,
    selected,
    ratings,
    hideNotes,
    profileTokens,
    ready,
    onAddGame,
    onSelect,
    onOpen,
    onToggleGroup,
  } = props;

  return (
    <>
      <LibraryHeader
        gamesCount={games.length}
        steam={props.steam}
        stores={props.stores}
        showMenuButton={props.showMenuButton}
        sideNavOpen={props.sideNavOpen}
        headerMenuOpen={props.headerMenuOpen}
        headerMenuRef={props.headerMenuRef}
        syncingAll={props.syncingAll}
        syncingRatings={props.syncingRatings}
        onToggleSideNav={props.onToggleSideNav}
        onToggleHeaderMenu={props.onToggleHeaderMenu}
        onCloseHeaderMenu={props.onCloseHeaderMenu}
        onAddGame={onAddGame}
        onSyncAll={props.onSyncAll}
        onSyncRatings={props.onSyncRatings}
        onProviders={props.onProviders}
        onDuplicates={props.onDuplicates}
        onSettings={props.onSettings}
        onAbout={props.onAbout}
      />

      {enrichProgress && (
        <div className="enrich-bar" role="status" aria-live="polite">
          <strong>
            {enrichProgress.total > 0 ? `${enrichProgress.index}/${enrichProgress.total}` : '…'}
          </strong>
          <div className="enrich-bar__track">
            <div
              className="enrich-bar__fill"
              style={{
                width:
                  enrichProgress.total > 0
                    ? `${Math.round((enrichProgress.index / enrichProgress.total) * 100)}%`
                    : '8%',
              }}
            />
          </div>
          <span className="hint">Capas retro → Steam % — {enrichProgress.title}</span>
        </div>
      )}

      <LibraryToolbar
        games={games}
        filter={props.filter}
        installedOnly={props.installedOnly}
        minRating={props.minRating}
        ratings={ratings}
        query={props.query}
        sortBy={props.sortBy}
        genreFilter={props.genreFilter}
        allGenres={props.allGenres}
        useRatingGroups={props.useRatingGroups}
        visibleCount={visibleGames.length}
        filteredCount={filteredGames.length}
        searchRef={props.searchRef}
        onFilter={props.onFilter}
        onInstalledOnly={props.onInstalledOnly}
        onToggleMinRating={props.onToggleMinRating}
        onQuery={props.onQuery}
        onSortBy={props.onSortBy}
        onGenreFilter={props.onGenreFilter}
      />

      {filteredGames.length === 0 ? (
        <section className="empty">
          {games.length === 0 ? (
            <>
              <h2>Biblioteca vazia</h2>
              <p>Adicione o primeiro jogo (.exe) para começar.</p>
              <button type="button" className="primary" onClick={onAddGame}>
                Adicionar jogo
              </button>
            </>
          ) : (
            <>
              <h2>Nenhum jogo nesta plataforma</h2>
              <p>Sincronize a biblioteca ou troque o filtro.</p>
            </>
          )}
        </section>
      ) : (
        <VirtualizedGameGrid
          games={gridRows ? undefined : visibleGames}
          rows={gridRows}
          cols={cols}
          selected={selected}
          scores={Object.fromEntries(
            filteredGames.map((g) => [g.id, ratings[g.id]?.score ?? null])
          )}
          ratings={ratings}
          hideScores={hideNotes}
          cardHeight={Math.round(profileTokens.cardWidth * 1.78)}
          gap={profileTokens.cardGap}
          onSelect={onSelect}
          onOpen={onOpen}
          onToggleGroup={onToggleGroup}
        />
      )}

      {!ready && (
        <div className="boot-ready" aria-live="polite">
          Carregando biblioteca…
        </div>
      )}

      <footer className="hint">
        Controle: D-pad move · A confirma · B volta · Y busca · L1/R1 filtro · Start menu
      </footer>
    </>
  );
}
