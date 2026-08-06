import { shell } from 'electron';
import type { LaunchResult, PlatformId } from '@gagg/core';

const STORE_PLATFORMS = new Set<PlatformId>(['steam', 'epic', 'gog', 'amazon']);

export function isStorePlatform(platform: string): boolean {
  return STORE_PLATFORMS.has(platform as PlatformId);
}

/** Abre URI de protocolo da loja (steam://, com.epicgames.launcher://, …). */
export async function openStoreProtocol(url: string): Promise<LaunchResult> {
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Epic URI: Sandbox:Catalog:Artifact (separados por %3A).
 * Prefere meta.namespace + meta.appId; externalId costuma ser o Catalog ID.
 */
export function epicAppUri(
  externalId: string,
  action: 'launch' | 'installer',
  meta?: { namespace?: string; appId?: string; catalogItemId?: string }
): string {
  const parts = externalId.split(':').filter(Boolean);

  // Já veio composto ns:catalog:app
  if (parts.length >= 3) {
    const path = parts.map(encodeURIComponent).join('%3A');
    return `com.epicgames.launcher://apps/${path}?action=${action}`;
  }

  const sandbox = meta?.namespace ?? (parts.length === 2 ? parts[0] : '');
  const catalog = meta?.catalogItemId ?? (parts.length === 2 ? parts[1] : externalId);
  const artifact = meta?.appId || catalog;

  if (!sandbox) {
    return `com.epicgames.launcher://apps/${encodeURIComponent(artifact)}?action=${action}`;
  }

  const path = [sandbox, catalog, artifact].map(encodeURIComponent).join('%3A');
  return `com.epicgames.launcher://apps/${path}?action=${action}`;
}

export function steamInstallUri(appId: string): string {
  return `steam://install/${appId}`;
}

export function steamLaunchUri(appId: string): string {
  return `steam://rungameid/${appId}`;
}

/** Abre a página do jogo no Galaxy — o usuário instala/inicia lá. */
export function gogOpenUri(productId: string): string {
  return `goggalaxy://openGameView/${productId}`;
}

export function amazonOpenUri(productId: string): string {
  // Amazon Games não documenta URI estável; abre o cliente / store page.
  return `https://www.amazon.com/dp/${encodeURIComponent(productId)}`;
}
