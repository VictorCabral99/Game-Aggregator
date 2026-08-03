import { ipcMain } from 'electron';
import { getRatingsRepository, getSetting } from '../db';
import { streamEnrichLibrary, syncAllRatings } from '../ratings';
import type { EnrichEvent } from '../../shared/api';

export function registerRatingsHandlers(): void {
  ipcMain.handle('ratings:for-game', (_event, gameId: string) => {
    if (!gameId) throw new Error('gameId é obrigatório');
    return getRatingsRepository().summaryForGame(gameId);
  });

  ipcMain.handle('ratings:for-library', () => {
    return getRatingsRepository().summariesForAll();
  });

  ipcMain.handle('ratings:sync-all', () => syncAllRatings());

  /** Stream progresso (capa + notas) — UI atualiza jogo a jogo. */
  ipcMain.handle(
    'ratings:enrich-stream',
    async (event, opts?: { gameIds?: string[]; force?: boolean; maxGames?: number }) => {
      const send = (payload: EnrichEvent) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('library:enrich-progress', payload);
        }
      };
      try {
        return await streamEnrichLibrary(send, opts);
      } catch (err) {
        send({
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    }
  );

  ipcMain.handle('ratings:settings', () => ({
    rawgKey: process.env.RAWG_API_KEY ?? getSetting('keys.rawg') ?? '',
    steamKey: process.env.STEAM_API_KEY ?? getSetting('keys.steam') ?? '',
  }));
}
