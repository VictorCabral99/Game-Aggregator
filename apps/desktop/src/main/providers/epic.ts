import type { ProviderGame } from '@gagg/core';
import { SidecarProvider } from './sidecar';

interface LegendaryItem {
  app_name?: string;
  title?: string;
  install_path?: string;
  size?: number;
  version?: string;
  is_dlc?: boolean;
}

/** Epic Games via Legendary. Autenticação: `legendary auth` no terminal. */
export class EpicProvider extends SidecarProvider {
  constructor() {
    super({ bin: 'legendary.exe', platform: 'epic', displayName: 'Epic' });
  }

  scan(): ProviderGame[] {
    const data = this.runJson(['list-installed', '--json']) as LegendaryItem[];
    const games: ProviderGame[] = [];
    for (const item of Array.isArray(data) ? data : []) {
      if (!item.app_name || !item.title || item.is_dlc) continue;
      games.push({
        providerId: 'epic',
        externalId: item.app_name,
        title: item.title,
        installPath: item.install_path,
        sizeBytes: item.size,
        coverUrl: undefined,
        raw: { version: item.version },
      });
    }
    return games.sort((a, b) => a.title.localeCompare(b.title));
  }

  launchApp(appName: string) {
    return this.launch(['launch', appName]);
  }

  /** Instalação via Legendary (-y confirma prompts). */
  installApp(appName: string, basePath?: string) {
    const args = ['install', appName, '-y'];
    if (basePath) args.push('--base-path', basePath);
    return this.launch(args);
  }
}
