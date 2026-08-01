import axios from 'axios';

const METACRITIC_API_BASE = 'https://backend.metacritic.com';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

export interface MetacriticGame {
  id: string;
  title: string;
  description: string;
  releaseDate: string;
  score: number;
  platform: string;
  genre: string[];
  developer: string[];
  publisher: string[];
  image: string;
}

export interface MetacriticReview {
  score: number;
  publication: string;
  author: string;
  quote: string;
  date: string;
}

export class MetacriticAPI {
  async searchGames(query: string): Promise<MetacriticGame[]> {
    try {
      const response = await axios.get(
        `${METACRITIC_API_BASE}/v1/catalog/search`,
        {
          headers: HEADERS,
          params: {
            term: query,
            mediaType: 'game',
          },
        }
      );
      return response.data.data || [];
    } catch (error) {
      console.error('Metacritic search error:', error);
      return [];
    }
  }

  async getGameDetails(slug: string, platform = 'pc'): Promise<MetacriticGame | null> {
    try {
      const response = await axios.get(
        `${METACRITIC_API_BASE}/v1/catalog/game/${slug}/platform/${platform}`,
        {
          headers: HEADERS,
        }
      );
      return response.data;
    } catch (error) {
      console.error('Metacritic game details error:', error);
      return null;
    }
  }

  async getReviews(slug: string, platform = 'pc'): Promise<MetacriticReview[]> {
    try {
      const response = await axios.get(
        `${METACRITIC_API_BASE}/v1/catalog/game/${slug}/platform/${platform}/critic-reviews`,
        {
          headers: HEADERS,
        }
      );
      return response.data.data || [];
    } catch (error) {
      console.error('Metacritic reviews error:', error);
      return [];
    }
  }
}
