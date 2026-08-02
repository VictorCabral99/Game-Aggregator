import { ipcMain } from 'electron';
import { getRatingsRepository, getSetting } from '../db';
import { syncAllRatings } from '../ratings';

export function registerRatingsHandlers(): void {
  ipcMain.handle('ratings:for-game', (_event, gameId: string) => {
    if (!gameId) throw new Error('gameId é obrigatório');
    return getRatingsRepository().summaryForGame(gameId);
  });

  ipcMain.handle('ratings:for-library', () => {
    return getRatingsRepository().summariesForAll();
  });

  ipcMain.handle('ratings:sync-all', () => syncAllRatings());

  ipcMain.handle('ratings:settings', () => ({
    rawgKey: process.env.RAWG_API_KEY ?? getSetting('keys.rawg') ?? '',
    steamKey: process.env.STEAM_API_KEY ?? getSetting('keys.steam') ?? '',
  }));
}
