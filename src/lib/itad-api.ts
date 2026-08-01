import axios from 'axios';

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

export interface GameDealInfo {
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

export class ITADAPI {
  private apiKey: string;
  private country: string;

  constructor(apiKey: string, country = 'BR') {
    this.apiKey = apiKey;
    this.country = country;
  }

  private get headers() {
    return {
      'ITAD-API-Key': this.apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  async lookupByAppId(appid: number): Promise<ITADGame | null> {
    const response = await axios.get(`${ITAD_API_BASE}/games/lookup/v1`, {
      headers: this.headers,
      params: { appid },
    });

    if (!response.data?.found || !response.data?.game) {
      return null;
    }

    return response.data.game as ITADGame;
  }

  async lookupByTitle(title: string): Promise<ITADGame | null> {
    const response = await axios.get(`${ITAD_API_BASE}/games/lookup/v1`, {
      headers: this.headers,
      params: { title },
    });

    if (!response.data?.found || !response.data?.game) {
      return null;
    }

    return response.data.game as ITADGame;
  }

  async searchGames(title: string, results = 5): Promise<ITADGame[]> {
    const response = await axios.get(`${ITAD_API_BASE}/games/search/v1`, {
      headers: this.headers,
      params: { title, results },
    });

    return (response.data || []) as ITADGame[];
  }

  async getOverview(gameIds: string[]): Promise<ITADOverviewResponse> {
    if (gameIds.length === 0) {
      return { prices: [], bundles: [] };
    }

    const response = await axios.post(
      `${ITAD_API_BASE}/games/overview/v2`,
      gameIds,
      {
        headers: this.headers,
        params: { country: this.country },
      }
    );

    return response.data as ITADOverviewResponse;
  }

  async getDealForGame(options: {
    appid?: number | string;
    title?: string;
  }): Promise<GameDealInfo | null> {
    let game: ITADGame | null = null;

    if (options.appid !== undefined && options.appid !== '') {
      const appid =
        typeof options.appid === 'string'
          ? parseInt(options.appid, 10)
          : options.appid;

      if (!Number.isNaN(appid)) {
        game = await this.lookupByAppId(appid);
      }
    }

    if (!game && options.title) {
      game = await this.lookupByTitle(options.title);

      if (!game) {
        const results = await this.searchGames(options.title, 5);
        game = results.find((item) => item.type === 'game') || results[0] || null;
      }
    }

    if (!game) {
      return null;
    }

    const overview = await this.getOverview([game.id]);
    const price = overview.prices.find((item) => item.id === game!.id);

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
        url: `https://isthereanydeal.com/game/${game.slug}/info/`,
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
      url:
        price.urls?.game ||
        `https://isthereanydeal.com/game/${game.slug}/info/`,
    };
  }
}
