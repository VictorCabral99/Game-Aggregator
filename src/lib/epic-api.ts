/**
 * Epic Games Store client (best-effort / unofficial).
 * Full library sync typically requires OAuth device flow + GraphQL.
 */

export interface EpicGame {
  id: string;
  title: string;
  namespace?: string;
  image?: string;
}

export class EpicAPI {
  private accessToken?: string;

  constructor(accessToken?: string) {
    this.accessToken = accessToken;
  }

  async getOwnedGames(): Promise<EpicGame[]> {
    if (!this.accessToken) {
      return [];
    }

    // Placeholder: Epic library GraphQL requires authenticated launcher tokens.
    // Returns empty until OAuth device flow is wired.
    console.warn('EpicAPI.getOwnedGames: not fully implemented yet');
    return [];
  }

  async getWishlist(): Promise<EpicGame[]> {
    if (!this.accessToken) {
      return [];
    }

    console.warn('EpicAPI.getWishlist: not fully implemented yet');
    return [];
  }
}
