import type { SteamStatus, StoreId, StoreStatus } from '../../../../shared/api';
import { STORE_LABELS } from '../../lib/app-types';

interface Props {
  gamesCount: number;
  steam: SteamStatus | null;
  stores: Partial<Record<StoreId, StoreStatus | null>>;
  showMenuButton: boolean;
  sideNavOpen: boolean;
  headerMenuOpen: boolean;
  headerMenuRef: React.RefObject<HTMLDivElement>;
  syncingAll: boolean;
  syncingRatings: boolean;
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
}

export default function LibraryHeader({
  gamesCount,
  steam,
  stores,
  showMenuButton,
  sideNavOpen,
  headerMenuOpen,
  headerMenuRef,
  syncingAll,
  syncingRatings,
  onToggleSideNav,
  onToggleHeaderMenu,
  onCloseHeaderMenu,
  onAddGame,
  onSyncAll,
  onSyncRatings,
  onProviders,
  onDuplicates,
  onSettings,
  onAbout,
}: Props): JSX.Element {
  return (
    <header className="shell__header">
      {showMenuButton && (
        <button
          type="button"
          className="header__menu-btn"
          aria-expanded={sideNavOpen}
          aria-controls="side-nav"
          title="Menu (Start)"
          onClick={onToggleSideNav}
        >
          ☰
        </button>
      )}
      <h1>Game Aggregator Launcher</h1>
      <span className="badge">{gamesCount} jogos</span>
      {steam && (
        <span className={`badge badge--steam ${steam.available ? '' : 'badge--muted'}`}>
          {steam.available ? `Steam: ${steam.gamesCount} detectados` : 'Steam não encontrado'}
        </span>
      )}
      {STORE_LABELS.map(({ id, label }) => {
        const s = stores[id];
        const unavailable = !s?.available;
        return (
          <span key={id} className={`badge ${unavailable ? 'badge--muted' : ''}`}>
            {unavailable ? `${label} indisponível` : `${label}: ${s.gamesCount}`}
          </span>
        );
      })}
      <div className="header__actions" ref={headerMenuRef}>
        <button type="button" className="primary" onClick={onAddGame}>
          + Adicionar
        </button>
        <div className="kebab">
          <button
            type="button"
            className="kebab__btn"
            aria-haspopup="menu"
            aria-expanded={headerMenuOpen}
            aria-label="Mais ações"
            title="Mais ações"
            onClick={onToggleHeaderMenu}
          >
            ⋯
          </button>
          {headerMenuOpen && (
            <div className="kebab__menu" role="menu">
              <button
                type="button"
                role="menuitem"
                disabled={syncingAll}
                onClick={() => {
                  onCloseHeaderMenu();
                  onSyncAll();
                }}
              >
                {syncingAll ? 'Sincronizando lojas…' : 'Sync lojas'}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={syncingRatings}
                onClick={() => {
                  onCloseHeaderMenu();
                  onSyncRatings();
                }}
              >
                {syncingRatings ? 'Enriquecendo…' : 'Atualizar notas (+ capas retro)'}
              </button>
              <hr className="kebab__sep" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onCloseHeaderMenu();
                  void window.api.windowToggleFullscreen();
                }}
              >
                Tela cheia (F11)
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onCloseHeaderMenu();
                  onProviders();
                }}
              >
                Providers
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onCloseHeaderMenu();
                  onDuplicates();
                }}
              >
                Duplicatas
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onCloseHeaderMenu();
                  onSettings();
                }}
              >
                Configurações
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onCloseHeaderMenu();
                  onAbout();
                }}
              >
                Sobre
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
