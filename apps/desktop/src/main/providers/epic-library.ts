import { net } from 'electron';
import type { ProviderGame } from '@gagg/core';

const EPIC_CLIENT_ID =
  process.env.EPIC_CLIENT_ID || '34a02cf8f4414e29b15921876da36f9a';
const EPIC_CLIENT_SECRET =
  process.env.EPIC_CLIENT_SECRET || 'daafbccc737745039dffe53d94fc76cf';

const EPIC_TOKEN_URL =
  'https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token';
const EPIC_LIBRARY_URL =
  'https://library-service.live.use1a.on.epicgames.com/library/api/public/items';
const EPIC_CATALOG_HOST =
  'https://catalog-public-service-prod06.ol.epicgames.com';
const EPIC_UA =
  'UELauncher/11.0.1-14907503+++Portal+Release-Live Windows/10.0.19041.1.256.64bit';

function basicAuth(): string {
  return `Basic ${Buffer.from(`${EPIC_CLIENT_ID}:${EPIC_CLIENT_SECRET}`).toString('base64')}`;
}

function httpRequest(
  method: 'GET' | 'POST',
  url: string,
  opts?: { headers?: Record<string, string>; body?: string }
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = net.request({ method, url });
    for (const [k, v] of Object.entries(opts?.headers ?? {})) request.setHeader(k, v);
    let body = '';
    request.on('response', (res) => {
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    request.on('error', reject);
    if (opts?.body) request.write(opts.body);
    request.end();
  });
}

export function epicAuthUrl(): string {
  return `https://www.epicgames.com/id/api/redirect?clientId=${EPIC_CLIENT_ID}&responseType=code`;
}

export function epicLoginUrl(): string {
  const redirect = encodeURIComponent(epicAuthUrl());
  return `https://www.epicgames.com/id/login?redirectUrl=${redirect}&lang=en-US`;
}

