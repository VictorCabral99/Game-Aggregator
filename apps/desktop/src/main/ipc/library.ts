import { dialog, ipcMain } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { getLibraryRepository, getSetting } from '../db';
import { installPlatformGame, launchPlatformGame } from '../providers';
import { isStorePlatform } from '../providers/store-protocols';
import type { CreateGameInput, UpdateGameInput } from '../db/games';
import type { LibraryImportResult, LibraryExportPayload } from '../../shared/api';
import {
  getLocalGamesSetup,
  scanLocalGamesFolder,
  setLocalGamesRoot,
} from '../local-games';
import { withSteamAppId, withSteamAppIds } from '../steam-appid';
import { purgeNonGameSteamEntries } from './providers';

export function registerLibraryHandlers(): void {
  const repo = () => getLibraryRepository();

  ipcMain.handle('library:list', () => {
    purgeNonGameSteamEntries();
    return withSteamAppIds(repo().list());
  });

  ipcMain.handle('library:local-setup-get', () => getLocalGamesSetup());

  ipcMain.handle('library:pick-games-root', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Selecionar pasta de jogos externos',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return setLocalGamesRoot(result.filePaths[0]);
  });

  ipcMain.handle('library:scan-local-games', () => scanLocalGamesFolder());


  ipcMain.handle('library:add', (_event, input: CreateGameInput) => {
    if (!input || !input.title?.trim() || !input.executable?.trim()) {
      throw new Error('Título e executável são obrigatórios');
    }
    if (!existsSync(input.executable.trim())) {
      throw new Error('Arquivo do executável não encontrado');
    }
    return withSteamAppId(repo().add(input));
  });

  ipcMain.handle(
    'library:update',
    (_event, args: { id: string; patch: UpdateGameInput }) => {
      if (!args?.id) throw new Error('id é obrigatório');
      const game = repo().update(args.id, args.patch ?? {});
      if (!game) throw new Error('Jogo não encontrado');
      return withSteamAppId(game);
    }
  );

  ipcMain.handle('library:remove', (_event, id: string) => {
    if (!id) throw new Error('id é obrigatório');
    repo().remove(id);
    return { ok: true };
  });

  ipcMain.handle('library:launch', async (_event, id: string) => {
    const game = repo().get(id);
    if (!game) throw new Error('Jogo não encontrado');
    const source = game.preferredSource;
    if (!source) throw new Error('Jogo sem fonte para iniciar');
    return launchSource(source.id);
  });

  ipcMain.handle('library:launch-source', async (_event, sourceId: string) => {
    const source = repo().getSource(sourceId);
    if (!source) throw new Error('Fonte do jogo não encontrada');
    return launchSource(source.id);
  });

  ipcMain.handle('library:install', async (_event, id: string) => {
    const game = repo().get(id);
    if (!game) throw new Error('Jogo não encontrado');
    const source = game.preferredSource;
    if (!source) throw new Error('Jogo sem fonte para instalar');
    return installSource(source.id);
  });

  ipcMain.handle('library:install-source', async (_event, sourceId: string) => {
    const source = repo().getSource(sourceId);
    if (!source) throw new Error('Fonte do jogo não encontrada');
    return installSource(source.id);
  });

  ipcMain.handle('library:merge-sources', (_event, args: { targetGameId: string; sourceIds: string[] }) => {
    if (!args?.targetGameId || !Array.isArray(args.sourceIds)) {
      throw new Error('Argumentos inválidos para merge');
    }
    return repo().mergeSources(args.targetGameId, args.sourceIds);
  });

  ipcMain.handle('library:separate-source', (_event, sourceId: string) => {
    if (!sourceId) throw new Error('sourceId é obrigatório');
    return repo().separateSource(sourceId);
  });

  ipcMain.handle('library:possible-duplicates', () => repo().possibleDuplicates());

  // P8-06 — export/import JSON (offline backup)
  ipcMain.handle('library:export', async () => {
    const profile = getSetting('ui.profile');
    const payload = repo().exportPayload(profile);
    const result = await dialog.showSaveDialog({
      title: 'Exportar biblioteca',
      defaultPath: `gagg-library-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, error: 'cancelado' };
    writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf8');
    return { ok: true, path: result.filePath };
  });

  ipcMain.handle('library:import', async (): Promise<LibraryImportResult> => {
    const result = await dialog.showOpenDialog({
      title: 'Importar biblioteca',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { imported: 0, skipped: 0, error: 'cancelado' };
    }
    try {
      const raw = readFileSync(result.filePaths[0], 'utf8');
      const payload = JSON.parse(raw) as LibraryExportPayload;
      return repo().importPayload(payload);
    } catch (err) {
      return {
        imported: 0,
        skipped: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
}

function parseLaunchArgs(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw.trim().split(/\s+/).filter(Boolean);
}

function installSource(sourceId: string) {
  const repo = getLibraryRepository();
  const source = repo.getSource(sourceId);
  if (!source) return Promise.resolve({ ok: false, error: 'Fonte não encontrada' });
  if (!isStorePlatform(source.platform)) {
    return Promise.resolve({ ok: false, error: 'Só lojas suportam instalação remota' });
  }
  if (!source.externalId) {
    return Promise.resolve({ ok: false, error: 'Jogo sem id externo' });
  }
  return installPlatformGame(source.platform, source.externalId, {
    rawJson: source.rawJson,
    title: source.title,
  });
}

function launchSource(sourceId: string) {
  const repo = getLibraryRepository();
  const source = repo.getSource(sourceId);
  if (!source) return Promise.resolve({ ok: false, error: 'Fonte não encontrada' });

  if (source.platform === 'emulator') {
    return import('../emulation').then(async ({ launchRom }) => {
      const res = await launchRom(source);
      if (res.ok) repo.touchSourcePlayed(source.id);
      return res;
    });
  }

  if (source.platform !== 'local' && source.platform !== 'manual') {
    if (!source.externalId) {
      return Promise.resolve({ ok: false, error: 'Jogo sem id externo' });
    }
    return launchPlatformGame(source.platform, source.externalId, {
      rawJson: source.rawJson,
    }).then((res) => {
      if (res.ok) repo.touchSourcePlayed(source.id);
      return res;
    });
  }

  if (!source.executable) {
    return Promise.resolve({ ok: false, error: 'Este jogo não tem executável local' });
  }
  if (!existsSync(source.executable)) {
    return Promise.resolve({ ok: false, error: 'arquivo não encontrado' });
  }

  const game = repo.get(source.gameId);
  const args = parseLaunchArgs(game?.launchArgs);

  return import('node:child_process').then(({ spawn }) => {
    return new Promise((resolve) => {
      const child = spawn(source.executable as string, args, {
        cwd: source.cwd || undefined,
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });

      const fail = (err: Error) => resolve({ ok: false, error: err.message });

      child.once('error', fail);
      child.once('spawn', () => {
        child.removeListener('error', fail);
        child.unref();
        repo.touchSourcePlayed(source.id);
        resolve({ ok: true, pid: child.pid });
      });
    });
  });
}
