import { createHash, randomBytes } from 'crypto';
import axios from 'axios';
import { amazonCoverUrlFromProduct } from './amazon-covers';

/**
 * Amazon Games client — Nile / Heroic device-auth flow.
 * No Login with Amazon developer app required.
 */

const AMAZON_API = 'https://api.amazon.com';
const AMAZON_ENTITLEMENTS =
  'https://gaming.amazon.com/api/distribution/entitlements';
const DEVICE_TYPE = 'A2UMVHOX7UP4V7';
const MARKETPLACE_ID = 'ATVPDKIKX0DER';
const KEY_ID = 'd5dc8b8b-86c8-4fc4-ae93-18c0def5314d';
const UA = 'com.amazon.agslauncher.win/3.0.9202.1';

export interface AmazonGame {
  id: string;
  title: string;
  productId?: string;
  image?: string;
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

export interface AmazonNileLoginStart {
  authUrl: string;
  clientId: string;
  codeVerifier: string;
  serial: string;
  state: string;
}

function b64url(buf: Buffer) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export class AmazonAPI {
  private accessToken: string;
  private serial: string;

  constructor(accessToken: string, serial?: string) {
    this.accessToken = accessToken;
    this.serial = serial || '';
  }

  /** Start Nile-style device login (PKCE + Sonic launcher). */
  static startNileLogin(): AmazonNileLoginStart {
    const serial = randomBytes(16).toString('hex').toUpperCase();
    const clientId = Buffer.from(`${serial}#${DEVICE_TYPE}`, 'ascii').toString(
      'hex'
    );
    const codeVerifier = b64url(randomBytes(32));
    const codeChallenge = b64url(
      createHash('sha256').update(codeVerifier).digest()
    );
    const state = b64url(randomBytes(16));

    const params = new URLSearchParams({
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.claimed_id':
        'http://specs.openid.net/auth/2.0/identifier_select',
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

  static extractAuthCode(raw: string): string {
    const value = raw.trim();
    if (!value) return '';

    try {
      const url = new URL(
        value.startsWith('http') ? value : `https://www.amazon.com/?${value}`
      );
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

  static async registerDevice(opts: {
    code: string;
    clientId: string;
    codeVerifier: string;
    serial: string;
  }): Promise<AmazonNileTokens> {
    const body = {
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

    const response = await axios.post(`${AMAZON_API}/auth/register`, body, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': UA,
        Accept: 'application/json',
      },
      validateStatus: () => true,
    });

    if (response.status >= 400 || !response.data?.response?.success) {
      const msg =
        response.data?.response?.error?.message ||
        response.data?.message ||
        `HTTP ${response.status}`;
      throw new Error(`Amazon device register failed: ${msg}`);
    }

    const success = response.data.response.success;
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

  static async refresh(refreshToken: string) {
    const response = await axios.post(
      `${AMAZON_API}/auth/token`,
      {
        source_token: refreshToken,
        source_token_type: 'refresh_token',
        requested_token_type: 'access_token',
        app_name: 'AGSLauncher for Windows',
        app_version: '1.0.0',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': UA,
        },
        validateStatus: () => true,
      }
    );

    if (response.status >= 400 || !response.data?.access_token) {
      throw new Error(
        response.data?.message ||
          response.data?.error_description ||
          'Amazon token refresh failed'
      );
    }

    return response.data as {
      access_token: string;
      expires_in?: number;
      refresh_token?: string;
    };
  }

  async getOwnedGames(): Promise<AmazonGame[]> {
    if (!this.serial) {
      console.warn('AmazonAPI.getOwnedGames: missing device serial');
      return [];
    }

    const games: AmazonGame[] = [];
    let nextToken: string | undefined;
    const hardwareHash = createHash('sha256')
      .update(this.serial)
      .digest('hex')
      .toUpperCase();

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

      const response = await axios.post(AMAZON_ENTITLEMENTS, body, {
        headers: {
          'X-Amz-Target':
            'com.amazon.animusdistributionservice.entitlement.AnimusEntitlementsService.GetEntitlements',
          'x-amzn-token': this.accessToken,
          'Content-Type': 'application/json',
          'Content-Encoding': 'amz-1.0',
          'User-Agent': UA,
        },
        validateStatus: () => true,
      });

      if (response.status >= 400) {
        console.error(
          'Amazon GetEntitlements error:',
          response.status,
          typeof response.data === 'object'
            ? JSON.stringify(response.data).slice(0, 400)
            : response.data
        );
        throw new Error(
          `Amazon library failed (HTTP ${response.status}). Reconecte a Amazon.`
        );
      }

      const entitlements = response.data?.entitlements || [];
      for (const item of entitlements) {
        const product = item.product || {};
        const id = String(product.id || item.id || '');
        const title = String(
          product.title || product.productTitle || item.title || ''
        );
        if (!id || !title) continue;
        games.push({
          id,
          title,
          productId: id,
          image: amazonCoverUrlFromProduct(product),
        });
      }

      nextToken = response.data?.nextToken;
    } while (nextToken);

    // de-dupe by id
    const byId = new Map<string, AmazonGame>();
    for (const g of games) byId.set(g.id, g);
    return Array.from(byId.values());
  }

  async getWishlist(): Promise<AmazonGame[]> {
    return [];
  }
}
