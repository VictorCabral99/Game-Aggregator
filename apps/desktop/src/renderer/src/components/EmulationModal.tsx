import { useCallback, useEffect, useState } from 'react';
import type { ConsoleView, Game, LaunchResult } from '../../../shared/api';

interface EmulationModalProps {
  onClose: () => void;
  onLaunch: (game: Game) => Promise<LaunchResult>;
  onChanged: () => void;
  /** Painel do menu lateral (sem overlay). */
  embedded?: boolean;
}

export default function EmulationModal({
  onClose,
  onLaunch,
  onChanged,
  embedded = false,
}: EmulationModalProps): JSX.Element {
  const [consoles, setConsoles] = useState<ConsoleView[]>([]);
  const [activeConsole, setActiveConsole] = useState<ConsoleView | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<{ scanned: number; total: number } | null>(null);

  const refreshConsoles = useCallback(async () => {
    const list = await window.api.emulationListConsoles();
    setConsoles(list);
    setActiveConsole((prev) => (prev ? list.find((c) => c.id === prev.id) ?? null : null));
  }, []);

  const reloadGames = useCallback(
    async (consoleId: string) => {
      const list = await window.api.emulationGames(consoleId);
      setGames(list);
    },
    []
  );

  const doScan = useCallback(
    async (consoleId: string) => {
      setScanning(true);
      setProgress({ scanned: 0, total: 0 });
      try {
        const res = await window.api.emulationScan(consoleId);
        onChanged();
        await refreshConsoles();
        await reloadGames(consoleId);
        return res;
      } finally {
        setScanning(false);
        setProgress(null);
      }
    },
    [onChanged, refreshConsoles, reloadGames]
  );

  useEffect(() => {
    void refreshConsoles();
  }, [refreshConsoles]);

  // Drop-in: ao abrir um console com pasta padrão, escaneia automaticamente.
  useEffect(() => {
    if (!activeConsole) {
      setGames([]);
      return;
    }
    void reloadGames(activeConsole.id);
    if (activeConsole.defaultFolder) {
      void doScan(activeConsole.id);
    }
  }, [activeConsole, doScan, reloadGames]);

  useEffect(() => {
    const off = window.api.onEmulationScanProgress((data) => setProgress(data));
    return off;
  }, []);

  const changeEmulator = async (emulatorId: string) => {
    if (!activeConsole) return;
    await window.api.emulationSetEmulator({ consoleId: activeConsole.id, emulatorId });
    await refreshConsoles();
  };

  const pickFolder = async () => {
    if (!activeConsole) return;
    const res = await window.api.emulationPickFolder(activeConsole.id);
    if (res) {
      onChanged();
      await refreshConsoles();
      await reloadGames(activeConsole.id);
    }
  };

  const mapRom = async () => {
    if (!activeConsole) return;
    const res = await window.api.emulationMapRom(activeConsole.id);
    if (res) {
      onChanged();
      await reloadGames(activeConsole.id);
    }
  };

  const removeRom = async (sourceId: string) => {
    await window.api.emulationRemoveRom(sourceId);
    onChanged();
    if (activeConsole) await reloadGames(activeConsole.id);
  };

  const openConsole = (consoleId: string) => {
    const c = consoles.find((x) => x.id === consoleId) ?? null;
    setActiveConsole(c);
  };

  const wrapClass = embedded ? 'retro-page' : 'modal-overlay';
  const panelClass = embedded ? 'retro-page__panel' : 'modal modal--wide';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (activeConsole) {
        setActiveConsole(null);
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeConsole, onClose]);

  if (activeConsole) {
    return (
      <div className={wrapClass} onClick={embedded ? undefined : onClose}>
        <div
          className={panelClass}
          onClick={embedded ? undefined : (e) => e.stopPropagation()}
          role={embedded ? 'region' : 'dialog'}
          aria-modal={embedded ? undefined : true}
          data-pad-root={embedded ? undefined : '1'}
        >
          <div className="modal__header">
            <button type="button" className="modal__back" onClick={() => setActiveConsole(null)}>
              ← Consoles
            </button>
            <h2>
              {activeConsole.name}{' '}
              <span className="modal__sub">({activeConsole.gamesCount} jogos)</span>
            </h2>
            {!embedded && (
              <button type="button" className="modal__close" onClick={onClose} aria-label="Fechar">
                ×
              </button>
            )}
          </div>

          <div className="emulation__settings">
            <label className="emulation__setting">
              <span>Emulador ativo</span>
              <select
                value={activeConsole.activeEmulator}
                onChange={(e) => void changeEmulator(e.target.value)}
              >
                {activeConsole.emulatorOptions.map((opt) => (
                  <option key={`${opt.id}-${opt.core ?? ''}`} value={opt.id}>
                    {opt.name}
                    {opt.core ? ` (${opt.core})` : ''}
                    {opt.detectedPath ? '' : ' — não encontrado'}
                  </option>
                ))}
              </select>
            </label>
            <div className="emulation__setting">
              <span>Pasta padrão (drop-in)</span>
              <div className="emulation__folder-row">
                <span className="emulation__folder">
                  {activeConsole.defaultFolder || 'Nenhuma pasta definida'}
                </span>
                <button type="button" onClick={() => void pickFolder()}>
                  Escolher pasta
                </button>
              </div>
            </div>
            <div className="emulation__actions">
              <button type="button" disabled={scanning} onClick={() => void doScan(activeConsole.id)}>
                {scanning
                  ? progress?.total
                    ? `Escaneando ${progress.scanned}/${progress.total}…`
                    : 'Escaneando…'
                  : 'Escanear pasta'}
              </button>
              <button type="button" onClick={() => void mapRom()}>
                Mapear ROM manualmente
              </button>
            </div>
          </div>

          {games.length === 0 ? (
            <div className="emulation__empty">
              <p>Nenhum ROM mapeado para {activeConsole.shortName}.</p>
              <p>Defina a pasta padrão e escaneie, ou mapeie um arquivo manualmente.</p>
            </div>
          ) : (
            <ul className="emulation__list">
              {games.map((game) => {
                const romSource =
                  game.sources.find((s) => s.platform === 'emulator') ?? game.preferredSource;
                return (
                  <li key={game.id} className="emulation__row">
                    <span className="emulation__title">{game.title}</span>
                    <span className="emulation__path" title={romSource?.installPath ?? ''}>
                      {romSource?.installPath ?? ''}
                    </span>
                    <span className="emulation__row-actions">
                      <button
                        type="button"
                        onClick={() => void onLaunch(game)}
                        title={`Iniciar com ${activeConsole.activeEmulator}`}
                      >
                        Iniciar
                      </button>
                      {romSource && (
                        <button
                          type="button"
                          className="danger"
                          onClick={() => void removeRom(romSource.id)}
                          title="Remover do console (não apaga o arquivo)"
                        >
                          Remover
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={wrapClass} onClick={embedded ? undefined : onClose}>
      <div
        className={panelClass}
        onClick={embedded ? undefined : (e) => e.stopPropagation()}
        role={embedded ? 'region' : 'dialog'}
        aria-modal={embedded ? undefined : true}
        data-pad-root={embedded ? undefined : '1'}
      >
        <div className="modal__header">
          <h2>Consoles</h2>
          <span className="modal__sub">Entre num console para ver os jogos / ROMs</span>
          {!embedded && (
            <button type="button" className="modal__close" onClick={onClose} aria-label="Fechar">
              ×
            </button>
          )}
        </div>
        <div className="emulation__consoles">
          {consoles.map((c) => {
            const activeEmulator = c.emulatorOptions.find((o) => o.id === c.activeEmulator);
            return (
              <button
                key={c.id}
                type="button"
                className="console-card"
                onClick={() => openConsole(c.id)}
              >
                <span className="console-card__name">{c.shortName}</span>
                <span className="console-card__meta">{c.name}</span>
                <span className="console-card__meta">
                  {c.gamesCount} jogo{c.gamesCount === 1 ? '' : 's'}
                </span>
                <span className="console-card__meta console-card__emulator">
                  {activeEmulator
                    ? activeEmulator.detectedPath
                      ? activeEmulator.name
                      : `${activeEmulator.name} (não detectado)`
                    : 'Sem emulador'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
