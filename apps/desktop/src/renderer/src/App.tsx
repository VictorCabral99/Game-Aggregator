import GameDetailModal from './components/GameDetailModal';
import GameFormModal from './components/GameFormModal';
import ProvidersModal from './components/ProvidersModal';
import AboutModal from './components/AboutModal';
import DuplicatesModal from './components/DuplicatesModal';
import EmulationModal from './components/EmulationModal';
import SettingsModal from './components/SettingsModal';
import WishlistModal from './components/WishlistModal';
import LoginModal from './components/LoginModal';
import AccountsPanel from './components/AccountsPanel';
import StoreConnectScreen from './components/StoreConnectScreen';
import OnboardingModal from './components/OnboardingModal';
import Toast from './components/Toast';
import SideNav from './components/layout/SideNav';
import LibraryPage from './pages/LibraryPage';
import OrganizePage from './pages/OrganizePage';
import { useAppState } from './hooks/useAppState';

export default function App(): JSX.Element {
  const s = useAppState();

  return (
    <div
      className={`app-layout ${s.user ? 'app-layout--authed' : ''} ${s.sideNavOpen ? 'app-layout--nav-open' : ''}`}
      data-pad-root={s.view.kind === 'library' && !s.detailGame ? '1' : undefined}
    >
      {s.user && (
        <SideNav
          open={s.sideNavOpen}
          section={s.section}
          userName={s.user.name?.split(' ')[0] || s.user.email}
          navRef={s.sideNavRef}
          onClose={() => s.setSideNavOpen(false)}
          onSection={s.goSection}
          onSettings={() => {
            s.setSideNavOpen(false);
            s.setView({ kind: 'settings' });
          }}
          onLogout={() => void s.logout()}
        />
      )}

      <main className="shell">
        {s.section === 'stores' && s.user ? (
          <StoreConnectScreen
            embedded
            userName={s.user.name}
            onContinue={s.finishStoresSetup}
            onLibraryChanged={() => {
              void s.refresh();
              void window.api
                .ratingsEnrichStream({})
                .then(() => {
                  void s.refreshRatings();
                  void s.refresh();
                })
                .catch(() => undefined);
            }}
            onOpenEmulation={() => s.goSection('retro')}
          />
        ) : s.section === 'wishlist' && s.user ? (
          <WishlistModal
            embedded
            onClose={() => s.goSection('library')}
            onMenu={() => s.setSideNavOpen(true)}
            onAlerts={(alerts) =>
              s.notify(
                alerts
                  .map((a) => `${a.title} — ${a.currentPrice.toFixed(2)} ${a.currency}`)
                  .join(' · '),
                'ok'
              )
            }
          />
        ) : s.section === 'retro' && s.user ? (
          <EmulationModal
            embedded
            onClose={() => s.goSection('library')}
            onLaunch={s.launch}
            onChanged={() => void s.refresh()}
          />
        ) : s.section === 'organize' && s.user ? (
          <OrganizePage
            onMenu={() => s.setSideNavOpen(true)}
            onLibraryChanged={() => void s.refresh()}
          />
        ) : (
          <LibraryPage
            games={s.games}
            steam={s.steam}
            stores={s.stores}
            showMenuButton={Boolean(s.user)}
            sideNavOpen={s.sideNavOpen}
            headerMenuOpen={s.headerMenuOpen}
            headerMenuRef={s.headerMenuRef}
            searchRef={s.searchRef}
            syncingAll={s.syncingAll}
            syncingRatings={s.syncingRatings}
            enrichProgress={s.enrichProgress}
            filter={s.filter}
            installedOnly={s.installedOnly}
            minRating={s.minRating}
            ratings={s.ratings}
            query={s.query}
            sortBy={s.sortBy}
            genreFilter={s.genreFilter}
            allGenres={s.allGenres}
            useRatingGroups={s.useRatingGroups}
            visibleGames={s.visibleGames}
            filteredGames={s.filteredGames}
            gridRows={s.gridRows}
            cols={s.cols}
            selected={s.selected}
            hideNotes={s.hideNotes}
            profileTokens={s.profileTokens}
            ready={s.ready}
            onToggleSideNav={() => s.setSideNavOpen((o) => !o)}
            onToggleHeaderMenu={() => s.setHeaderMenuOpen((o) => !o)}
            onCloseHeaderMenu={() => s.setHeaderMenuOpen(false)}
            onAddGame={() => s.setView({ kind: 'form', gameId: null })}
            onSyncAll={() => void s.syncAll()}
            onSyncRatings={() => void s.syncRatings(true)}
            onProviders={() => s.setView({ kind: 'providers' })}
            onDuplicates={() => s.setView({ kind: 'duplicates' })}
            onSettings={() => s.setView({ kind: 'settings' })}
            onAbout={() => s.setView({ kind: 'about' })}
            onFilter={(id) => {
              s.setFilter(id);
              s.setSelected(0);
            }}
            onInstalledOnly={() => {
              s.setInstalledOnly((v) => !v);
              s.setSelected(0);
            }}
            onToggleMinRating={() => {
              s.setMinRating((v) => (v === 80 ? 0 : 80));
              s.setSelected(0);
            }}
            onQuery={(value) => {
              s.setQuery(value);
              s.setSelected(0);
            }}
            onSortBy={(value) => {
              s.setSortBy(value);
              s.setSelected(0);
            }}
            onGenreFilter={(value) => {
              s.setGenreFilter(value);
              s.setSelected(0);
            }}
            onSelect={s.setSelected}
            onOpen={(gameId) => s.setView({ kind: 'detail', gameId })}
            onToggleGroup={s.toggleRatingGroup}
          />
        )}

        {s.detailGame && (
          <GameDetailModal
            game={s.detailGame}
            rating={s.ratings[s.detailGame.id] ?? null}
            hideScore={s.hideNotes}
            onClose={() => s.setView({ kind: 'library' })}
            onEdit={() => s.setView({ kind: 'form', gameId: s.detailGame!.id })}
            onRemove={() => s.remove()}
            onLaunch={s.launch}
            onInstall={s.install}
            onSeparateSource={s.separateSource}
            onSyncRating={() => void s.syncRatings(true, { gameIds: [s.detailGame!.id] })}
          />
        )}

        {s.view.kind === 'form' && (
          <GameFormModal
            game={s.formGame}
            onClose={() => s.setView({ kind: 'library' })}
            onSave={s.save}
          />
        )}

        {s.view.kind === 'providers' && (
          <ProvidersModal onClose={() => s.setView({ kind: 'library' })} />
        )}

        {s.view.kind === 'about' && <AboutModal onClose={() => s.setView({ kind: 'library' })} />}

        {s.view.kind === 'duplicates' && (
          <DuplicatesModal
            onClose={() => s.setView({ kind: 'library' })}
            onMerged={() => void s.refresh()}
          />
        )}

        {s.view.kind === 'emulation' && (
          <EmulationModal
            onClose={() => s.setView({ kind: 'library' })}
            onLaunch={s.launch}
            onChanged={() => void s.refresh()}
          />
        )}

        {s.view.kind === 'settings' && (
          <SettingsModal
            onClose={() => s.setView({ kind: 'library' })}
            onChanged={() => {
              s.reloadUxSettings();
              void s.refresh();
            }}
            onOpenAccounts={() => s.setView({ kind: 'accounts' })}
          />
        )}

        {s.view.kind === 'accounts' && (
          <AccountsPanel onClose={() => s.setView({ kind: 'settings' })} />
        )}

        {!s.user && (
          <LoginModal
            onSuccess={(u) => {
              s.setUser(u);
              void window.api.settingsGet('onboarding.stores').then((done) => {
                s.goSection(done !== '1' ? 'stores' : 'library');
              });
            }}
          />
        )}

        {s.showOnboarding && s.user && s.section === 'library' && (
          <OnboardingModal
            steamAvailable={Boolean(s.steam?.available)}
            steamGames={s.steam?.gamesCount ?? 0}
            onSyncSteam={async () => {
              const res = await window.api.steamScan();
              s.notify(
                res.inserted > 0
                  ? `Steam: ${res.inserted} jogos novos (${res.total} no total)`
                  : `Steam: ${res.total} jogos verificados`
              );
              await s.refresh();
              await window.api.settingsSet('onboarding.done', '1');
              s.setShowOnboarding(false);
            }}
            onSkip={() => {
              void window.api.settingsSet('onboarding.done', '1');
              s.setShowOnboarding(false);
            }}
            onAddLocal={() => {
              void window.api.settingsSet('onboarding.done', '1');
              s.setShowOnboarding(false);
              s.setView({ kind: 'form', gameId: null });
            }}
          />
        )}

        <Toast message={s.toast?.message ?? ''} kind={s.toast?.kind ?? 'ok'} />
      </main>
    </div>
  );
}
