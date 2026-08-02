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

    if (game.platform !== 'local') {
      if (!game.externalId) throw new Error('Jogo sem id externo');
      const res = await launchPlatformGame(game.platform, game.externalId);
      if (res.ok) repo().touchPlayed(id);
      return res;
    }

    if (!game.executable) throw new Error('Este jogo não tem executável local');

    const { spawn } = await import('node:child_process');
    return new Promise((resolve) => {
      const child = spawn(game.executable as string, [], {
        cwd: game.cwd || undefined,
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });

      const fail = (err: Error) => resolve({ ok: false, error: err.message });

      child.once('error', fail);
      child.once('spawn', () => {
        child.removeListener('error', fail);
        child.unref();
        repo().touchPlayed(id);
        resolve({ ok: true, pid: child.pid });
      });
    });
  });
}
