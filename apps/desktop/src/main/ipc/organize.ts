import { BrowserWindow, dialog, ipcMain } from 'electron';
import {
  discoverOrganizeGames,
  ensureOrganizeDirs,
  getOrganizeRootStatus,
  setGamesRoot,
  transferOrganizeGames,
  type OrganizeTransferEvent,
} from '../organize';

function broadcast(channel: string, data: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, data);
  }
}

export function registerOrganizeHandlers(): void {
  ipcMain.handle('organize:get-root', () => getOrganizeRootStatus());

  ipcMain.handle('organize:set-root', (_e, folder: string) => {
    if (typeof folder !== 'string') throw new Error('pasta inválida');
    return setGamesRoot(folder);
  });

  ipcMain.handle('organize:ensure-dirs', async () => ensureOrganizeDirs());

  ipcMain.handle('organize:pick-root', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Pasta padrão de jogos (ex.: C:\\Games)',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const status = setGamesRoot(result.filePaths[0]);
    await ensureOrganizeDirs(status.gamesRoot);
    return getOrganizeRootStatus();
  });

  ipcMain.handle(
    'organize:discover',
    async (_e, opts?: { includeSteam?: boolean; extraFolders?: string[] }) => {
      await ensureOrganizeDirs();
      return discoverOrganizeGames({
        includeSteam: opts?.includeSteam === true,
        extraFolders: Array.isArray(opts?.extraFolders) ? opts.extraFolders : undefined,
      });
    }
  );

  ipcMain.handle('organize:pick-scan-folder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Escanear pasta em busca de jogos (subpastas)',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('organize:transfer', async (_e, ids: string[]) => {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error('Selecione ao menos um jogo');
    }
    return transferOrganizeGames(ids, {
      onEvent: (ev: OrganizeTransferEvent) => broadcast('organize:transfer-progress', ev),
    });
  });
}
