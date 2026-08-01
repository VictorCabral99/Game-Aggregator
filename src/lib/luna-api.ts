import axios from 'axios';

const LUNA_API_BASE = 'https://luna.amazon.com';

const HEADERS = {
  'Content-Type': 'text/plain;charset=UTF-8',
  Origin: 'https://luna.amazon.com',
  Referer: 'https://luna.amazon.com/',
  'x-amz-locale': 'en_US',
  'x-amz-platform': 'web',
  'x-amz-device-type': 'browser',
  'x-amz-marketplace-id': 'ATVPDKIKX0DER',
  'Accept-Language': 'en_US',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
};

export interface LunaGame {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  provider: string;
  isClaimable: boolean;
  isPlayableWithPrime: boolean;
  releaseDate?: string;
  developer?: string;
  publisher?: string;
  genre?: string[];
  metascore?: number;
}

/**
 * Amazon Luna client (best-effort / unofficial).
 * Library and wishlist for a linked user account are not publicly available yet.
 */
export class LunaAPI {
  private accessToken?: string;

  constructor(accessToken?: string) {
    this.accessToken = accessToken;
  }

  async getOwnedGames(): Promise<LunaGame[]> {
    if (!this.accessToken) return [];
    console.warn('LunaAPI.getOwnedGames: user library not available yet');
    return [];
  }

  async getWishlist(): Promise<LunaGame[]> {
    if (!this.accessToken) return [];
    console.warn('LunaAPI.getWishlist: user wishlist not available yet');
    return [];
  }

  async getPrimeGames(): Promise<LunaGame[]> {
    try {
      const response = await axios.get(`${LUNA_API_BASE}/api/prime-games`, {
        headers: HEADERS,
      });
      return this.parseLunaResponse(response.data);
    } catch (error) {
      console.error('Luna API error:', error);
      return [];
    }
  }

  async getClaimableGames(): Promise<LunaGame[]> {
    try {
      const response = await axios.get(`${LUNA_API_BASE}/api/claimable-games`, {
        headers: HEADERS,
      });
      return this.parseLunaResponse(response.data).filter((g) => g.isClaimable);
    } catch (error) {
      console.error('Luna claimable games error:', error);
      return [];
    }
  }

  private parseLunaResponse(data: unknown): LunaGame[] {
    const payload = data as { games?: Record<string, unknown>[] };
    if (!payload?.games || !Array.isArray(payload.games)) {
      return [];
    }

    return payload.games.map((game) => ({
      id: String(game.id || game.gameId || ''),
      title: String(game.title || game.name || ''),
      description: String(game.description || ''),
      imageUrl: String(game.imageUrl || game.image || game.artwork || ''),
      provider: String(game.provider || 'amazon-luna'),
      isClaimable: Boolean(game.isClaimable),
      isPlayableWithPrime: Boolean(
        game.isPlayableWithPrime || game.withPrime
      ),
      releaseDate: game.releaseDate as string | undefined,
      developer: game.developer as string | undefined,
      publisher: game.publisher as string | undefined,
      genre: (game.genre || game.genres) as string[] | undefined,
      metascore: (game.metascore || game.metacritic) as number | undefined,
    }));
  }
}
