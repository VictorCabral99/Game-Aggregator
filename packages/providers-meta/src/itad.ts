/**
 * Cliente IsThereAnyDeal (preços, descontos e histórico) — fetch puro,
 * sem dependências. Mesma API v1/v2 usada no agregador web.
 */

const ITAD_API_BASE = 'https://api.isthereanydeal.com';

export interface ITADGame {
  id: string;
  slug: string;
  title: string;
  type: string;
  mature: boolean;
}

export interface ITADPriceAmount {
  amount: number;
  amountInt: number;
  currency: string;
}

export interface ITADShop {
  id: number;
  name: string;
}

export interface ITADCurrentDeal {
  shop: ITADShop;
  price: ITADPriceAmount;
  regular: ITADPriceAmount;
  cut: number;
  voucher: string | null;
  url: string;
}

export interface ITADLowestPrice {
  shop: ITADShop;
  price: ITADPriceAmount;
  regular: ITADPriceAmount;
  cut: number;
  timestamp: string;
}

export interface ITADPriceOverview {
  id: string;
  current: ITADCurrentDeal | null;
  lowest: ITADLowestPrice | null;
  bundled: number;
  urls: {
    game: string;
  };
}

export interface ITADOverviewResponse {
  prices: ITADPriceOverview[];
  bundles: unknown[];
}

/** Visão normalizada de preço para uma entrada da wishlist. */
export interface ITADDealInfo {
  itadId: string;
  slug: string | null;
  currentPrice: number | null;
  regularPrice: number | null;
  currency: string | null;
  cut: number | null;
  shopName: string | null;
  historicalLow: number | null;
  historicalLowShop: string | null;
  url: string | null;
}

async function getJson<T>(url: string, headers: Record<string, string>, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (res.status === 401 || res.status === 403) {
      throw new Error('ITAD_API_KEY inválida ou expirada — gere outra em https://isthereanydeal.com/apps/');
    }
    if (!res.ok) {
      let reason = `HTTP ${res.status}`;
      try {
        const data = (await res.json()) as { reason_phrase?: string };
        if (data?.reason_phrase) reason = data.reason_phrase;
      } catch {
        // corpo não-JSON
      }
      throw new Error(`ITAD: ${reason}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export class ITADAPI {
  private apiKey: string;
  private country: string;

  constructor(apiKey: string, country = 'BR') {
    this.apiKey = apiKey;
    this.country = country;
  }

  private get headers(): Record<string, string> {
    return {
      'ITAD-API-Key': this.apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  async lookupByAppId(appid: number | string): Promise<ITADGame | null> {
    const params = new URLSearchParams({ appid: String(appid) });
    const data = await getJson<{ found: boolean; game?: ITADGame }>(
      `${ITAD_API_BASE}/games/lookup/v1?${params.toString()}`,
      this.headers
    );
    return data.found && data.game ? data.game : null;
  }

  async lookupByTitle(title: string): Promise<ITADGame | null> {
    const params = new URLSearchParams({ title });
    const data = await getJson<{ found: boolean; game?: ITADGame }>(
      `${ITAD_API_BASE}/games/lookup/v1?${params.toString()}`,
      this.headers
    );
    return data.found && data.game ? data.game : null;
  }

  async searchGames(title: string, results = 5): Promise<ITADGame[]> {
    const params = new URLSearchParams({ title, results: String(results) });
    return getJson<ITADGame[]>(`${ITAD_API_BASE}/games/search/v1?${params.toString()}`, this.headers);
  }

  async getOverview(gameIds: string[]): Promise<ITADOverviewResponse> {
    if (gameIds.length === 0) return { prices: [], bundles: [] };
    const params = new URLSearchParams({ country: this.country });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(`${ITAD_API_BASE}/games/overview/v2?${params.toString()}`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(gameIds),
        signal: controller.signal,
      });
      if (res.status === 401 || res.status === 403) {
        throw new Error('ITAD_API_KEY inválida ou expirada — gere outra em https://isthereanydeal.com/apps/');
      }
      if (!res.ok) throw new Error(`ITAD overview: HTTP ${res.status}`);
      return (await res.json()) as ITADOverviewResponse;
    } finally {
      clearTimeout(timer);
    }
  }

  async getDealForGame(options: { appid?: number | string; title?: string }): Promise<ITADDealInfo | null> {
    let game: ITADGame | null = null;

    if (options.appid !== undefined && options.appid !== '') {
      game = await this.lookupByAppId(options.appid);
    }

    if (!game && options.title) {
      game = await this.lookupByTitle(options.title);
      if (!game) {
        const results = await this.searchGames(options.title, 5);
        game = results.find((item) => item.type === 'game') || results[0] || null;
      }
    }

    if (!game) return null;

    const overview = await this.getOverview([game.id]);
    const price = overview.prices.find((item) => item.id === game.id);
    const fallbackUrl = `https://isthereanydeal.com/game/${game.slug}/info/`;

    if (!price) {
      return {
        itadId: game.id,
        slug: game.slug,
        currentPrice: null,
        regularPrice: null,
        currency: null,
        cut: null,
        shopName: null,
        historicalLow: null,
        historicalLowShop: null,
        url: fallbackUrl,
      };
    }

    return {
      itadId: game.id,
      slug: game.slug,
      currentPrice: price.current?.price.amount ?? null,
      regularPrice: price.current?.regular.amount ?? null,
      currency: price.current?.price.currency ?? price.lowest?.price.currency ?? null,
      cut: price.current?.cut ?? null,
      shopName: price.current?.shop.name ?? null,
      historicalLow: price.lowest?.price.amount ?? null,
      historicalLowShop: price.lowest?.shop.name ?? null,
      url: price.urls?.game || fallbackUrl,
    };
  }
}
