import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type {
  LocalGamesSetupStatus,
  PlatformAccount,
  RetroSetupStatus,
} from '../../../shared/api';

type StoreId = 'steam' | 'epic' | 'gog' | 'amazon';
type Step = 'stores' | 'retro' | 'local';

interface Props {
  userName?: string | null;
  onContinue: () => void;
}

const STORES: Array<{
  id: StoreId;
  label: string;
  hint: string;
  accent: string;
}> = [
  { id: 'steam', label: 'Steam', hint: 'Biblioteca e wishlist', accent: '#66c0f4' },
  { id: 'epic', label: 'Epic Games', hint: 'Via Legendary', accent: '#0078f2' },
  { id: 'gog', label: 'GOG', hint: 'Via gogdl / Galaxy', accent: '#c272ff' },
  { id: 'amazon', label: 'Amazon Games', hint: 'Via Nile', accent: '#ff9900' },
];

function shortPath(p: string): string {
  if (!p) return '';
  if (p.length <= 48) return p;
  return `…${p.slice(-46)}`;
}

/** Tela pós-login: lojas + Retro + jogos externos. */
export default function StoreConnectScreen({ userName, onContinue }: Props): JSX.Element {
  const [step, setStep] = useState<Step>('stores');
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [connecting, setConnecting] = useState<StoreId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retro, setRetro] = useState<RetroSetupStatus>({
    romsRoot: '',
    emulatorsRoot: '',
    romsConfigured: false,
    emulatorsDetected: 0,
  });
  const [localGames, setLocalGames] = useState<LocalGamesSetupStatus>({
    gamesRoot: '',
    configured: false,
    gamesFound: 0,
  });
  const [scanning, setScanning] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [list, setup, local] = await Promise.all([
        window.api.authListPlatformAccounts(),
        window.api.emulationSetupGet(),
        window.api.libraryLocalSetupGet(),
      ]);
      setAccounts(list);
      setRetro(setup);
      setLocalGames(local);
    } catch {
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connect = async (id: StoreId) => {
    setConnecting(id);
    setError(null);
    try {
      await window.api.authConnectPlatform(id);
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/cancelad/i.test(msg)) setError(msg);
    } finally {
      setConnecting(null);
    }
  };

  const disconnect = async (id: StoreId) => {
    setError(null);
    try {
      await window.api.authUnlinkPlatform(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const pickRoms = async () => {
    setError(null);
    const res = await window.api.emulationPickRomsRoot();
    if (res) setRetro(res);
  };

  const pickEmulators = async () => {
    setError(null);
    const res = await window.api.emulationPickEmulatorsRoot();
    if (res) setRetro(res);
  };

  const pickGamesRoot = async () => {
    setError(null);
    const res = await window.api.libraryPickGamesRoot();
    if (res) setLocalGames(res);
  };

  const scanRoms = async () => {
    if (!retro.romsConfigured) return;
    setScanning(true);
    setError(null);
    try {
      const res = await window.api.emulationScanAll();
      setError(
        res.added > 0
          ? `ROMs: ${res.added} novos (${res.found} encontrados)`
          : `ROMs: ${res.found} encontrados, nenhum novo`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  };

  const scanLocal = async () => {
    if (!localGames.configured) return;
    setScanning(true);
    setError(null);
    try {
      const res = await window.api.libraryScanLocalGames();
      setLocalGames((prev) => ({ ...prev, gamesFound: res.found }));
      setError(
        res.added > 0
          ? `Externos: ${res.added} novos (${res.found} encontrados)`
          : `Externos: ${res.found} encontrados, nenhum novo`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  };

  const linkedCount = accounts.length;
  const retroReady = retro.romsConfigured || retro.emulatorsDetected > 0;
  const localReady = localGames.configured;
  const anySource = linkedCount > 0 || retroReady || localReady;

  if (step === 'retro') {
    return (
      <div className="store-connect" role="dialog" aria-modal="true" aria-labelledby="retro-setup-title">
        <div className="store-connect__inner">
          <button type="button" className="store-connect__back" onClick={() => setStep('stores')}>
            ← Voltar às fontes
          </button>
          <p className="store-connect__eyebrow">Retro / Emulação</p>
          <h1 id="retro-setup-title">Pastas de ROMs e emuladores</h1>
          <p className="store-connect__lead">
            Escolha a pasta onde ficam seus ROMs e a pasta onde estão os emuladores (RetroArch, PCSX2…).
            O launcher detecta os binários e associa as pastas aos consoles.
          </p>

          <div className="retro-setup">
            <div className="retro-setup__row">
              <div className="retro-setup__text">
                <strong>Pasta de ROMs</strong>
                <small>
                  {retro.romsRoot
                    ? shortPath(retro.romsRoot)
                    : 'Ex.: D:\\Games\\ROMs — subpastas snes/, gba/… são usadas se existirem'}
                </small>
              </div>
              <button type="button" className="primary" onClick={() => void pickRoms()}>
                {retro.romsConfigured ? 'Trocar pasta' : 'Selecionar pasta'}
              </button>
            </div>

            <div className="retro-setup__row">
              <div className="retro-setup__text">
                <strong>Pasta de emuladores</strong>
                <small>
                  {retro.emulatorsRoot
                    ? `${shortPath(retro.emulatorsRoot)} · ${retro.emulatorsDetected} detectado(s)`
                    : 'Ex.: C:\\Emulators — procura RetroArch, PCSX2, DuckStation, mGBA…'}
                </small>
              </div>
              <button type="button" className="primary" onClick={() => void pickEmulators()}>
                {retro.emulatorsRoot ? 'Trocar pasta' : 'Selecionar pasta'}
              </button>
            </div>
          </div>

          {error && (
            <p className={/ROMs:/.test(error) ? 'store-connect__status' : 'store-connect__error'}>
              {error}
            </p>
          )}

          <div className="store-connect__footer">
            <button
              type="button"
              disabled={!retro.romsConfigured || scanning}
              onClick={() => void scanRoms()}
            >
              {scanning ? 'Escaneando ROMs…' : 'Escanear ROMs agora'}
            </button>
            <button type="button" className="primary store-connect__continue" onClick={() => setStep('stores')}>
              Pronto — voltar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'local') {
    return (
      <div className="store-connect" role="dialog" aria-modal="true" aria-labelledby="local-setup-title">
        <div className="store-connect__inner">
          <button type="button" className="store-connect__back" onClick={() => setStep('stores')}>
            ← Voltar às fontes
          </button>
          <p className="store-connect__eyebrow">Fora das lojas</p>
          <h1 id="local-setup-title">Pasta de jogos externos</h1>
          <p className="store-connect__lead">
            Escolha a pasta onde ficam jogos fora das lojas (Minecraft, Hytale, portáteis…). Cada
            subpasta é tratada como um jogo; o launcher procura o .exe principal dentro dela.
          </p>

          <div className="retro-setup">
            <div className="retro-setup__row">
              <div className="retro-setup__text">
                <strong>Pasta Games</strong>
                <small>
                  {localGames.gamesRoot
                    ? `${shortPath(localGames.gamesRoot)}${
                        localGames.gamesFound > 0 ? ` · ${localGames.gamesFound} jogo(s)` : ''
                      }`
                    : 'Ex.: D:\\Games — Minecraft\\, Hytale\\, …'}
                </small>
              </div>
              <button type="button" className="primary" onClick={() => void pickGamesRoot()}>
                {localGames.configured ? 'Trocar pasta' : 'Selecionar pasta'}
              </button>
            </div>
          </div>

          {error && (
            <p className={/Externos:/.test(error) ? 'store-connect__status' : 'store-connect__error'}>
              {error}
            </p>
          )}

          <div className="store-connect__footer">
            <button
              type="button"
              disabled={!localGames.configured || scanning}
              onClick={() => void scanLocal()}
            >
              {scanning ? 'Escaneando…' : 'Escanear jogos agora'}
            </button>
            <button type="button" className="primary store-connect__continue" onClick={() => setStep('stores')}>
              Pronto — voltar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="store-connect" role="dialog" aria-modal="true" aria-labelledby="store-connect-title">
      <div className="store-connect__inner">
        <p className="store-connect__eyebrow">Depois do Google</p>
        <h1 id="store-connect-title">Conecte suas fontes</h1>
        <p className="store-connect__lead">
          {userName ? `Olá, ${userName.split(' ')[0]}. ` : ''}
          Autentique as lojas e, se quiser, configure ROMs ou jogos externos. Você pode pular e fazer
          depois.
        </p>

        {loading ? (
          <p className="store-connect__status">Carregando…</p>
        ) : (
          <div className="store-connect__grid">
            {STORES.map((store) => {
              const account = accounts.find((a) => a.platform === store.id);
              const isOn = Boolean(account);
              const busy = connecting === store.id;
              const style = { '--store-accent': store.accent } as CSSProperties;
              return (
                <button
                  key={store.id}
                  type="button"
                  className={`store-tile ${isOn ? 'store-tile--on' : ''}`}
                  style={style}
                  disabled={busy}
                  onClick={() => void (isOn ? disconnect(store.id) : connect(store.id))}
                >
                  <span className="store-tile__mark" aria-hidden />
                  <span className="store-tile__label">{store.label}</span>
                  <span className="store-tile__hint">
                    {busy
                      ? 'Abrindo login…'
                      : isOn
                        ? account?.displayName || 'Conectado'
                        : store.hint}
                  </span>
                  <span className={`store-tile__cta ${isOn ? 'store-tile__cta--off' : ''}`}>
                    {busy ? '…' : isOn ? 'Desconectar' : 'Conectar'}
                  </span>
                </button>
              );
            })}

            <button
              type="button"
              className={`store-tile ${localReady ? 'store-tile--on' : ''}`}
              style={{ '--store-accent': '#fbbf24' } as CSSProperties}
              onClick={() => {
                setError(null);
                setStep('local');
              }}
            >
              <span className="store-tile__mark" aria-hidden />
              <span className="store-tile__label">Jogos externos</span>
              <span className="store-tile__hint">
                {localReady
                  ? localGames.gamesFound > 0
                    ? `${localGames.gamesFound} jogo(s)`
                    : 'Pasta ok'
                  : 'Minecraft, Hytale…'}
              </span>
              <span className="store-tile__cta">Configurar</span>
            </button>

            <button
              type="button"
              className={`store-tile ${retroReady ? 'store-tile--on' : ''}`}
              style={{ '--store-accent': '#34d399' } as CSSProperties}
              onClick={() => {
                setError(null);
                setStep('retro');
              }}
            >
              <span className="store-tile__mark" aria-hidden />
              <span className="store-tile__label">Retro / Emulação</span>
              <span className="store-tile__hint">
                {retroReady
                  ? [
                      retro.romsConfigured ? 'ROMs ok' : null,
                      retro.emulatorsDetected > 0 ? `${retro.emulatorsDetected} emu` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Configurado'
                  : 'ROMs e emuladores'}
              </span>
              <span className="store-tile__cta">Configurar</span>
            </button>
          </div>
        )}

        {error && !/ROMs:|Externos:/.test(error) && <p className="store-connect__error">{error}</p>}

        <div className="store-connect__footer">
          <p className="store-connect__count">
            {!anySource
              ? 'Nenhuma fonte conectada'
              : [
                  linkedCount > 0 ? `${linkedCount} loja(s)` : null,
                  localReady ? 'externos ok' : null,
                  retroReady ? 'retro ok' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
          </p>
          <button type="button" className="primary store-connect__continue" onClick={onContinue}>
            {anySource ? 'Continuar para a biblioteca' : 'Pular por agora'}
          </button>
        </div>
      </div>
    </div>
  );
}
