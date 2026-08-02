import { ipcMain } from 'electron';
import type { StoreId, StoreStatus } from '../../shared/api';
import { getEpicProvider, getGogProvider, getAmazonProvider } from '../providers';
import { scanStore, sidecarStatus } from './providers';

const STORE_FACTORIES: Record<StoreId, () => ReturnType<typeof getEpicProvider>> = {
  epic: () => getEpicProvider(),
  gog: () => getGogProvider(),
  amazon: () => getAmazonProvider(),
};

export function registerStoreHandlers(): void {
  for (const id of Object.keys(STORE_FACTORIES) as StoreId[]) {
    const provider = STORE_FACTORIES[id]();

    ipcMain.handle(`${id}:status`, () => sidecarStatus(provider) as StoreStatus);

    ipcMain.handle(`${id}:scan`, () => scanStore(provider.platform));
  }
}
