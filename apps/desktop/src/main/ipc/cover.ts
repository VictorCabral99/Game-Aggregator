import { app, dialog, ipcMain } from 'electron';
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getLibraryRepository } from '../db';
import type { Game } from '../db/games';

export function coversDir(): string {
  return join(app.getPath('userData'), 'covers');
}

async function ensureCoversDir(): Promise<void> {
  await mkdir(coversDir(), { recursive: true });
}

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);

/** Candidatos de URL de capa para um jogo (P3-10): URL gravada ou Steam CDN por appid. */
function coverCandidates(game: Game): string[] {
  const urls: string[] = [];
  if (game.coverUrl) urls.push(game.coverUrl);
  for (const s of game.sources) {
    if (s.platform === 'steam' && s.externalId) {
      urls.push(`https://cdn.cloudflare.steamstatic.com/steam/apps/${s.externalId}/library_600x900.jpg`);
    }
  }
  return [...new Set(urls)];
}

/** Baixa a capa de um jogo para o cache em disco e atualiza cover_path (P3-10/11). */
export async function downloadCoverForGame(game: Game): Promise<boolean> {
  for (const url of coverCandidates(game)) {
    try {
      const path = await downloadToCache(url);
      getLibraryRepository().setCoverPath(game.id, path);
      return true;
    } catch {
      // tenta o próximo candidato
    }
  }
  return false;
}

export function registerCoverHandlers(): void {
  ipcMain.handle('pick-exe', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Selecionar executável',
      properties: ['openFile'],
      filters: [{ name: 'Executável', extensions: ['exe'] }],
    });
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
  });

  ipcMain.handle('pick-cover', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Selecionar capa',
      properties: ['openFile'],
      filters: [{ name: 'Imagens', extensions: [...IMAGE_EXT].map((e) => e.slice(1)) }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return copyToCovers(result.filePaths[0]);
  });

  ipcMain.handle('cover-from-url', async (_event, url: string): Promise<string> => {
    if (!/^https?:\/\//i.test(url)) throw new Error('URL inválida (use http/https)');
    return downloadToCache(url);
  });

  // Baixa capas faltantes em lote (offline na próxima abertura).
  ipcMain.handle('covers:download-missing', async (): Promise<{ downloaded: number; failed: number }> => {
    const games = getLibraryRepository().list().filter((g) => !g.coverPath);
    let downloaded = 0;
    let failed = 0;
    for (const game of games) {
      if (await downloadCoverForGame(game)) downloaded++;
      else failed++;
    }
    return { downloaded, failed };
  });
}

async function downloadToCache(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar capa (HTTP ${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());

  let ext = extname(new URL(url).pathname).toLowerCase();
  if (!ext || !IMAGE_EXT.has(ext)) {
    ext = (res.headers.get('content-type') ?? '').includes('png') ? '.png' : '.jpg';
  }
  return saveBuffer(buffer, ext);
}

async function copyToCovers(source: string): Promise<string> {
  await ensureCoversDir();
  const ext = extname(source).toLowerCase();
  const target = join(coversDir(), `${randomUUID()}${ext || '.img'}`);
  await copyFile(source, target);
  return target;
}

async function saveBuffer(buffer: Buffer, ext: string): Promise<string> {
  await ensureCoversDir();
  const target = join(coversDir(), `${randomUUID()}${ext}`);
  await new Promise<void>((resolve, reject) => {
    const ws = createWriteStream(target);
    ws.on('error', reject);
    ws.on('finish', resolve);
    ws.write(buffer);
    ws.end();
  });
  return target;
}
