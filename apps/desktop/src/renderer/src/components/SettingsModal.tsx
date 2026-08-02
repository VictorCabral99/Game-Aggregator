import { useEffect, useState } from 'react';

interface SettingsModalProps {
  onClose: () => void;
  onChanged: () => void;
  onOpenAccounts: () => void;
}

interface SettingRow {
  key: string;
  label: string;
  hint: string;
}

const ROWS: SettingRow[] = [
  {
    key: 'ui.tvMode',
    label: 'Modo TV (console)',
    hint: 'Esconde o cursor e aumenta o texto para uso com controle',
  },
  {
    key: 'ui.fullscreen',
    label: 'Iniciar em tela cheia',
    hint: 'Abre o launcher em fullscreen no boot (requer reiniciar o app)',
  },
  {
    key: 'ui.sounds',
    label: 'Sons de UI',
    hint: 'Sons curtos ao mover, selecionar e voltar (controle/teclado)',
  },
  {
    key: 'ui.hideRatings',
    label: 'Esconder notas',
    hint: 'Não exibe scores na grade nem na ficha do jogo',
  },
  {
    key: 'wishlist.notifications',
    label: 'Notificações da wishlist',
    hint: 'Aviso do Windows quando um jogo da wishlist bater o preço alvo',
  },
];

export default function SettingsModal({ onClose, onChanged, onOpenAccounts }: SettingsModalProps): JSX.Element {
  const [values, setValues] = useState<Record<string, boolean>>({});
  const [rawgKey, setRawgKey] = useState('');
  const [itadKey, setItadKey] = useState('');
  const [itadCountry, setItadCountry] = useState('');
  const [steamId, setSteamId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const entries: Record<string, boolean> = {};
      for (const row of ROWS) {
        const v = await window.api.settingsGet(row.key);
        entries[row.key] = v === '1';
      }
      setValues(entries);
      const keys = await window.api.ratingsSettings();
      setRawgKey(keys.rawgKey);
      const wish = await window.api.wishlistSettings();
      setItadKey(wish.itadKey);
      setItadCountry(wish.country);
      setSteamId(wish.steamId);
      setLoading(false);
    };
    void load();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggle = async (key: string) => {
    const next = !values[key];
    setValues((prev) => ({ ...prev, [key]: next }));
    await window.api.settingsSet(key, next ? '1' : '0');
    onChanged();
  };

  const saveRawgKey = async () => {
    await window.api.settingsSet('keys.rawg', rawgKey.trim());
    onChanged();
  };

  const saveItad = async () => {
    await window.api.settingsSet('keys.itad', itadKey.trim());
    await window.api.settingsSet('itad.country', itadCountry.trim() || 'BR');
    onChanged();
  };

  const saveSteamId = async () => {
    await window.api.settingsSet('steam.id', steamId.trim());
    onChanged();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal modal--settings"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal__header">
          <h2>Configurações</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <p className="settings__hint">Botão Start do controle abre esta tela.</p>
        {loading ? (
          <p className="emulation__empty">Carregando…</p>
        ) : (
          <div className="settings__list">
            {ROWS.map((row) => (
              <label key={row.key} className="settings__row">
                <span className="settings__text">
                  <strong>{row.label}</strong>
                  <small>{row.hint}</small>
                </span>
                <input
                  type="checkbox"
                  checked={values[row.key] ?? false}
                  onChange={() => void toggle(row.key)}
                />
              </label>
            ))}
            <div className="settings__row settings__row--key">
              <span className="settings__text">
                <strong>Chave RAWG</strong>
                <small>Para notas da comunidade + Metacritic (rawg.io/apidocs)</small>
              </span>
              <input
                type="password"
                className="settings__key-input"
                placeholder="RAWG_API_KEY"
                value={rawgKey}
                onChange={(e) => setRawgKey(e.target.value)}
                onBlur={() => void saveRawgKey()}
              />
            </div>
            <div className="settings__row settings__row--key">
              <span className="settings__text">
                <strong>Chave IsThereAnyDeal</strong>
                <small>Preços e descontos da wishlist (isthereanydeal.com/apps)</small>
              </span>
              <input
                type="password"
                className="settings__key-input"
                placeholder="ITAD_API_KEY"
                value={itadKey}
                onChange={(e) => setItadKey(e.target.value)}
                onBlur={() => void saveItad()}
              />
            </div>
            <div className="settings__row settings__row--key">
              <span className="settings__text">
                <strong>País / moeda ITAD</strong>
                <small>Preços exibidos nesse país (ex.: BR, US, AR)</small>
              </span>
              <input
                type="text"
                className="settings__key-input"
                placeholder="BR"
                value={itadCountry}
                onChange={(e) => setItadCountry(e.target.value)}
                onBlur={() => void saveItad()}
              />
            </div>
            <div className="settings__row settings__row--key">
              <span className="settings__text">
                <strong>Steam ID (steam64)</strong>
                <small>Para importar a wishlist Steam (perfil com wishlist pública)</small>
              </span>
              <input
                type="text"
                className="settings__key-input"
                placeholder="7656119…"
                value={steamId}
                onChange={(e) => setSteamId(e.target.value)}
                onBlur={() => void saveSteamId()}
              />
            </div>
            <div className="settings__row">
              <span className="settings__text">
                <strong>Contas de lojas conectadas</strong>
                <small>Steam, Epic, GOG, Amazon — sincroniza biblioteca e wishlist</small>
              </span>
              <button
                type="button"
                className="settings__accounts-btn"
                onClick={() => onOpenAccounts?.()}
              >
                Gerenciar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
