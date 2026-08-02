import { ipcMain } from 'electron';
import { getSetting, getWishlistRepository } from '../db';
import type { WishlistAddInput } from '../../shared/api';
import { importSteamWishlist, searchItadGames, syncWishlistPrices } from '../wishlist';

export function registerWishlistHandlers(): void {
  ipcMain.handle('wishlist:list', () => getWishlistRepository().list());

  ipcMain.handle('wishlist:add', (_event, input: WishlistAddInput) => {
    if (!input?.title?.trim()) throw new Error('Título é obrigatório');
    return getWishlistRepository().add(input);
  });

  ipcMain.handle('wishlist:update', (_event, args: { id: string; patch: Partial<WishlistAddInput> }) => {
    if (!args?.id) throw new Error('id é obrigatório');
    return getWishlistRepository().update(args.id, args.patch ?? {});
  });

  ipcMain.handle('wishlist:remove', (_event, id: string) => {
    getWishlistRepository().remove(id);
    return { ok: true };
  });

  ipcMain.handle('wishlist:search', (_event, query: string) => searchItadGames(query));

  ipcMain.handle('wishlist:sync-prices', () => syncWishlistPrices());

  ipcMain.handle('wishlist:import-steam', () => importSteamWishlist());

  ipcMain.handle('wishlist:settings', () => ({
    itadKey: process.env.ITAD_API_KEY ?? getSetting('keys.itad') ?? '',
    country: process.env.ITAD_COUNTRY ?? getSetting('itad.country') ?? 'BR',
    steamId: getSetting('steam.id') ?? '',
  }));
}
