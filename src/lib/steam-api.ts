import axios from 'axios';

const STEAM_API_BASE = 'https://api.steampowered.com';

export interface SteamGame {
  appid: number;
  name: string;
  playtime_forever: number;
  img_icon_url: string;
  img_logo_url: string;
  has_community_visible_stats?: boolean;
}

export interface SteamOwnedGamesResponse {
  response: {
    game_count: number;
    games: SteamGame[];
  };
}

export class SteamAPI {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async getOwnedGames(steamId: string): Promise<SteamOwnedGamesResponse> {
    const response = await axios.get(
      `${STEAM_API_BASE}/IPlayerService/GetOwnedGames/v0001/`,
      {
        params: {
          key: this.apiKey,
          steamid: steamId,
          include_appinfo: true,
          include_played_free_games: true,
        },
      }
    );
    return response.data;
  }

  async getPlayerSummaries(steamIds: string[]) {
    const response = await axios.get(
      `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v0002/`,
      {
        params: {
          key: this.apiKey,
          steamids: steamIds.join(','),
        },
      }
    );
    return response.data;
  }

  async resolveVanityUrl(vanityUrl: string) {
    const response = await axios.get(
      `${STEAM_API_BASE}/ISteamUser/ResolveVanityURL/v0001/`,
      {
        params: {
          key: this.apiKey,
          vanityurl: vanityUrl,
        },
      }
    );
    return response.data;
  }
}
