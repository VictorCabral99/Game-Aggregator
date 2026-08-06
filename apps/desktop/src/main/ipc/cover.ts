import { app, dialog, ipcMain } from 'electron';
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getLibraryRepository, getSetting } from '../db';
import type { Game } from '../db/games';
import {
  libretroCoverCandidates,
  romBasenameForCover,
} from '../emulation/libretro-covers';

export function coversDir(): string {
  return join(app.getPath('userData'), 'covers');
}

async function ensureCoversDir(): Promise<void> {
  await mkdir(coversDir(), { recursive: true });
}

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);

function resolvedSteamAppId(game: Game): string | null {
  const fromSource = game.sources.find((s) => s.platform === 'steam' && s.externalId)?.externalId;
  if (fromSource) return fromSource;
  return getSetting(`steam.appid.${game.id}`)?.trim() || null;
}

/** Candidatos de URL de capa: coverUrl da loja, Steam CDN, ou Libretro boxarts (retro). */
function coverCandidates(game: Game): string[] {
  const urls: string[] = [];
  if (game.coverUrl) urls.push(game.coverUrl);
  const appid = resolvedSteamAppId(game);
  if (appid) {
    urls.push(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`);
  }
  for (const s of game.sources) {
    if (s.platform === 'emulator' && s.consoleId) {
      // Título limpo na lib + nome do arquivo ROM (com região No-Intro)
      const fromRom = s.installPath ? romBasenameForCover(s.installPath) : '';
      const extras = fromRom && fromRom !== game.title ? [fromRom] : [];
      urls.push(...libretroCoverCandidates(game.title, s.consoleId, extras));
    }
  }
  return [...new Set(urls)];
}

function logCover(msg: string): void {
  console.log(msg.startsWith('[cover]') ? msg : `[cover] ${msg}`);
}

/** Baixa a capa de um jogo para o cache em disco e atualiza cover_path (P3-10/11). */
export async function downloadCoverForGame(game: Game): Promise<boolean> {
  const candidates = coverCandidates(game);
  if (candidates.length === 0) {
    logCover(`${game.title} · sem candidatos (console/title?)`);
    return false;
  }

  let tried = 0;
  for (const url of candidates) {
    tried += 1;
    try {
      const path = await downloadToCache(url);
      getLibraryRepository().setCoverPath(game.id, path);
      const short = decodeURIComponent(url.split('/Named_Boxarts/').pop() || url);
      logCover(`${game.title} · HIT · ${short} · tentativa ${tried}/${candidates.length}`);
      return true;
    } catch (err) {
      const status =
        err instanceof Error && /HTTP (\d+)/.test(err.message)
          ? err.message.match(/HTTP (\d+)/)?.[1]
          : null;
      if (tried <= 3 || tried === candidates.length) {
        logCover(
          `${game.title} · miss · ${status ? `HTTP ${status}` : err instanceof Error ? err.message : String(err)} · ${tried}/${candidates.length}`
        );
      }
    }
  }
  logCover(`${game.title} · MISS total · ${candidates.length} URLs tentadas`);
  return false;
}

/** Capas faltantes só de ROMs (após scan retro). */
export async function downloadMissingRetroCovers(): Promise<{ downloaded: number; failed: number }> {
  const games = getLibraryRepository()
    .list()
    .filter((g) => !g.coverPath && g.sources.some((s) => s.platform === 'emulator'));
  logCover(`batch retro · ${games.length} sem capa`);
  let downloaded = 0;
  let failed = 0;
  for (const game of games) {
    if (await downloadCoverForGame(game)) downloaded += 1;
    else failed += 1;
  }
  logCover(`batch retro · done · ok=${downloaded} fail=${failed}`);
  return { downloaded, failed };
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

  // Baixa capas faltantes só de ROMs (lojas usam coverUrl do sync).
  ipcMain.handle('covers:download-missing', async (): Promise<{ downloaded: number; failed: number }> => {
    return downloadMissingRetroCovers();
  });
}

async function downloadToCache(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar capa (HTTP ${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  // Libretro às vezes devolve HTML 200 com página de erro — rejeita
  const ctype = (res.headers.get('content-type') ?? '').toLowerCase();
  if (ctype.includes('text/html')) {
    throw new Error('Falha ao baixar capa (HTML em vez de imagem)');
  }
  if (buffer.length < 500) {
    throw new Error(`Falha ao baixar capa (arquivo muito pequeno: ${buffer.length}b)`);
  }

  let ext = extname(new URL(url).pathname).toLowerCase();
  if (!ext || !IMAGE_EXT.has(ext)) {
    ext = ctype.includes('png') ? '.png' : '.jpg';
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
