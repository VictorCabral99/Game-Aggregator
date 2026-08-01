import axios from 'axios';

const LUNA_API_BASE = 'https://luna.amazon.com';

const HEADERS = {
  'Content-Type': 'text/plain;charset=UTF-8',
  'Origin': 'https://luna.amazon.com',
  'Referer': 'https://luna.amazon.com/',
  'x-amz-locale': 'en_US',
  'x-amz-platform': 'web',
  'x-amz-device-type': 'browser',
  'x-amz-marketplace-id': 'ATVPDKIKX0DER',
  'Accept-Language': 'en-US',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
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

export class LunaAPI {
  async getPrimeGames(): Promise<LunaGame[]> {
    try {
      // Endpoint não-oficial baseado em workflows de automação
      const response = await axios.get(
        `${LUNA_API_BASE}/api/prime-games`,
        { headers: HEADERS }
      );
      
      // Parse da resposta - estrutura pode variar
      const games = this.parseLunaResponse(response.data);
      return games;
    } catch (error) {
      console.error('Luna API error:', error);
      return [];
    }
  }

  async getClaimableGames(): Promise<LunaGame[]> {
    try {
      const response = await axios.get(
        `${LUNA_API_BASE}/api/claimable-games`,
        { headers: HEADERS }
      );
      
      const games = this.parseLunaResponse(response.data);
      return games.filter(game => game.isClaimable);
    } catch (error) {
      console.error('Luna claimable games error:', error);
      return [];
    }
  }

  private parseLunaResponse(data: any): LunaGame[] {
    // Implementação baseada na estrutura típica de resposta do Luna
    // A estrutura exata pode variar, então isso é uma implementação genérica
    if (!data || !Array.isArray(data.games)) {
      return [];
    }

    return data.games.map((game: any) => ({
      id: game.id || game.gameId,
      title: game.title || game.name,
      description: game.description || '',
      imageUrl: game.imageUrl || game.image || game.artwork,
      provider: game.provider || 'amazon-luna',
      isClaimable: game.isClaimable || false,
      isPlayableWithPrime: game.isPlayableWithPrime || game.withPrime || false,
      releaseDate: game.releaseDate,
      developer: game.developer,
      publisher: game.publisher,
      genre: game.genre || game.genres,
      metascore: game.metascore || game.metacritic,
    }));
  }

  // Método alternativo usando o Apify Actor se a API direta falhar
  async getGamesViaApify(): Promise<LunaGame[]> {
    try {
      const response = await axios.post(
        'https://api.apify.com/v2/acts/nintendo424~amazon-luna-free-games-monitor/run-sync-get-dataset-items',
        {},
        {
          params: {
            token: process.env.APIFY_TOKEN, // Opcional
          },
        }
      );
      
      return response.data.map((item: any) => ({
        id: item.id || item.dedupeKey,
        title: item.title,
        description: item.description || '',
        imageUrl: item.imageUrl,
        provider: item.provider,
        isClaimable: item.isClaimable,
        isPlayableWithPrime: item.isPlayableWithPrime,
        releaseDate: item.releaseDate,
        developer: item.developer,
        publisher: item.publisher,
        genre: item.genre,
        metascore: item.metascore,
      }));
    } catch (error) {
      console.error('Apify Luna error:', error);
      return [];
    }
  }
}
