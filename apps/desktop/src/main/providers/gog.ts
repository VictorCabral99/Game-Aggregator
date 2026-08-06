import type { ProviderGame } from '@gagg/core';
import { SidecarProvider } from './sidecar';

interface GogdlResponse {
  library?: Array<{
    appName?: string;
    app_name?: string;
    title?: string;
    install_path?: string;
    size?: number;
    versionName?: string;
  }>;
}

/** GOG via gogdl. Autenticação: `gogdl auth` no terminal. */
export class GogProvider extends SidecarProvider {
  constructor() {
    super({ bin: 'gogdl.exe', platform: 'gog', displayName: 'GOG' });
  }

  scan(): ProviderGame[] {
    const data = this.runJson(['list-installed', '--json']) as GogdlResponse;
    const items = data?.library ?? [];
    const games: ProviderGame[] = [];
    for (const item of items) {
      const externalId = item.appName ?? item.app_name;
      if (!externalId || !item.title) continue;
      games.push({
        providerId: 'gog',
        externalId,
        title: item.title,
        installPath: item.install_path,
        sizeBytes: item.size,
        raw: { version: item.versionName },
      });
    }
    return games.sort((a, b) => a.title.localeCompare(b.title));
  }

  launchApp(appName: string) {
    return this.launch(['launch', appName]);
  }

  /** Download/install via gogdl (abre o processo; progresso no terminal do sidecar). */
  installApp(appName: string) {
    return this.launch(['download', appName, '--platform', 'windows', '--skip-dlcs']);
  }
}
