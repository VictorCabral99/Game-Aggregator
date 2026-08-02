import { app, dialog, ipcMain } from 'electron';
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export function coversDir(): string {
  return join(app.getPath('userData'), 'covers');
}

async function ensureCoversDir(): Promise<void> {
  await mkdir(coversDir(), { recursive: true });
}

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);

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
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Falha ao baixar capa (HTTP ${res.status})`);
    const buffer = Buffer.from(await res.arrayBuffer());

    let ext = extname(new URL(url).pathname).toLowerCase();
    if (!ext || !IMAGE_EXT.has(ext)) {
      ext = (res.headers.get('content-type') ?? '').includes('png') ? '.png' : '.jpg';
    }
    return saveBuffer(buffer, ext);
  });
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
