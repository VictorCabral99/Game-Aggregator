import axios from 'axios';

const RAWG_API_BASE = 'https://api.rawg.io/api';

export interface RAWGGame {
  id: number;
  slug: string;
  name: string;
  released: string;
  tba: boolean;
  background_image: string;
  rating: number;
  rating_top: number;
  ratings_count: number;
  reviews_text_count: number;
  metacritic: number;
  playtime: number;
  suggestions_count: number;
  updated: string;
}

export interface RAWGSearchResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: RAWGGame[];
}

export class RAWGAPI {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async searchGames(query: string, page = 1): Promise<RAWGSearchResponse> {
    const response = await axios.get(`${RAWG_API_BASE}/games`, {
      params: {
        key: this.apiKey,
        search: query,
        page,
        page_size: 20,
      },
    });
    return response.data;
  }

  async getGameDetails(id: number): Promise<RAWGGame> {
    const response = await axios.get(`${RAWG_API_BASE}/games/${id}`, {
      params: {
        key: this.apiKey,
      },
    });
    return response.data;
  }

  async getGameBySlug(slug: string): Promise<RAWGGame> {
    const response = await axios.get(`${RAWG_API_BASE}/games/${slug}`, {
      params: {
        key: this.apiKey,
      },
    });
    return response.data;
  }
}
