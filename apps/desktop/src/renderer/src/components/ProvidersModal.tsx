import { useEffect, useState } from 'react';
import type { ProviderStatus, StoreId, SyncAllResult } from '../../../shared/api';

interface Props {
  onClose: () => void;
}

function dateLabel(iso: string | null): string {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'nunca';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ProvidersModal({ onClose }: Props): JSX.Element {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncAllResult | null>(null);

  const load = () => {
    void window.api
      .providersList()
      .then(setProviders)
      .catch(() => setProviders([]));
  };

  useEffect(() => {
    load();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  const syncAll = async () => {
    setSyncing(true);
    try {
      const res = await window.api.providersSyncAll();
      setSyncResult(res);
      load();
    } catch (err) {
      setSyncResult({
        totalScanned: 0,
        totalInserted: 0,
        results: [{ id: 'local', ok: false, total: 0, inserted: 0, error: err instanceof Error ? err.message : String(err) }],
      });
    } finally {
      setSyncing(false);
    }
  };

  const syncOne = async (p: ProviderStatus) => {
    try {
      if (p.id === 'steam') {
        await window.api.steamScan();
      } else {
        await window.api.storeScan(p.id as StoreId);
      }
      load();
    } catch (err) {
      load();
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--providers" onClick={(e) => e.stopPropagation()}>
        <h2>Providers</h2>
        <p className="hint">
          Steam usa scan local + protocolo próprio. Epic/GOG/Amazon usam sidecars em
          <span className="mono"> resources/bin</span>.
        </p>

        <div className="providers__actions">
          <button type="button" className="primary" disabled={syncing} onClick={() => void syncAll()}>
            {syncing ? 'Sincronizando…' : 'Sync tudo'}
          </button>
          {syncResult && !syncing && (
            <span className="badge">
              {syncResult.totalInserted} novos de {syncResult.totalScanned} jogos
            </span>
          )}
        </div>

        <div className="providers__grid">
          {providers.map((p) => {
            const failed = p.error !== null && p.error !== '';
            return (
              <article key={p.id} className={`provider-card ${p.available ? 'provider-card--ok' : 'provider-card--muted'}`}>
                <header className="provider-card__header">
                  <strong>{p.displayName}</strong>
                  <span className={`badge ${p.available ? '' : 'badge--muted'}`}>
                    {p.available ? 'disponível' : 'indisponível'}
                  </span>
                </header>
                <dl className="provider-card__meta">
                  {p.version && (
                    <div>
                      <dt>Versão</dt>
                      <dd className="mono">{p.version}</dd>
                    </div>
                  )}
                  {p.path && (
                    <div>
                      <dt>Path</dt>
                      <dd className="mono">{p.path}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Jogos na biblioteca</dt>
                    <dd>{p.gamesCount}</dd>
                  </div>
                  <div>
                    <dt>Último scan</dt>
                    <dd>{dateLabel(p.lastScanAt)}</dd>
                  </div>
                  {failed && (
                    <div className="provider-card__error">
                      <dt>Erro</dt>
                      <dd>{p.error}</dd>
                    </div>
                  )}
                </dl>
                <div className="provider-card__actions">
                  <button type="button" disabled={!p.available || syncing} onClick={() => void syncOne(p)}>
                    Sync
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <div className="modal__actions">
          <button type="button" onClick={onClose}>Fechar (Esc)</button>
        </div>
      </div>
    </div>
  );
}
