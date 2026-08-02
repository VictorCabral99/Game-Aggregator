import type { GamePlatform } from '../db/games';
import { getSetting, setSetting } from '../db';
import { SteamProvider } from './steam';
import { EpicProvider } from './epic';
import { GogProvider } from './gog';
import { AmazonProvider } from './amazon';
import type { LaunchResult } from '@gagg/core';

let steam: SteamProvider | null = null;
let epic: EpicProvider | null = null;
let gog: GogProvider | null = null;
let amazon: AmazonProvider | null = null;

export function getSteamProvider(): SteamProvider {
  if (!steam) {
    steam = new SteamProvider({ get: getSetting, set: setSetting });
  }
  return steam;
}

export function getEpicProvider(): EpicProvider {
  if (!epic) epic = new EpicProvider();
  return epic;
}

export function getGogProvider(): GogProvider {
  if (!gog) gog = new GogProvider();
  return gog;
}

export function getAmazonProvider(): AmazonProvider {
  if (!amazon) amazon = new AmazonProvider();
  return amazon;
}

/** Dispara o launch do jogo pela plataforma correta (steam://, sidecar ou exe). */
export async function launchPlatformGame(
  platform: GamePlatform,
  externalId: string
): Promise<LaunchResult> {
  switch (platform) {
    case 'steam':
      return getSteamProvider().launch({ providerId: 'steam', externalId, title: externalId });
    case 'epic':
      return getEpicProvider().launchApp(externalId);
    case 'gog':
      return getGogProvider().launchApp(externalId);
    case 'amazon':
      return getAmazonProvider().launchApp(externalId);
    default:
      return { ok: false, error: `Plataforma sem launch remoto: ${platform}` };
  }
}
