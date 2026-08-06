import type { AppSection } from '../../lib/app-types';

interface Props {
  open: boolean;
  section: AppSection;
  userName: string;
  navRef: React.RefObject<HTMLElement>;
  onClose: () => void;
  onSection: (section: AppSection) => void;
  onSettings: () => void;
  onLogout: () => void;
}

export default function SideNav({
  open,
  section,
  userName,
  navRef,
  onClose,
  onSection,
  onSettings,
  onLogout,
}: Props): JSX.Element {
  return (
    <>
      {open && (
        <button type="button" className="side-nav-backdrop" aria-label="Fechar menu" onClick={onClose} />
      )}
      <nav
        ref={navRef}
        id="side-nav"
        className={`side-nav ${open ? 'side-nav--open' : ''}`}
        aria-label="Navegação principal"
        aria-hidden={!open}
      >
        <div className="side-nav__brand">
          <strong>Game Aggregator</strong>
          <small>{userName}</small>
        </div>
        <button
          type="button"
          className={`side-nav__item ${section === 'library' ? 'side-nav__item--active' : ''}`}
          onClick={() => onSection('library')}
        >
          <span className="side-nav__label">Jogos</span>
          <span className="side-nav__hint">Biblioteca</span>
        </button>
        <button
          type="button"
          className={`side-nav__item ${section === 'stores' ? 'side-nav__item--active' : ''}`}
          onClick={() => onSection('stores')}
        >
          <span className="side-nav__label">Lojas</span>
          <span className="side-nav__hint">Conectar fontes</span>
        </button>
        <button
          type="button"
          className={`side-nav__item ${section === 'wishlist' ? 'side-nav__item--active' : ''}`}
          onClick={() => onSection('wishlist')}
        >
          <span className="side-nav__label">Wishlist</span>
          <span className="side-nav__hint">Promoções</span>
        </button>
        <button
          type="button"
          className={`side-nav__item ${section === 'retro' ? 'side-nav__item--active' : ''}`}
          onClick={() => onSection('retro')}
        >
          <span className="side-nav__label">Retro</span>
          <span className="side-nav__hint">Consoles e ROMs</span>
        </button>
        <button
          type="button"
          className={`side-nav__item ${section === 'organize' ? 'side-nav__item--active' : ''}`}
          onClick={() => onSection('organize')}
        >
          <span className="side-nav__label">Organizar</span>
          <span className="side-nav__hint">Mover para pasta padrão</span>
        </button>
        <div className="side-nav__spacer" />
        <button type="button" className="side-nav__item side-nav__item--ghost" onClick={onSettings}>
          <span className="side-nav__label">Configurações</span>
        </button>
        <button type="button" className="side-nav__item side-nav__item--ghost" onClick={onLogout}>
          <span className="side-nav__label">Sair</span>
        </button>
      </nav>
    </>
  );
}
