import type { ProviderGame } from '@gagg/core';
import { SidecarProvider } from './sidecar';

interface NileItem {
  id?: string;
  title?: string;
  install_path?: string;
  install_size?: number;
  size?: number;
}

/** Amazon Games (incl. Prime Gaming) via Nile. Autenticação: `nile auth` no terminal. */
export class AmazonProvider extends SidecarProvider {
  constructor() {
    super({ bin: 'nile.exe', platform: 'amazon', displayName: 'Amazon' });
  }

  scan(): ProviderGame[] {
    const data = this.runJson(['list-installed', '--json']) as NileItem[];
    const games: ProviderGame[] = [];
    for (const item of Array.isArray(data) ? data : []) {
      if (!item.id || !item.title) continue;
      games.push({
        providerId: 'amazon',
        externalId: item.id,
        title: item.title,
        installPath: item.install_path,
        sizeBytes: item.install_size ?? item.size,
      });
    }
    return games.sort((a, b) => a.title.localeCompare(b.title));
  }

  launchApp(id: string) {
    return this.launch(['launch', id]);
  }

  installApp(id: string, installPath?: string) {
    const args = ['install', id];
    if (installPath) args.push('--path', installPath);
    return this.launch(args);
  }
}
