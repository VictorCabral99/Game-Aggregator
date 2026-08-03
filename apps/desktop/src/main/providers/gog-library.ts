import { net } from 'electron';
import type { ProviderGame } from '@gagg/core';

function httpGetJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = net.request({ method: 'GET', url });
    request.setHeader('Accept', 'application/json');
    for (const [k, v] of Object.entries(headers)) request.setHeader(k, v);
    let body = '';
    request.on('response', (res) => {
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error(`JSON inválido: ${body.slice(0, 200)}`));
        }
      });
    });
    request.on('error', reject);
    request.end();
  });
}

function coverFromImage(image: unknown): string | undefined {
  if (typeof image !== 'string' || !image) return undefined;
  const src = image.startsWith('//') ? `https:${image}` : image;
  // vertical cover costuma funcionar melhor na grade
  if (src.includes('_glx_')) return src;
  return `${src}_glx_vertical_cover.webp`;
}

/**
 * Biblioteca owned GOG via embed API (Bearer do OAuth Galaxy).
 * Não depende do gogdl.exe.
 */
export async function fetchGogOwnedGames(accessToken: string): Promise<ProviderGame[]> {
  const games: ProviderGame[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && page <= 100) {
    const url =
      `https://embed.gog.com/account/getFilteredProducts?mediaType=1&page=${page}` +
      `&sortBy=title&hiddenFlag=0`;
    const data = await httpGetJson(url, {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'gagg/1.0 (Game Aggregator)',
    });

    totalPages = Number(data.totalPages) || 1;
    const products = Array.isArray(data.products) ? data.products : [];
    for (const p of products) {
      if (p?.isMovie) continue;
      const id = p?.id ?? p?.productId;
      const title = typeof p?.title === 'string' ? p.title.trim() : '';
      if (!id || !title) continue;
      games.push({
        providerId: 'gog',
        externalId: String(id),
        title,
        coverUrl: coverFromImage(p.image),
        raw: { slug: p.slug, category: p.category },
      });
    }
    page += 1;
  }

  return games.sort((a, b) => a.title.localeCompare(b.title));
}
