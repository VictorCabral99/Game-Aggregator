import { ipcMain } from 'electron';
import { existsSync } from 'node:fs';
import { getLibraryRepository } from '../db';
import { launchPlatformGame } from '../providers';
import type { CreateGameInput, UpdateGameInput } from '../db/games';

export function registerLibraryHandlers(): void {
  const repo = () => getLibraryRepository();

  ipcMain.handle('library:list', () => repo().list());

  ipcMain.handle('library:add', (_event, input: CreateGameInput) => {
    if (!input || !input.title?.trim() || !input.executable?.trim()) {
      throw new Error('Título e executável são obrigatórios');
    }
    if (!existsSync(input.executable.trim())) {
      throw new Error('Arquivo do executável não encontrado');
    }
    return repo().add(input);
  });

  ipcMain.handle(
    'library:update',
    (_event, args: { id: string; patch: UpdateGameInput }) => {
      if (!args?.id) throw new Error('id é obrigatório');
      const game = repo().update(args.id, args.patch ?? {});
      if (!game) throw new Error('Jogo não encontrado');
      return game;
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

  if (source.platform !== 'local') {
    if (!source.externalId) {
      return Promise.resolve({ ok: false, error: 'Jogo sem id externo' });
    }
    return launchPlatformGame(source.platform, source.externalId).then((res) => {
      if (res.ok) repo.touchSourcePlayed(source.id);
      return res;
    });
  }

  if (!source.executable) {
    return Promise.resolve({ ok: false, error: 'Este jogo não tem executável local' });
  }

  return import('node:child_process').then(({ spawn }) => {
    return new Promise((resolve) => {
      const child = spawn(source.executable as string, [], {
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
