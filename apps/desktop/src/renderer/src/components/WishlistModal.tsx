import { useEffect, useMemo, useState } from 'react';
import type { ITADSearchResult, WishlistAlert, WishlistEntry } from '../../../shared/api';
import { wishlistCoverCandidates } from '../lib/wishlist-cover';
import {
  isHistoricalLowDeal,
  sortWishlistEntries,
  type WishlistSortMode,
} from '../lib/wishlist-sort';

interface Props {
  onClose: () => void;
  onAlerts?: (alerts: WishlistAlert[]) => void;
  onMenu?: () => void;
  embedded?: boolean;
}

function formatMoney(amount: number | null | undefined, currency: string): string {
  if (amount == null) return '—';
  const code = (currency || 'BRL').toUpperCase();
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: code === 'BRL' || code === 'R$' ? 'BRL' : code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `R$ ${amount.toFixed(2)}`;
  }
}

interface CardProps {
  entry: WishlistEntry;
  onUpdate: (
    id: string,
    patch: Partial<{ targetPrice: number | null; alertEnabled: boolean }>
  ) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onOpenOffer: (entry: WishlistEntry) => void;
}

function WishlistCard({ entry, onUpdate, onRemove, onOpenOffer }: CardProps): JSX.Element {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [target, setTarget] = useState<string>(entry.targetPrice?.toString() ?? '');
  const [coverIdx, setCoverIdx] = useState(0);
  const [coverFailed, setCoverFailed] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const candidates = useMemo(() => wishlistCoverCandidates(entry), [entry]);
  const cover = !coverFailed ? candidates[coverIdx] ?? null : null;

  const saveTarget = () => {
    const v = target.trim() === '' ? null : Number(target);
    if (Number.isNaN(v as number)) return;
    void onUpdate(entry.id, { targetPrice: v });
  };

  const p = entry.price;
  const currency = p?.currency ?? entry.currency ?? '';
  const onSale = Boolean(p?.cutPercent && p.cutPercent > 0);
  const histLow = isHistoricalLowDeal(entry);
  const hasOffer = Boolean(p?.url);

  return (
    <li className={`wl-card ${histLow ? 'wl-card--hist-low' : ''}`}>
      <div className="wl-card__cover" aria-hidden="true">
        {cover ? (
          <img
            src={cover}
            alt=""
            loading="lazy"
            onError={() => {
              setCoverIdx((i) => {
                if (i + 1 < candidates.length) return i + 1;
                setCoverFailed(true);
                return i;
              });
            }}
          />
        ) : (
          <span className="wl-card__ph">{entry.title.slice(0, 2)}</span>
        )}
        {onSale && <span className="wl-card__cut">-{p!.cutPercent}%</span>}
        {histLow && <span className="wl-card__badge">No mínimo</span>}
      </div>

      <div className="wl-card__body">
        <strong className="wl-card__title" title={entry.title}>
          {entry.title}
        </strong>
        {p?.shopName && <span className="wl-card__shop">{p.shopName}</span>}

        <div className="wl-card__prices">
          <div className="wl-card__price">
            <span>Cheio</span>
            <strong className="wl-card__full">{formatMoney(p?.regularPrice, currency)}</strong>
          </div>
          <div className="wl-card__price">
            <span>Mínimo</span>
            <strong className={histLow ? 'wl-card__low wl-card__low--active' : 'wl-card__low'}>
              {formatMoney(p?.historicalLow, currency)}
            </strong>
          </div>
          <div className="wl-card__price wl-card__price--now">
            <span>Atual</span>
            <strong className={onSale ? 'wl-card__now wl-card__now--sale' : 'wl-card__now'}>
              {formatMoney(p?.currentPrice, currency)}
            </strong>
          </div>
        </div>

        <div className="wl-card__actions">
          {hasOffer && (
            <button type="button" className="primary" onClick={() => onOpenOffer(entry)}>
              Oferta
            </button>
          )}
          <button type="button" onClick={() => setShowMore((v) => !v)}>
            {showMore ? 'Menos' : 'Mais'}
          </button>
        </div>

        {showMore && (
          <div className="wl-card__panel">
            <input
              type="number"
              step="0.01"
              min="0"
              className="wl-card__target"
              placeholder="Alvo"
              title="Preço alvo"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              onBlur={saveTarget}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
            />
            <label className="wl-card__alert">
              <input
                type="checkbox"
                checked={entry.alertEnabled}
                onChange={(e) => void onUpdate(entry.id, { alertEnabled: e.target.checked })}
              />
              Alerta
            </label>
            {confirmRemove ? (
              <>
                <button type="button" className="danger" onClick={() => void onRemove(entry.id)}>
                  Confirmar
                </button>
                <button type="button" onClick={() => setConfirmRemove(false)}>
                  Cancelar
                </button>
              </>
            ) : (
              <button type="button" className="danger-ghost" onClick={() => setConfirmRemove(true)}>
                Remover
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export default function WishlistModal({
  onClose,
  onAlerts,
  onMenu,
  embedded = false,
}: Props): JSX.Element {
  const [entries, setEntries] = useState<WishlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ITADSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<WishlistSortMode>('price');

  const sortedEntries = useMemo(
    () => sortWishlistEntries(entries, sortMode),
    [entries, sortMode]
  );

  const load = async () => {
    try {
      const list = await window.api.wishlistList();
      setEntries(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (adding) {
          setAdding(false);
          setQuery('');
          setResults(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adding, onClose]);

  const search = async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    setSearching(true);
    try {
      const res = await window.api.wishlistSearch(q);
      setResults(res);
      if (res.length === 0) setMessage('Nenhum resultado no ITAD. Tente outro nome ou adicione manualmente.');
      else setMessage(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  };

  const addEntry = async (title: string, result?: ITADSearchResult) => {
    try {
      await window.api.wishlistAdd({
        title: title.trim(),
        itadId: result?.id ?? null,
        slug: result?.slug ?? null,
      });
      setQuery('');
      setResults(null);
      setManualTitle('');
      setAdding(false);
      setMessage(null);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const syncPrices = async () => {
    setSyncing(true);
    try {
      const res = await window.api.wishlistSyncPrices();
      if (res.noKey) {
        setMessage('Configure a chave ITAD em Configurações para buscar preços');
      } else if (res.alerts.length > 0) {
        onAlerts?.(res.alerts);
        setMessage(`Preços atualizados (${res.updated}). ${res.alerts.length} oferta(s) dentro do preço alvo!`);
      } else if (res.updated > 0) {
        setMessage(`Preços atualizados: ${res.updated} jogo(s)`);
      } else {
        setMessage('Preços já frescos (TTL 6h)');
      }
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  };

  const importSteam = async () => {
    setImporting(true);
    try {
      const res = await window.api.wishlistImportSteam();
      if (res.error) setMessage(res.error);
      else if (res.warning) setMessage(res.warning);
      else setMessage(`Wishlist Steam: ${res.imported} novos, ${res.skipped} atualizados/já existentes`);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  };

  const remove = async (id: string) => {
    await window.api.wishlistRemove(id);
    await load();
  };

  const openOffer = (entry: WishlistEntry) => {
    if (entry.price?.url) void window.api.openExternal(entry.price.url);
  };

  const updateEntry = async (
    id: string,
    patch: Partial<{ targetPrice: number | null; alertEnabled: boolean }>
  ) => {
    await window.api.wishlistUpdate({ id, patch });
    await load();
  };

  const body = (
    <>
      <header className="wishlist-page__header">
        {embedded && onMenu && (
          <button
            type="button"
            className="header__menu-btn"
            title="Menu (Start)"
            aria-label="Abrir menu"
            onClick={onMenu}
          >
            ☰
          </button>
        )}
        <div className="wishlist-page__heading">
          <h2>Wishlist</h2>
          <span className="badge">{entries.length} jogo(s)</span>
        </div>
        {!embedded && (
          <button type="button" className="modal__close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        )}
        <div className="wishlist__actions">
          <button type="button" className="primary" disabled={syncing} onClick={() => void syncPrices()}>
            {syncing ? 'Buscando…' : 'Sync preços'}
          </button>
          <button type="button" disabled={importing} onClick={() => void importSteam()}>
            {importing ? 'Importando…' : 'Importar Steam'}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding((v) => !v);
              setMessage(null);
            }}
          >
            {adding ? 'Cancelar' : '+ Adicionar'}
          </button>
          <label className="wishlist__sort">
            <span>Ordenar</span>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as WishlistSortMode)}
              aria-label="Ordenar wishlist"
            >
              <option value="price">Preço</option>
              <option value="discount">Desconto</option>
            </select>
          </label>
        </div>
      </header>

      {adding && (
        <div className="wishlist__add">
          <input
            autoFocus
            type="search"
            className="search"
            placeholder="Buscar jogo no ITAD… (ex.: Hollow Knight)"
            value={query}
            onChange={(e) => void search(e.target.value)}
          />
          {searching && <p className="hint">Buscando…</p>}
          {results && results.length > 0 && (
            <ul className="wishlist__results">
              {results.map((r) => (
                <li key={r.id}>
                  <button type="button" className="wishlist__result" onClick={() => void addEntry(r.title, r)}>
                    <strong>{r.title}</strong>
                    <span className="wishlist__result-meta">
                      {r.type} · {r.slug}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="wishlist__manual">
            <input
              type="text"
              placeholder="Ou adicione manualmente (título)"
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && manualTitle.trim()) void addEntry(manualTitle);
              }}
            />
            <button type="button" disabled={!manualTitle.trim()} onClick={() => void addEntry(manualTitle)}>
              Adicionar
            </button>
          </div>
        </div>
      )}

      {message && <p className="hint wishlist__message">{message}</p>}

      {loading ? (
        <p className="emulation__empty">Carregando…</p>
      ) : entries.length === 0 ? (
        <div className="emulation__empty wishlist-page__empty">
          <strong>Wishlist vazia</strong>
          <span>
            Clique em <em>Importar Steam</em> (wishlist pública) — isso também preenche as capas.
          </span>
        </div>
      ) : (
        <ul className="wl-grid">
          {sortedEntries.map((entry) => (
            <WishlistCard
              key={entry.id}
              entry={entry}
              onUpdate={updateEntry}
              onRemove={remove}
              onOpenOffer={openOffer}
            />
          ))}
        </ul>
      )}

      {!embedded && (
        <div className="modal__actions">
          <button type="button" onClick={onClose}>
            Fechar (Esc)
          </button>
        </div>
      )}
    </>
  );

  if (embedded) {
    return (
      <div className="wishlist-page" role="region" aria-label="Wishlist" data-pad-root="1">
        {body}
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal--wide modal--wishlist"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        data-pad-root="1"
      >
        {body}
      </div>
    </div>
  );
}
