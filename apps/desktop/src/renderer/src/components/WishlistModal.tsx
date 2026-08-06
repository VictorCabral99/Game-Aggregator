import { useEffect, useMemo, useState } from 'react';
import type { ITADSearchResult, WishlistAlert, WishlistEntry } from '../../../shared/api';
import {
  isHistoricalLowDeal,
  sortWishlistEntries,
  type WishlistSortMode,
} from '../lib/wishlist-sort';

interface Props {
  onClose: () => void;
  onAlerts?: (alerts: WishlistAlert[]) => void;
  /** Painel do menu lateral (sem backdrop). */
  embedded?: boolean;
}

function priceLabel(entry: WishlistEntry): string {
  const p = entry.price;
  if (!p?.currentPrice) return 'Sem preço';
  const cur = p.currency ?? entry.currency ?? '';
  return `${p.currentPrice.toFixed(2)} ${cur}`;
}

function dateLabel(iso: string | null): string {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'nunca';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

interface RowProps {
  entry: WishlistEntry;
  onUpdate: (
    id: string,
    patch: Partial<{ targetPrice: number | null; alertEnabled: boolean; preferredStores: string[] }>
  ) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onOpenOffer: (entry: WishlistEntry) => void;
}

function WishlistRow({ entry, onUpdate, onRemove, onOpenOffer }: RowProps): JSX.Element {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [target, setTarget] = useState<string>(entry.targetPrice?.toString() ?? '');
  const [stores, setStores] = useState<string>(entry.preferredStores.join(', '));

  const saveTarget = () => {
    const v = target.trim() === '' ? null : Number(target);
    if (Number.isNaN(v as number)) return;
    void onUpdate(entry.id, { targetPrice: v });
  };

  const saveStores = () => {
    const parsed = stores
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (JSON.stringify(parsed) !== JSON.stringify(entry.preferredStores)) {
      void onUpdate(entry.id, { preferredStores: parsed });
    }
  };

  const p = entry.price;
  const hasDeal = Boolean(p && p.currentPrice !== null);
  const onSale = Boolean(p?.cutPercent && p.cutPercent > 0);
  const histLow = isHistoricalLowDeal(entry);

  return (
    <li className={`wishlist__row ${histLow ? 'wishlist__row--hist-low' : ''}`}>
      <div className="wishlist__row-main">
        <strong className="wishlist__title">{entry.title}</strong>
        {histLow && <span className="wishlist__hist-badge">Mínimo histórico</span>}
        {p?.shopName && <span className="wishlist__shop">{p.shopName}</span>}
      </div>
      <div className="wishlist__price">
        {onSale && <span className="wishlist__cut-badge">-{p!.cutPercent}%</span>}
        <span className={`wishlist__current ${onSale ? 'wishlist__current--sale' : ''}`}>
          {priceLabel(entry)}
        </span>
        {p?.regularPrice && p.regularPrice > 0 && (
          <span className="wishlist__regular">
            {p.regularPrice.toFixed(2)} {p.currency ?? ''}
          </span>
        )}
      </div>
      <div className="wishlist__low">
        <small>Mínimo histórico</small>
        <span>
          {p?.historicalLow != null
            ? `${p.historicalLow.toFixed(2)} ${p.currency ?? ''}${p.historicalLowShop ? ` (${p.historicalLowShop})` : ''}`
            : 'Sem dados'}
        </span>
      </div>
      <div className="wishlist__controls">
        <input
          type="number"
          step="0.01"
          min="0"
          className="wishlist__target"
          placeholder="Preço alvo"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          onBlur={saveTarget}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        <label className="wishlist__alert">
          <input
            type="checkbox"
            checked={entry.alertEnabled}
            onChange={(e) => void onUpdate(entry.id, { alertEnabled: e.target.checked })}
          />
          Alerta
        </label>
        <input
          type="text"
          className="wishlist__stores"
          placeholder="Lojas pref. (ex.: Steam, Nuuvem)"
          title="Lojas preferidas separadas por vírgula"
          value={stores}
          onChange={(e) => setStores(e.target.value)}
          onBlur={saveStores}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        {p?.url && (
          <button type="button" className="wishlist__offer" onClick={() => onOpenOffer(entry)}>
            Abrir oferta
          </button>
        )}
        {confirmRemove ? (
          <>
            <button type="button" className="danger" onClick={() => void onRemove(entry.id)}>
              Confirmar
            </button>
            <button type="button" onClick={() => setConfirmRemove(false)}>Cancelar</button>
          </>
        ) : (
          <button type="button" className="danger-ghost" onClick={() => setConfirmRemove(true)}>
            Remover
          </button>
        )}
      </div>
      {p?.fetchedAt && hasDeal && (
        <span className="wishlist__stale">atualizado {dateLabel(p.fetchedAt)}</span>
      )}
    </li>
  );
}

export default function WishlistModal({ onClose, onAlerts, embedded = false }: Props): JSX.Element {
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
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
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
      else setMessage(`Wishlist Steam importada: ${res.imported} novos, ${res.skipped} já existentes`);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  };

  const remove = async (id: string) => {
    await window.api.wishlistRemove(id);
    setConfirmRemoveId(null);
    await load();
  };

  const openOffer = (entry: WishlistEntry) => {
    if (entry.price?.url) void window.api.openExternal(entry.price.url);
  };

  const updateEntry = async (
    id: string,
    patch: Partial<{ targetPrice: number | null; alertEnabled: boolean; preferredStores: string[] }>
  ) => {
    await window.api.wishlistUpdate({ id, patch });
    await load();
  };

  const body = (
      <>
        <div className="modal__header">
          <h2>Wishlist & promoções</h2>
          <span className="badge">{entries.length} jogo(s)</span>
          {!embedded && (
            <button type="button" className="modal__close" onClick={onClose} aria-label="Fechar">
              ×
            </button>
          )}
        </div>

        <div className="wishlist__actions">
          <button type="button" className="primary" disabled={syncing} onClick={() => void syncPrices()}>
            {syncing ? 'Buscando preços…' : 'Sync preços'}
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
              <option value="price">Preço (menor)</option>
              <option value="discount">Desconto (maior)</option>
            </select>
          </label>
        </div>

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
          <div className="emulation__empty">
            <strong>Wishlist vazia</strong>
            <span>
              Clique em <em>Importar Steam</em> (wishlist pública no perfil) ou adicione jogos
              manualmente para acompanhar preços.
            </span>
          </div>
        ) : (
          <ul className="wishlist__list">
            {sortedEntries.map((entry) => (
              <WishlistRow
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
            <button type="button" onClick={onClose}>Fechar (Esc)</button>
          </div>
        )}
      </>
  );

  if (embedded) {
    return (
      <div className="wishlist-page" role="region" aria-label="Wishlist">
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
