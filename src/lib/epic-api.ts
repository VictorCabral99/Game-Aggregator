import axios from 'axios';
import { EPIC_CLIENT_ID, EPIC_CLIENT_SECRET } from '@/lib/oauth-helpers';

// Legendary uses prod03 host + client_id/secret Basic auth
const EPIC_TOKEN_URL =
  'https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token';
const EPIC_LIBRARY_URL =
  'https://library-service.live.use1a.on.epicgames.com/library/api/public/items';
const EPIC_CATALOG_HOST =
  'https://catalog-public-service-prod06.ol.epicgames.com';

const EPIC_UA =
  'UELauncher/11.0.1-14907503+++Portal+Release-Live Windows/10.0.19041.1.256.64bit';

export interface EpicGame {
  id: string;
  title: string;
  namespace?: string;
  appName?: string;
  image?: string;
}

function basicAuthHeader() {
  return (
    'Basic ' +
    Buffer.from(`${EPIC_CLIENT_ID}:${EPIC_CLIENT_SECRET}`).toString('base64')
  );
}

function authHeaders(accessToken: string) {
  return {
    Authorization: `bearer ${accessToken}`,
    'User-Agent': EPIC_UA,
  };
}

export class EpicAPI {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  static async exchangeAuthCode(code: string): Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    account_id: string;
    displayName?: string;
  }> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code.trim(),
      token_type: 'eg1',
    });

    const response = await axios.post(EPIC_TOKEN_URL, body.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: basicAuthHeader(),
        'User-Agent': EPIC_UA,
      },
      validateStatus: () => true,
    });

    if (response.data?.errorCode || response.status >= 400) {
      const msg =
        response.data?.errorMessage ||
        response.data?.errorCode ||
        `HTTP ${response.status}`;
      throw new Error(`Epic token exchange failed: ${msg}`);
    }

    return response.data;
  }

  static async refresh(refreshToken: string) {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      token_type: 'eg1',
    });

    const response = await axios.post(EPIC_TOKEN_URL, body.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: basicAuthHeader(),
        'User-Agent': EPIC_UA,
      },
      validateStatus: () => true,
    });

    if (response.data?.errorCode || response.status >= 400) {
      throw new Error(
        response.data?.errorMessage ||
          response.data?.errorCode ||
          'Epic refresh failed'
      );
    }

    return response.data;
  }

  private async fetchLibraryRecords(): Promise<Record<string, unknown>[]> {
    const records: Record<string, unknown>[] = [];
    let cursor: string | undefined;

    do {
      const response = await axios.get(EPIC_LIBRARY_URL, {
        headers: authHeaders(this.accessToken),
        params: {
          includeMetadata: true,
          ...(cursor ? { cursor } : {}),
        },
      });

      const batch = response.data?.records || [];
      records.push(...batch);
      cursor = response.data?.responseMetadata?.nextCursor;
    } while (cursor);

    return records;
  }

  /** Resolve catalogItemId → title via Legendary-style catalog bulk endpoint */
  private async resolveTitles(
    items: Array<{ namespace: string; catalogItemId: string }>
  ): Promise<Map<string, { title: string; image?: string }>> {
    const byNamespace = new Map<string, string[]>();
    for (const item of items) {
      if (!item.namespace || !item.catalogItemId) continue;
      const list = byNamespace.get(item.namespace) || [];
      list.push(item.catalogItemId);
      byNamespace.set(item.namespace, list);
    }

    const titles = new Map<string, { title: string; image?: string }>();
    const locale = process.env.EPIC_LOCALE || 'pt-BR';
    const country = process.env.EPIC_COUNTRY || 'BR';

    for (const [namespace, ids] of Array.from(byNamespace)) {
      // Skip Unreal Engine assets
      if (namespace === 'ue') continue;

      for (let i = 0; i < ids.length; i += 40) {
        const chunk = ids.slice(i, i + 40);

        try {
          const qs = new URLSearchParams();
          for (const id of chunk) qs.append('id', id);
          qs.set('includeDLCDetails', 'false');
          qs.set('includeMainGameDetails', 'true');
          qs.set('country', country);
          qs.set('locale', locale);

          const response = await axios.get(
            `${EPIC_CATALOG_HOST}/catalog/api/shared/namespace/${namespace}/bulk/items?${qs.toString()}`,
            {
              headers: authHeaders(this.accessToken),
              validateStatus: () => true,
            }
          );

          if (response.status >= 400 || !response.data) continue;

          for (const [catalogId, info] of Object.entries(response.data)) {
            const meta = info as {
              title?: string;
              keyImages?: Array<{ type?: string; url?: string }>;
            };
            if (!meta?.title) continue;
            const image =
              meta.keyImages?.find((img) => img.type === 'DieselGameBoxTall')
                ?.url ||
              meta.keyImages?.find((img) => img.type === 'DieselGameBox')
                ?.url ||
              meta.keyImages?.[0]?.url;
            titles.set(`${namespace}:${catalogId}`, {
              title: meta.title,
              image,
            });
          }
        } catch (error) {
          console.error(`Epic catalog resolve error (${namespace}):`, error);
        }
      }
    }

    return titles;
  }

  async getOwnedGames(): Promise<EpicGame[]> {
    try {
      const records = await this.fetchLibraryRecords();

      const usable = records.filter((item) => {
        if (item.sandboxType === 'PRIVATE') return false;
        if (item.namespace === 'ue') return false;
        return Boolean(item.catalogItemId && item.namespace);
      });

      const titleMap = await this.resolveTitles(
        usable.map((item) => ({
          namespace: String(item.namespace),
          catalogItemId: String(item.catalogItemId),
        }))
      );

      return usable
        .map((item) => {
          const namespace = String(item.namespace);
          const catalogItemId = String(item.catalogItemId);
          const key = `${namespace}:${catalogItemId}`;
          const resolved = titleMap.get(key);
          const meta = (item.metadata || {}) as { title?: string };
          const title =
            resolved?.title ||
            meta.title ||
            (typeof item.title === 'string' ? item.title : null);

          // Skip entries we still only know as opaque ids
          if (!title || /^[0-9a-f]{32}$/i.test(title)) {
            return null;
          }

          return {
            id: catalogItemId,
            title,
            namespace,
            appName: item.appName ? String(item.appName) : undefined,
            image: resolved?.image,
          } satisfies EpicGame;
        })
        .filter((g): g is EpicGame => g !== null);
    } catch (error) {
      console.error('Epic library error:', error);
      return [];
    }
  }

  async getWishlist(): Promise<EpicGame[]> {
    return [];
  }
}
