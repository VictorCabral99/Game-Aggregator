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
    const { GOG_PUBLIC_CLIENT_ID, GOG_PUBLIC_CLIENT_SECRET } = await import(
      '@/lib/oauth-helpers'
    );

    const response = await axios.get(`${GOG_AUTH_BASE}/token`, {
      params: {
        client_id: GOG_PUBLIC_CLIENT_ID,
        client_secret: GOG_PUBLIC_CLIENT_SECRET,
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
    const response = await axios.get(`${GOG_EMBED_BASE}/user/wishlist.json`, {
      headers: this.headers,
      validateStatus: () => true,
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error('GOG wishlist: token inválido ou expirado');
    }
    if (response.status >= 400) {
      throw new Error(`GOG wishlist: erro HTTP ${response.status}`);
    }

    const wishlist = response.data?.wishlist || response.data || {};
    const games: GogGame[] = [];

    if (Array.isArray(wishlist)) {
      for (const item of wishlist) {
        games.push({
          id: Number(item.id || item.productId),
          title: item.title || item.name || `GOG ${item.id}`,
          slug: item.slug,
          image: item.image,
          url: item.url,
        });
      }
    } else {
      for (const [id, item] of Object.entries(wishlist as Record<string, any>)) {
        if (item === true || item === 1) {
          games.push({
            id: Number(id),
            title: `GOG ${id}`,
          });
        } else if (item && typeof item === 'object') {
          games.push({
            id: Number(id) || Number(item.id),
            title: item.title || item.name || `GOG ${id}`,
            slug: item.slug,
            image: item.image,
            url: item.url,
          });
        }
      }
    }

    // Enrich placeholder titles via public products API
    const needEnrich = games.filter(
      (g) => !g.title || /^GOG \d+$/i.test(g.title)
    );
    for (let i = 0; i < needEnrich.length; i += 6) {
      const chunk = needEnrich.slice(i, i + 6);
      await Promise.all(
        chunk.map(async (game) => {
          try {
            const detail = await axios.get(
              `https://api.gog.com/products/${game.id}`,
              {
                timeout: 10000,
                validateStatus: () => true,
                headers: { Accept: 'application/json' },
              }
            );
            if (detail.status === 200 && detail.data?.title) {
              game.title = detail.data.title;
              if (detail.data.slug) game.slug = detail.data.slug;
              if (detail.data.image) game.image = detail.data.image;
              if (!game.url && detail.data.slug) {
                game.url = `https://www.gog.com/game/${detail.data.slug}`;
              }
            }
          } catch {
            // keep placeholder
          }
        })
      );
      if (i + 6 < needEnrich.length) {
        await new Promise((r) => setTimeout(r, 120));
      }
    }

    return games;
  }
}
