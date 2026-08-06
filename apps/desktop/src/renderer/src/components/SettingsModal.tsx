import { useEffect, useState } from 'react';
import type { MoonlightSettings, ProfileId } from '../../../shared/api';

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

const PROFILES: Array<{ id: ProfileId; label: string; hint: string }> = [
  { id: 'desk', label: 'Perfil: Mesa (Mouse/Teclado)', hint: 'UI compacta, cursor visível, atalhos de teclado' },
  { id: 'tv', label: 'Perfil: TV (Controle)', hint: 'UI grande, modo console, cursor escondido, navegação gamepad' },
  { id: 'handheld', label: 'Perfil: Handheld', hint: 'UI adaptada para telas pequenas, touch/gamepad' },
];

const ROWS: SettingRow[] = [
  {
    key: 'ui.tvMode',
    label: 'Modo TV (console)',
    hint: 'Esconde o cursor e aumenta o texto para uso com controle',
  },
  {
    key: 'ui.fullscreen',
    label: 'Tela cheia',
    hint: 'Aplica na hora (também F11 ou menu ⋯). Lembra na próxima abertura',
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
  const [steamPath, setSteamPath] = useState('');
  const [locale, setLocale] = useState('pt-BR');
  const [activeProfile, setActiveProfile] = useState<ProfileId>('desk');
  const [moonlight, setMoonlight] = useState<MoonlightSettings>({
    path: '',
    host: '',
    app: '',
    extraArgs: '',
  });
  const [moonlightMsg, setMoonlightMsg] = useState<string | null>(null);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [systemMsg, setSystemMsg] = useState<string | null>(null);
  const [telemetryOn, setTelemetryOn] = useState(false);
  const [sentryDsn, setSentryDsn] = useState('');
  const [appVersion, setAppVersion] = useState('');
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
      const profile = await window.api.profileGet();
      setActiveProfile(profile);
      const ml = await window.api.moonlightSettings();
      setMoonlight(ml);
      const steam = await window.api.steamStatus().catch(() => null);
      setSteamPath(steam?.path ?? '');
      const loc = await window.api.settingsGet('ui.locale');
      setLocale(loc || 'pt-BR');
      const tel = await window.api.telemetryStatus();
      setTelemetryOn(tel.enabled);
      const dsn = await window.api.settingsGet('keys.sentryDsn');
      setSentryDsn(dsn ?? '');
      const ver = await window.api.appVersion();
      setAppVersion(ver);
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

  const changeProfile = async (profile: ProfileId) => {
    setActiveProfile(profile);
    await window.api.profileSet(profile);
    // Re-sincroniza toggles derivados do perfil (tvMode / fullscreen)
    const entries: Record<string, boolean> = { ...values };
    for (const row of ROWS) {
      const v = await window.api.settingsGet(row.key);
      entries[row.key] = v === '1';
    }
    setValues(entries);
    onChanged();
  };

  const saveMoonlight = async (patch: Partial<MoonlightSettings>) => {
    const next = await window.api.moonlightSetSettings(patch);
    setMoonlight(next);
    onChanged();
  };

  const pickMoonlight = async () => {
    const path = await window.api.moonlightPickExe();
    if (path) setMoonlight((prev) => ({ ...prev, path }));
  };

  const launchMoonlight = async () => {
    setMoonlightMsg(null);
    const res = await window.api.moonlightLaunch();
    setMoonlightMsg(res.ok ? 'Moonlight iniciado' : res.error ?? 'Falha ao iniciar Moonlight');
  };

  const exportLibrary = async () => {
    setBackupMsg(null);
    const res = await window.api.libraryExport();
    setBackupMsg(res.ok ? `Exportado: ${res.path}` : res.error ?? 'Export cancelado');
  };

  const importLibrary = async () => {
    setBackupMsg(null);
    const res = await window.api.libraryImport();
    if (res.error && res.error !== 'cancelado') {
      setBackupMsg(res.error);
      return;
    }
    setBackupMsg(`Importados ${res.imported}, ignorados ${res.skipped}`);
    onChanged();
  };

  const saveSteamPath = async () => {
    await window.api.steamSetPath(steamPath.trim());
    onChanged();
  };

  const saveLocale = async () => {
    await window.api.settingsSet('ui.locale', locale.trim() || 'pt-BR');
    onChanged();
  };

  const clearCache = async () => {
    setSystemMsg(null);
    const res = await window.api.cacheClear();
    setSystemMsg(res.ok ? 'Cache de API e capas limpos' : 'Falha ao limpar cache');
    onChanged();
  };

  const toggleTelemetry = async () => {
    const next = !telemetryOn;
    setTelemetryOn(next);
    await window.api.telemetrySet(next);
    onChanged();
  };

  const saveSentryDsn = async () => {
    await window.api.settingsSet('keys.sentryDsn', sentryDsn.trim());
    onChanged();
  };

  const checkUpdates = async () => {
    setSystemMsg(null);
    const res = await window.api.updaterCheck();
    setSystemMsg(res.message);
    if (res.ok && res.updateAvailable) {
      const dl = await window.api.updaterDownload();
      setSystemMsg(dl.message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal modal--settings"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        data-pad-root="1"
      >
        <div className="modal__header">
          <h2>Configurações</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <p className="settings__hint">Abra pelo menu lateral (Start) → Configurações.</p>
        {loading ? (
          <p className="emulation__empty">Carregando…</p>
        ) : (
          <div className="settings__list">
            <div className="settings__section">
              <h3>Perfil de Uso</h3>
              {PROFILES.map((p) => (
                <label
                  key={p.id}
                  className={`settings__row settings__row--profile ${activeProfile === p.id ? 'settings__row--active' : ''}`}
                >
                  <span className="settings__text">
                    <strong>{p.label}</strong>
                    <small>{p.hint}</small>
                  </span>
                  <input
                    type="radio"
                    name="profile"
                    checked={activeProfile === p.id}
                    onChange={() => void changeProfile(p.id)}
                  />
                </label>
              ))}
            </div>
            <div className="settings__section">
              <h3>Interface</h3>
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
            </div>
            <div className="settings__section">
              <h3>Moonlight / Streaming</h3>
              <div className="settings__row settings__row--key">
                <span className="settings__text">
                  <strong>Path do Moonlight.exe</strong>
                  <small>Client oficial — não reinstala protocolo, só inicia o stream</small>
                </span>
                <div className="field__row">
                  <input
                    type="text"
                    className="settings__key-input"
                    placeholder="C:\…\Moonlight.exe"
                    value={moonlight.path}
                    onChange={(e) => setMoonlight((p) => ({ ...p, path: e.target.value }))}
                    onBlur={() => void saveMoonlight({ path: moonlight.path })}
                  />
                  <button type="button" onClick={() => void pickMoonlight()}>
                    Procurar…
                  </button>
                </div>
              </div>
              <div className="settings__row settings__row--key">
                <span className="settings__text">
                  <strong>Host Sunshine</strong>
                  <small>Hostname ou IP do PC host</small>
                </span>
                <input
                  type="text"
                  className="settings__key-input"
                  placeholder="pc-sala.local"
                  value={moonlight.host}
                  onChange={(e) => setMoonlight((p) => ({ ...p, host: e.target.value }))}
                  onBlur={() => void saveMoonlight({ host: moonlight.host })}
                />
              </div>
              <div className="settings__row settings__row--key">
                <span className="settings__text">
                  <strong>App no host (opcional)</strong>
                  <small>Nome do app no Sunshine; vazio abre o seletor do Moonlight</small>
                </span>
                <input
                  type="text"
                  className="settings__key-input"
                  placeholder="Desktop"
                  value={moonlight.app}
                  onChange={(e) => setMoonlight((p) => ({ ...p, app: e.target.value }))}
                  onBlur={() => void saveMoonlight({ app: moonlight.app })}
                />
              </div>
              <div className="settings__row settings__row--key">
                <span className="settings__text">
                  <strong>Args extras</strong>
                  <small>Passados ao Moonlight após host/app</small>
                </span>
                <input
                  type="text"
                  className="settings__key-input"
                  placeholder="--resolution 1920x1080"
                  value={moonlight.extraArgs}
                  onChange={(e) => setMoonlight((p) => ({ ...p, extraArgs: e.target.value }))}
                  onBlur={() => void saveMoonlight({ extraArgs: moonlight.extraArgs })}
                />
              </div>
              <div className="settings__row">
                <span className="settings__text">
                  <strong>Iniciar stream</strong>
                  <small>{moonlightMsg ?? 'Lança Moonlight stream &lt;host&gt; [app]'}</small>
                </span>
                <button type="button" className="settings__accounts-btn" onClick={() => void launchMoonlight()}>
                  Stream
                </button>
              </div>
            </div>
            <div className="settings__section">
              <h3>Backup offline</h3>
              <div className="settings__row">
                <span className="settings__text">
                  <strong>Exportar / importar biblioteca</strong>
                  <small>{backupMsg ?? 'JSON local — funciona sem rede (P8-06/07)'}</small>
                </span>
                <div className="field__row">
                  <button type="button" className="settings__accounts-btn" onClick={() => void exportLibrary()}>
                    Exportar
                  </button>
                  <button type="button" className="settings__accounts-btn" onClick={() => void importLibrary()}>
                    Importar
                  </button>
                </div>
              </div>
            </div>
            <div className="settings__section">
              <h3>Paths e sistema</h3>
              <div className="settings__row settings__row--key">
                <span className="settings__text">
                  <strong>Path do Steam</strong>
                  <small>Override manual se a detecção automática falhar</small>
                </span>
                <input
                  type="text"
                  className="settings__key-input"
                  placeholder="C:\Program Files (x86)\Steam"
                  value={steamPath}
                  onChange={(e) => setSteamPath(e.target.value)}
                  onBlur={() => void saveSteamPath()}
                />
              </div>
              <div className="settings__row settings__row--key">
                <span className="settings__text">
                  <strong>Idioma (UI)</strong>
                  <small>pt-BR padrão — strings futuras usam esta chave</small>
                </span>
                <input
                  type="text"
                  className="settings__key-input"
                  placeholder="pt-BR"
                  value={locale}
                  onChange={(e) => setLocale(e.target.value)}
                  onBlur={() => void saveLocale()}
                />
              </div>
              <div className="settings__row">
                <span className="settings__text">
                  <strong>Limpar cache</strong>
                  <small>Remove api_cache + capas baixadas (P9-04)</small>
                </span>
                <button type="button" className="settings__accounts-btn" onClick={() => void clearCache()}>
                  Limpar
                </button>
              </div>
              <div className="settings__row">
                <span className="settings__text">
                  <strong>Atualizações</strong>
                  <small>
                    {systemMsg ?? `Versão atual ${appVersion || '…'} — electron-updater (GitHub Releases)`}
                  </small>
                </span>
                <button type="button" className="settings__accounts-btn" onClick={() => void checkUpdates()}>
                  Verificar
                </button>
              </div>
              <label className="settings__row">
                <span className="settings__text">
                  <strong>Telemetria / Sentry (opt-in)</strong>
                  <small>Desligado por padrão. Só envia crashes se DSN estiver configurado.</small>
                </span>
                <input type="checkbox" checked={telemetryOn} onChange={() => void toggleTelemetry()} />
              </label>
              <div className="settings__row settings__row--key">
                <span className="settings__text">
                  <strong>Sentry DSN</strong>
                  <small>Opcional — usado só com telemetria ligada</small>
                </span>
                <input
                  type="password"
                  className="settings__key-input"
                  placeholder="https://…@….ingest.sentry.io/…"
                  value={sentryDsn}
                  onChange={(e) => setSentryDsn(e.target.value)}
                  onBlur={() => void saveSentryDsn()}
                />
              </div>
            </div>
            <div className="settings__section">
              <h3>Chaves de API</h3>
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
            </div>
            <div className="settings__section">
              <h3>Contas</h3>
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
          </div>
        )}
      </div>
    </div>
  );
}
