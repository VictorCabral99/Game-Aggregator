import { createHash, randomBytes } from 'node:crypto';
import { net } from 'electron';
import type { ProviderGame } from '@gagg/core';
import { amazonCoverUrlFromProduct } from './amazon-covers';

/**
 * Amazon Games — Nile / Heroic device-auth (sem Login with Amazon developer app).
 */

const AMAZON_API = 'https://api.amazon.com';
const AMAZON_ENTITLEMENTS =
  'https://gaming.amazon.com/api/distribution/entitlements';
const DEVICE_TYPE = 'A2UMVHOX7UP4V7';
const MARKETPLACE_ID = 'ATVPDKIKX0DER';
const KEY_ID = 'd5dc8b8b-86c8-4fc4-ae93-18c0def5314d';
const UA = 'com.amazon.agslauncher.win/3.0.9202.1';

export interface AmazonNileLoginStart {
  authUrl: string;
  clientId: string;
  codeVerifier: string;
  serial: string;
  state: string;
}

export interface AmazonNileTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  account_id: string;
  displayName?: string;
  serial: string;
  clientId: string;
}

function b64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
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

export function startAmazonNileLogin(): AmazonNileLoginStart {
  const serial = randomBytes(16).toString('hex').toUpperCase();
  const clientId = Buffer.from(`${serial}#${DEVICE_TYPE}`, 'ascii').toString('hex');
  const codeVerifier = b64url(randomBytes(32));
  const codeChallenge = b64url(createHash('sha256').update(codeVerifier).digest());
  const state = b64url(randomBytes(16));

  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.mode': 'checkid_setup',
    'openid.oa2.scope': 'device_auth_access',
    'openid.ns.oa2': 'http://www.amazon.com/ap/ext/oauth/2',
    'openid.oa2.response_type': 'code',
    'openid.oa2.code_challenge_method': 'S256',
    'openid.oa2.client_id': `device:${clientId}`,
    language: 'en_US',
    marketPlaceId: MARKETPLACE_ID,
    'openid.return_to': 'https://www.amazon.com',
    'openid.pape.max_auth_age': '0',
    'openid.assoc_handle': 'amzn_sonic_games_launcher',
    pageId: 'amzn_sonic_games_launcher',
    'openid.oa2.code_challenge': codeChallenge,
  });

  return {
    authUrl: `https://www.amazon.com/ap/signin?${params.toString()}`,
    clientId,
    codeVerifier,
    serial,
    state,
  };
}

export function extractAmazonAuthCode(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  try {
    const url = new URL(value.startsWith('http') ? value : `https://www.amazon.com/?${value}`);
    const fromQuery = url.searchParams.get('openid.oa2.authorization_code');
    if (fromQuery) return fromQuery;
  } catch {
    // fall through
  }
  const m = value.match(/openid\.oa2\.authorization_code=([^&\s#]+)/);
  if (m) return decodeURIComponent(m[1]);
  const m2 = value.match(/authorization_code=([^&\s#]+)/);
  if (m2) return decodeURIComponent(m2[1]);
  if (/^[A-Za-z0-9._~-]{10,}$/.test(value)) return value;
  return '';
}

export async function registerAmazonDevice(opts: {
  code: string;
  clientId: string;
  codeVerifier: string;
  serial: string;
}): Promise<AmazonNileTokens> {
  const payload = {
    auth_data: {
      authorization_code: opts.code.trim(),
      client_domain: 'DeviceLegacy',
      client_id: opts.clientId,
      code_algorithm: 'SHA-256',
      code_verifier: opts.codeVerifier,
      use_global_authentication: false,
    },
    registration_data: {
      app_name: 'AGSLauncher for Windows',
      app_version: '1.0.0',
      device_model: 'Windows',
      device_name: null,
      device_serial: opts.serial,
      device_type: DEVICE_TYPE,
      domain: 'Device',
      os_version: '10.0.19044.0',
    },
    requested_extensions: ['customer_info', 'device_info'],
    requested_token_type: ['bearer', 'mac_dms'],
    user_context_map: {},
  };

  const res = await httpRequest('POST', `${AMAZON_API}/auth/register`, {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': UA,
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  let data: any;
  try {
    data = JSON.parse(res.body);
  } catch {
    throw new Error(`Amazon register: resposta inválida (${res.status})`);
  }
  if (res.status >= 400 || !data?.response?.success) {
    const msg =
      data?.response?.error?.message || data?.message || `HTTP ${res.status}`;
    throw new Error(`Amazon device register failed: ${msg}`);
  }

  const success = data.response.success;
  const bearer = success.tokens?.bearer || {};
  const customer = success.extensions?.customer_info || {};
  const device = success.extensions?.device_info || {};

  return {
    access_token: bearer.access_token,
    refresh_token: bearer.refresh_token,
    expires_in: bearer.expires_in ? Number(bearer.expires_in) : undefined,
    account_id: String(customer.user_id || ''),
    displayName: customer.given_name || customer.name || undefined,
    serial: String(device.device_serial_number || opts.serial),
    clientId: opts.clientId,
  };
}

/** Biblioteca Amazon Games via entitlements (sem nile.exe). */
export async function fetchAmazonOwnedGames(
  accessToken: string,
  serial: string
): Promise<ProviderGame[]> {
  if (!serial) return [];

  const games: ProviderGame[] = [];
  let nextToken: string | undefined;
  const hardwareHash = createHash('sha256').update(serial).digest('hex').toUpperCase();

  do {
    const body = {
      Operation: 'GetEntitlements',
      clientId: 'Sonic',
      syncPoint: null,
      nextToken: nextToken || null,
      maxResults: 50,
      productIdFilter: null,
      keyId: KEY_ID,
      hardwareHash,
    };

    const res = await httpRequest('POST', AMAZON_ENTITLEMENTS, {
      headers: {
        'X-Amz-Target':
          'com.amazon.animusdistributionservice.entitlement.AnimusEntitlementsService.GetEntitlements',
        'x-amzn-token': accessToken,
        'Content-Type': 'application/json',
        'Content-Encoding': 'amz-1.0',
        'User-Agent': UA,
      },
      body: JSON.stringify(body),
    });

    if (res.status >= 400) {
      throw new Error(`Amazon library failed (HTTP ${res.status}). Reconecte a Amazon.`);
    }

    const data = JSON.parse(res.body);
    const entitlements = Array.isArray(data?.entitlements) ? data.entitlements : [];
    for (const item of entitlements) {
      const product = item.product || {};
      const id = String(product.id || item.id || '');
      const title = String(product.title || product.productTitle || item.title || '');
      if (!id || !title) continue;
      games.push({
        providerId: 'amazon',
        externalId: id,
        title,
        coverUrl: amazonCoverUrlFromProduct(product as Record<string, unknown>),
      });
    }
    nextToken = data?.nextToken;
  } while (nextToken);

  const byId = new Map<string, ProviderGame>();
  for (const g of games) byId.set(g.externalId, g);
  return Array.from(byId.values()).sort((a, b) => a.title.localeCompare(b.title));
}