export function extractEpicCode(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  if (value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value) as { authorizationCode?: string; code?: string };
      return String(parsed.authorizationCode || parsed.code || '');
    } catch {
      const m = value.match(/"authorizationCode"\s*:\s*"([^"]+)"/);
      return m?.[1] || '';
    }
  }
  try {
    if (value.includes('code=')) {
      const url = new URL(value.startsWith('http') ? value : `https://x/?${value}`);
      const fromQuery = url.searchParams.get('code') || url.searchParams.get('authorizationCode');
      if (fromQuery) return fromQuery;
    }
  } catch {
    // ignore
  }
  const m = value.match(/authorizationCode["']?\s*[:=]\s*["']?([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{20,}$/.test(value)) return value;
  return '';
}

export async function exchangeEpicAuthCode(code: string): Promise<{
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

  const res = await httpRequest('POST', EPIC_TOKEN_URL, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuth(),
      'User-Agent': EPIC_UA,
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  let data: any;
  try {
    data = JSON.parse(res.body);
  } catch {
    throw new Error(`Epic token: resposta inválida (${res.status})`);
  }
  if (res.status >= 400 || data?.errorCode) {
    throw new Error(
      `Epic token: ${data?.errorMessage || data?.errorCode || `HTTP ${res.status}`}`
    );
  }
  return data;
}

type CatalogInfo = {
  title: string;
  image?: string;
  appId?: string;
};

async function resolveTitles(
  accessToken: string,
  items: Array<{ namespace: string; catalogItemId: string }>
): Promise<Map<string, CatalogInfo>> {
  const byNamespace = new Map<string, string[]>();
  for (const item of items) {
    if (!item.namespace || !item.catalogItemId) continue;
    const list = byNamespace.get(item.namespace) || [];
    list.push(item.catalogItemId);
    byNamespace.set(item.namespace, list);
  }

  const titles = new Map<string, CatalogInfo>();
  const locale = process.env.EPIC_LOCALE || 'pt-BR';
  const country = process.env.EPIC_COUNTRY || 'BR';

  for (const [namespace, ids] of byNamespace) {
    if (namespace === 'ue') continue;
    for (let i = 0; i < ids.length; i += 40) {
      const chunk = ids.slice(i, i + 40);
      const qs = new URLSearchParams();
      for (const id of chunk) qs.append('id', id);
      qs.set('includeDLCDetails', 'false');
      qs.set('includeMainGameDetails', 'true');
      qs.set('country', country);
      qs.set('locale', locale);

      const url = `${EPIC_CATALOG_HOST}/catalog/api/shared/namespace/${namespace}/bulk/items?${qs}`;
      try {
        const res = await httpRequest('GET', url, {
          headers: {
            Authorization: `bearer ${accessToken}`,
            'User-Agent': EPIC_UA,
            Accept: 'application/json',
          },
        });
        if (res.status >= 400) continue;
        const data = JSON.parse(res.body) as Record<
          string,
          {
            title?: string;
            keyImages?: Array<{ type?: string; url?: string }>;
            releaseInfo?: Array<{ appId?: string; platform?: string[] }>;
          }
        >;
        for (const [catalogId, info] of Object.entries(data)) {
          if (!info?.title) continue;
          const image =
            info.keyImages?.find((img) => img.type === 'DieselGameBoxTall')?.url ||
            info.keyImages?.find((img) => img.type === 'DieselGameBox')?.url ||
            info.keyImages?.[0]?.url;
          const winRelease =
            info.releaseInfo?.find((r) =>
              (r.platform ?? []).some((p) => /win/i.test(p))
            ) ?? info.releaseInfo?.[0];
          titles.set(`${namespace}:${catalogId}`, {
            title: info.title,
            image,
            appId: winRelease?.appId,
          });
        }
      } catch {
        // ignore chunk
      }
    }
  }
  return titles;
}

/** Biblioteca owned Epic via Library Service (sem legendary.exe). */
export async function fetchEpicOwnedGames(accessToken: string): Promise<ProviderGame[]> {
  const records: Record<string, unknown>[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL(EPIC_LIBRARY_URL);
    url.searchParams.set('includeMetadata', 'true');
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await httpRequest('GET', url.toString(), {
      headers: {
        Authorization: `bearer ${accessToken}`,
        'User-Agent': EPIC_UA,
        Accept: 'application/json',
      },
    });
    if (res.status >= 400) {
      throw new Error(`Epic library HTTP ${res.status}: ${res.body.slice(0, 200)}`);
    }
    const data = JSON.parse(res.body);
    const batch = Array.isArray(data?.records) ? data.records : [];
    records.push(...batch);
    cursor = data?.responseMetadata?.nextCursor;
  } while (cursor);

  const usable = records.filter((item) => {
    if (item.sandboxType === 'PRIVATE') return false;
    if (item.namespace === 'ue') return false;
    return Boolean(item.catalogItemId && item.namespace);
  });

  const titleMap = await resolveTitles(
    accessToken,
    usable.map((item) => ({
      namespace: String(item.namespace),
      catalogItemId: String(item.catalogItemId),
    }))
  );

  const games: ProviderGame[] = [];
  for (const item of usable) {
    const namespace = String(item.namespace);
    const catalogItemId = String(item.catalogItemId);
    const resolved = titleMap.get(`${namespace}:${catalogItemId}`);
    const meta = (item.metadata || {}) as { title?: string; appName?: string };
    const title =
      resolved?.title || meta.title || (typeof item.title === 'string' ? item.title : '');
    if (!title || /^[0-9a-f]{32}$/i.test(title)) continue;
    const appId = resolved?.appId || meta.appName || catalogItemId;
    games.push({
      providerId: 'epic',
      externalId: catalogItemId,
      title,
      coverUrl: resolved?.image,
      raw: { namespace, catalogItemId, appId },
    });
  }

  return games.sort((a, b) => a.title.localeCompare(b.title));
}
