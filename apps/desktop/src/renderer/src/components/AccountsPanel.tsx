import { useEffect, useState } from 'react';

interface Props {
  onClose: () => void;
}

const PLATFORMS: Array<{ id: 'steam' | 'gog' | 'epic' | 'amazon'; label: string; color: string }> = [
  { id: 'steam', label: 'Steam', color: '#1b2838' },
  { id: 'gog', label: 'GOG', color: '#00b1ff' },
  { id: 'epic', label: 'Epic Games', color: '#347dff' },
  { id: 'amazon', label: 'Amazon Games', color: '#ff9900' },
];

export default function AccountsPanel({ onClose }: Props): JSX.Element {
  const [accounts, setAccounts] = useState<Array<{
    platform: string;
    displayName: string;
    linkedAt: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    try {
      const list = await window.api.authListPlatformAccounts();
      setAccounts(list.map((a) => ({
        platform: a.platform,
        displayName: a.displayName || 'Conectado',
        linkedAt: a.linkedAt,
      })));
    } catch (err) {
      console.error('Erro ao carregar contas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const connect = async (platform: 'steam' | 'gog' | 'epic' | 'amazon') => {
    setConnecting(platform);
    setMessage(null);
    try {
      await window.api.authConnectPlatform(platform);
      await load();
      try {
        const res =
          platform === 'steam'
            ? await window.api.steamScan()
            : await window.api.storeScan(platform);
        setMessage(
          `${platform.toUpperCase()} conectado · ${res.total} jogo(s) (${res.inserted} novos)`
        );
      } catch (syncErr) {
        setMessage(
          `${platform.toUpperCase()} conectado, mas import falhou: ${
            syncErr instanceof Error ? syncErr.message : String(syncErr)
          }`
        );
      }
    } catch (err) {
      await load();
      const msg = err instanceof Error ? err.message : `Erro ao conectar ${platform}`;
      if (!/cancelad/i.test(msg)) setMessage(msg);
    } finally {
      setConnecting(null);
    }
  };

  const disconnect = async (platform: string) => {
    try {
      await window.api.authUnlinkPlatform(platform);
      await load();
      setMessage(`${platform} desconectado`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : `Erro ao desconectar ${platform}`);
    }
  };

  const connectedPlatforms = new Set(accounts.map((a) => a.platform));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal--settings"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        data-pad-root="1"
      >
        <div className="modal__header">
          <h2>Contas Conectadas</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <p className="settings__hint">
          Conecte as lojas para sincronizar biblioteca, wishlist e conquistas automaticamente.
        </p>

        {loading ? (
          <p className="emulation__empty">Carregando…</p>
        ) : (
          <div className="settings__list">
            {PLATFORMS.map(({ id, label, color }) => {
              const account = accounts.find((a) => a.platform === id);
              const isConnected = !!account;
              return (
                <div key={id} className="settings__row settings__row--account">
                  <div className="settings__account-info" style={{ borderLeftColor: color }}>
                    <strong>{label}</strong>
                    {isConnected && (
                      <small>
                        {account.displayName} · conectado em {new Date(account.linkedAt).toLocaleDateString('pt-BR')}
                      </small>
                    )}
                    {!isConnected && <small>Não conectado — sincronização indisponível</small>}
                  </div>
                  {isConnected ? (
                    <button
                      type="button"
                      className="danger-ghost"
                      onClick={() => void disconnect(id)}
                    >
                      Desconectar
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={connecting === id}
                      onClick={() => void connect(id)}
                    >
                      {connecting === id ? 'Conectando…' : 'Conectar'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {message && <p className="hint settings__message">{message}</p>}

        <div className="modal__actions">
          <button type="button" onClick={onClose}>Fechar (Esc)</button>
        </div>
      </div>
    </div>
  );
}