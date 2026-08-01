import axios from 'axios';

const GOG_EMBED_BASE = 'https://embed.gog.com';
const GOG_AUTH_BASE = 'https://auth.gog.com';

export interface GogGame {
  id: number;
  title: string;
  slug?: string;
  image?: string;
  url?: string;
}

export class GogAPI {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
      'User-Agent': 'GameAggregator/0.1',
    };
  }

  static async refreshAccessToken(refreshToken: string): Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  }> {
    const clientId = process.env.GOG_CLIENT_ID;
    const clientSecret = process.env.GOG_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('GOG_CLIENT_ID and GOG_CLIENT_SECRET are required to refresh tokens');
    }

    const response = await axios.get(`${GOG_AUTH_BASE}/token`, {
      params: {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      },
    });
    return response.data;
  }

  async getUserData(): Promise<{ userId: string; username: string }> {
    const response = await axios.get(`${GOG_EMBED_BASE}/userData.json`, {
      headers: this.headers,
    });
    return {
      userId: String(response.data.userId || response.data.galaxyUserId),
      username: response.data.username || response.data.email || 'GOG User',
    };
  }

  async getOwnedGames(): Promise<GogGame[]> {
    const games: GogGame[] = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const response = await axios.get(
        `${GOG_EMBED_BASE}/account/getFilteredProducts`,
        {
          headers: this.headers,
          params: {
            mediaType: 1,
            page,
            sortBy: 'title',
          },
        }
      );

      totalPages = response.data.totalPages || 1;
      const products = response.data.products || [];

      for (const product of products) {
        games.push({
          id: product.id,
          title: product.title,
          slug: product.slug,
          image: product.image || product.img,
          url: product.url,
        });
      }

      page += 1;
      if (page > 50) break;
    }

    return games;
  }

  async getWishlist(): Promise<GogGame[]> {
    try {
      const response = await axios.get(`${GOG_EMBED_BASE}/user/wishlist.json`, {
        headers: this.headers,
      });

      const wishlist = response.data?.wishlist || response.data || {};
      const games: GogGame[] = [];

      if (Array.isArray(wishlist)) {
        for (const item of wishlist) {
          games.push({
            id: item.id || item.productId,
            title: item.title || item.name || `GOG ${item.id}`,
            slug: item.slug,
            image: item.image,
            url: item.url,
          });
        }
        return games;
      }

      for (const [id, item] of Object.entries(wishlist as Record<string, any>)) {
        if (item === true || item === 1) {
          games.push({
            id: Number(id),
            title: `GOG ${id}`,
          });
        } else if (item && typeof item === 'object') {
          games.push({
            id: Number(id) || item.id,
            title: item.title || item.name || `GOG ${id}`,
            slug: item.slug,
            image: item.image,
            url: item.url,
          });
        }
      }

      return games;
    } catch (error) {
      console.error('GOG wishlist fetch error:', error);
      return [];
    }
  }
}
