import { app, dialog, ipcMain } from 'electron';
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getCacheRow, getLibraryRepository, upsertCache } from '../db';
import type { Game } from '../db/games';
import { resolveSteamAppIdForGame } from '../steam-appid';
import {
  libretroBoxartUrl,
  libretroCoverCandidates,
  libretroSystemsForConsole,
  libretroTitleVariants,
  pickBestBoxartName,
  romBasenameForCover,
} from '../emulation/libretro-covers';

export function coversDir(): string {
  return join(app.getPath('userData'), 'covers');
}

async function ensureCoversDir(): Promise<void> {
  await mkdir(coversDir(), { recursive: true });
}

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
const BOXART_INDEX_TTL_MS = 30 * 24 * 3600 * 1000;

/** Cache em memória por sessão (evita reparse HTML a cada jogo). */
const boxartIndexMemory = new Map<string, string[]>();

function logCover(msg: string): void {
  console.log(msg.startsWith('[cover]') ? msg : `[cover] ${msg}`);
}

/** Lista nomes (sem .png) do índice Named_Boxarts do Libretro. */
export async function fetchLibretroBoxartIndex(system: string): Promise<string[]> {
  const mem = boxartIndexMemory.get(system);
  if (mem) return mem;

  const cacheKey = `libretro:boxarts:${system}`;
  const row = getCacheRow(cacheKey);
  if (row && Date.now() - new Date(row.fetched_at).getTime() < BOXART_INDEX_TTL_MS) {
    try {
      const names = JSON.parse(row.body) as string[];
      if (Array.isArray(names) && names.length > 0) {
        boxartIndexMemory.set(system, names);
        return names;
      }
    } catch {
      // refetch
    }
  }

  const url = `https://thumbnails.libretro.com/${encodeURIComponent(system)}/Named_Boxarts/`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`índice boxart HTTP ${res.status}`);
  const html = await res.text();
  const names: string[] = [];
  for (const m of html.matchAll(/href="([^"?#]+\.png)"/gi)) {
    let raw = m[1];
    try {
      raw = decodeURIComponent(raw);
    } catch {
      // keep raw
    }
    if (raw.includes('/') || raw === '..') continue;
    names.push(raw.replace(/\.png$/i, ''));
  }
  const unique = [...new Set(names)];
  upsertCache(cacheKey, JSON.stringify(unique));
  boxartIndexMemory.set(system, unique);
  logCover(`índice · ${system} · ${unique.length} boxarts`);
  return unique;
}

/** URLs priorizadas via fuzzy match no índice + fallback de guess. */
async function coverCandidatesForRetro(game: Game): Promise<string[]> {
  const urls: string[] = [];
  const queries: string[] = [game.title];

  for (const s of game.sources) {
    if (s.platform !== 'emulator' || !s.consoleId) continue;
    if (s.installPath) {
      const fromRom = romBasenameForCover(s.installPath);
      if (fromRom) queries.push(fromRom);
    }

    const systems = libretroSystemsForConsole(s.consoleId);
    for (const system of systems) {
      try {
        const index = await fetchLibretroBoxartIndex(system);
        const best = pickBestBoxartName(queries, index);
        if (best) {
          urls.push(libretroBoxartUrl(system, best.name));
          logCover(
            `${game.title} · match · score=${best.score} · q="${best.query}" · → ${best.name}`
          );
        } else {
          logCover(`${game.title} · sem match no índice · ${system} (${index.length})`);
        }
      } catch (err) {
        logCover(
          `${game.title} · índice falhou · ${system} · ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // Fallback: guesses URL (região / variantes)
    urls.push(...libretroCoverCandidates(game.title, s.consoleId, queries));
  }

  return [...new Set(urls)];
}

function coverCandidatesStore(game: Game): string[] {
  const urls: string[] = [];
  if (game.coverUrl) urls.push(game.coverUrl);
  const appid = resolveSteamAppIdForGame(game);
  if (appid) {
    urls.push(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`);
  }
  return urls;
}

/** Baixa a capa de um jogo para o cache em disco e atualiza cover_path (P3-10/11). */
export async function downloadCoverForGame(game: Game): Promise<boolean> {
  const isRetro = game.sources.some((s) => s.platform === 'emulator');
  // Retro: Libretro primeiro (boxart). coverUrl/Steam no fim — evita capa errada de lookup frouxo.
  const candidates = isRetro
    ? [...(await coverCandidatesForRetro(game)), ...coverCandidatesStore(game)]
    : coverCandidatesStore(game);

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

  ipcMain.handle('covers:download-missing', async (): Promise<{ downloaded: number; failed: number }> => {
    return downloadMissingRetroCovers();
  });
}

async function downloadToCache(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar capa (HTTP ${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
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

// re-export for tests / callers
export { libretroTitleVariants };
