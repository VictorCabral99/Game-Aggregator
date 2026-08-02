import { Notification } from 'electron';
import { ITADAPI, SteamAPI } from '@gagg/providers-meta';
import { getCacheRow, getSetting, getWishlistRepository, setSetting, upsertCache } from './db';
import type {
  ITADSearchResult,
  SteamWishlistImportResult,
  WishlistAlert,
  WishlistEntry,
  WishlistSyncResult,
} from '../shared/api';

const PRICE_TTL_MS = 6 * 3600 * 1000; // 6h
const LOOKUP_TTL_MS = 24 * 3600 * 1000; // busca/dedupe 24h
const CONCURRENCY = 2;

function itadKey(): string {
  return process.env.ITAD_API_KEY ?? getSetting('keys.itad') ?? '';
}

function itadCountry(): string {
  return process.env.ITAD_COUNTRY ?? getSetting('itad.country') ?? 'BR';
}

async function cachedGetJson<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const row = getCacheRow(key);
  if (row && Date.now() - new Date(row.fetched_at).getTime() < ttlMs) {
    return JSON.parse(row.body) as T;
  }
  const body = await fetcher();
  upsertCache(key, JSON.stringify(body));
  return body;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor;
      cursor += 1;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

function notifyWindows(title: string, price: number, currency: string): void {
  if (getSetting('wishlist.notifications') !== '1') return;
  try {
    new Notification({
      title: `Oferta na wishlist: ${title}`,
      body: `Agora por ${price.toFixed(2)} ${currency} — dentro do seu preço alvo.`,
      silent: true,
    }).show();
  } catch {
    // notificação é best-effort
  }
}

function checkAlert(entry: WishlistEntry, deal: { currentPrice: number | null; currency: string | null; url: string | null }, alerts: WishlistAlert[]): void {
  if (!entry.alertEnabled || entry.targetPrice === null || deal.currentPrice === null) return;
  const alertKey = `wishlist.alerted.${entry.id}`;
  if (deal.currentPrice <= entry.targetPrice) {
    const last = getSetting(alertKey);
    if (last !== String(deal.currentPrice)) {
      const currency = deal.currency ?? entry.currency;
      alerts.push({
        title: entry.title,
        currentPrice: deal.currentPrice,
        targetPrice: entry.targetPrice,
        currency,
        url: deal.url,
      });
      setSetting(alertKey, String(deal.currentPrice));
      notifyWindows(entry.title, deal.currentPrice, currency);
    }
  } else {
    setSetting(alertKey, '');
  }
}

export async function syncWishlistPrices(): Promise<WishlistSyncResult> {
  const key = itadKey();
  const repo = getWishlistRepository();
  const entries = repo.list();

  if (!key) {
    return { attempted: entries.length, updated: 0, noKey: true, alerts: [] };
  }

  let updated = 0;
  const alerts: WishlistAlert[] = [];

  await mapPool(entries, CONCURRENCY, async (entry) => {
    if (entry.price && Date.now() - new Date(entry.price.fetchedAt).getTime() < PRICE_TTL_MS) {
      return;
    }
    const itad = new ITADAPI(key, itadCountry());
    try {
      let deal: Awaited<ReturnType<typeof itad.getDealForGame>> = null;
      if (entry.itadId) {
        const overview = await cachedGetJson(
          `itad:overview:${entry.itadId}:${itadCountry()}`,
          PRICE_TTL_MS,
          () => itad.getOverview([entry.itadId!])
        );
        const price = overview.prices.find((p) => p.id === entry.itadId);
        if (price) {
          deal = {
            itadId: entry.itadId,
            slug: entry.slug,
            currentPrice: price.current?.price.amount ?? null,
            regularPrice: price.current?.regular.amount ?? null,
            currency: price.current?.price.currency ?? price.lowest?.price.currency ?? null,
            cut: price.current?.cut ?? null,
            shopName: price.current?.shop.name ?? null,
            historicalLow: price.lowest?.price.amount ?? null,
            historicalLowShop: price.lowest?.shop.name ?? null,
            url: price.urls?.game ?? null,
          };
        }
      } else {
        deal = await cachedGetJson(
          `itad:lookup:${entry.title.trim().toLowerCase()}`,
          LOOKUP_TTL_MS,
          () => itad.getDealForGame({ title: entry.title })
        );
      }

      if (!deal) return;
      repo.upsertPrice({
        wishlistId: entry.id,
        itadId: deal.itadId,
        currentPrice: deal.currentPrice,
        regularPrice: deal.regularPrice,
        cutPercent: deal.cut,
        historicalLow: deal.historicalLow,
        historicalLowShop: deal.historicalLowShop,
        shopName: deal.shopName,
        currency: deal.currency,
        url: deal.url,
      });
      updated += 1;
      checkAlert(entry, deal, alerts);
    } catch {
      // item sem preço desta vez; respeita TTL na próxima tentativa
    }
  });

  return { attempted: entries.length, updated, noKey: false, alerts };
}

export async function searchItadGames(query: string): Promise<ITADSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const key = itadKey();
  if (!key) return [];

  const itad = new ITADAPI(key, itadCountry());
  const results = await cachedGetJson(`itad:search:${q.toLowerCase()}`, LOOKUP_TTL_MS, () =>
    itad.searchGames(q, 8)
  );
  return results.map((r) => ({ id: r.id, slug: r.slug, title: r.title, type: r.type }));
}

export async function importSteamWishlist(): Promise<SteamWishlistImportResult> {
  const steamKey = process.env.STEAM_API_KEY ?? getSetting('keys.steam') ?? '';
  const steamId = getSetting('steam.id') ?? '';

  if (!steamKey) {
    return { imported: 0, skipped: 0, error: 'STEAM_API_KEY não configurada' };
  }
  if (!steamId) {
    return { imported: 0, skipped: 0, error: 'Steam ID (steam64) não configurado em Configurações' };
  }

  const steam = new SteamAPI();
  const res = await steam.getWishlist(steamId, steamKey);
  if (res.error) return { imported: 0, skipped: 0, error: res.error };
  if (res.warning) return { imported: 0, skipped: 0, warning: res.warning };

  const key = itadKey();
  const itad = key ? new ITADAPI(key, itadCountry()) : null;
  const repo = getWishlistRepository();

  let imported = 0;
  let skipped = 0;

  for (const game of res.games) {
    try {
      let deal: Awaited<ReturnType<ITADAPI['getDealForGame']>> = null;
      if (itad) {
        deal = await cachedGetJson(`itad:steam-app:${game.appid}`, LOOKUP_TTL_MS, () =>
          itad.getDealForGame({ appid: game.appid })
        );
      }
      if (deal?.itadId && repo.has(deal.itadId)) {
        skipped += 1;
        continue;
      }
      const entry = repo.add({
        title: game.name,
        itadId: deal?.itadId ?? null,
        slug: deal?.slug ?? null,
        alertEnabled: true,
      });
      if (deal) {
        repo.upsertPrice({
          wishlistId: entry.id,
          itadId: deal.itadId,
          currentPrice: deal.currentPrice,
          regularPrice: deal.regularPrice,
          cutPercent: deal.cut,
          historicalLow: deal.historicalLow,
          historicalLowShop: deal.historicalLowShop,
          shopName: deal.shopName,
          currency: deal.currency,
          url: deal.url,
        });
      }
      imported += 1;
    } catch {
      skipped += 1;
    }
  }

  return { imported, skipped };
}
