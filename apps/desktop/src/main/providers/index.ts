import { getSetting, setSetting } from '../db';
import { SteamProvider } from './steam';

let steam: SteamProvider | null = null;

export function getSteamProvider(): SteamProvider {
  if (!steam) {
    steam = new SteamProvider({ get: getSetting, set: setSetting });
  }
  return steam;
}
