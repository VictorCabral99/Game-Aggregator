import { BrowserWindow, ipcMain, net } from 'electron';
import { URLSearchParams } from 'node:url';
import { getAuthRepository, getSetting } from './db';
import { getCurrentUserId } from './auth';
import type { PlatformAccount, PlatformOAuthStartResult } from '../shared/api';

// ---- Constantes por plataforma ----

interface PlatformOAuthConfig {
  platform: 'steam' | 'gog' | 'epic' | 'amazon';
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
  extraAuthParams?: Record<string, string>;
  extractUserId: (data: any) => string;
  extractDisplayName: (data: any) => string;
  extractMetadata: (data: any) => Record<string, unknown>;
}

const PLATFORM_CONFIGS: Record<'steam' | 'gog' | 'epic' | 'amazon', PlatformOAuthConfig> = {
  steam: {
    platform: 'steam',
    authUrl: 'https://steamcommunity.com/openid/login',
    tokenUrl: '', // Steam OpenID não usa token endpoint tradicional
    userInfoUrl: '',
    clientId: '',
    clientSecret: '',
    redirectUri: 'http://localhost:3000/auth/callback/steam',
    scope: '',
    extraAuthParams: {
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'checkid_setup',
      'openid.return_to': 'http://localhost:3000/auth/callback/steam',
      'openid.realm': 'http://localhost:3000',
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
    },
    extractUserId: (data: { claimed_id?: string }) => {
      const match = data.claimed_id?.match(/\/(\d{17})$/);
      return match?.[1] || '';
    },
    extractDisplayName: () => 'Steam User',
    extractMetadata: () => ({}),
  },
  gog: {
    platform: 'gog',
    authUrl: 'https://auth.gog.com/authorization',
    tokenUrl: 'https://auth.gog.com/token',
    userInfoUrl: 'https://api.gog.com/v1/user',
    clientId: process.env.GOG_CLIENT_ID || '46899977096215655',
    clientSecret:
      process.env.GOG_CLIENT_SECRET ||
      '9d85c43b1482497dbbce61f6e4aa173b4338ee1714063636b9f1ac651a6d45f6',
    redirectUri: 'http://localhost:3000/auth/callback/gog',
    scope: 'profile:read',
    extractUserId: (data: { userId?: string }) => String(data.userId || ''),
    extractDisplayName: (data: { username?: string }) => data.username || '',
    extractMetadata: (data: any) => data,
  },
  epic: {
    platform: 'epic',
    authUrl: 'https://www.epicgames.com/id/authorize',
    tokenUrl: 'https://api.epicgames.dev/epic/oauth/v1/token',
    userInfoUrl: 'https://api.epicgames.dev/epic/id/v1/accounts/me',
    clientId: process.env.EPIC_CLIENT_ID || '34a02cf8f4414e29b15921876da36f9a',
    clientSecret: process.env.EPIC_CLIENT_SECRET || 'daafbccc737745039dffe53d94fc76cf',
    redirectUri: 'http://localhost:3000/auth/callback/epic',
    scope: 'basic_profile',
    extractUserId: (data: { account_id?: string }) => data.account_id || '',
    extractDisplayName: (data: { displayName?: string }) => data.displayName || '',
    extractMetadata: (data: any) => data,
  },
  amazon: {
    platform: 'amazon',
    authUrl: 'https://www.amazon.com/ap/oa',
    tokenUrl: 'https://api.amazon.com/auth/o2/token',
    userInfoUrl: 'https://api.amazon.com/user/profile',
    clientId: process.env.AMAZON_CLIENT_ID ?? '',
    clientSecret: process.env.AMAZON_CLIENT_SECRET ?? '',
    redirectUri: 'http://localhost:3000/auth/callback/amazon',
    scope: 'profile',
    extractUserId: (data: { user_id?: string }) => data.user_id || '',
    extractDisplayName: (data: { name?: string }) => data.name || '',
    extractMetadata: (data: any) => data,
  },
};

function generateState(): string {
  return crypto.randomUUID();
}

function buildAuthUrl(config: PlatformOAuthConfig, state: string): string {
  if (config.platform === 'steam') {
    const returnTo = `${config.redirectUri}?state=${encodeURIComponent(state)}`;
    const params = new URLSearchParams({
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'checkid_setup',
      'openid.return_to': returnTo,
      'openid.realm': 'http://localhost:3000',
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
    });
    return `${config.authUrl}?${params.toString()}`;
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scope,
    state,
    ...(config.extraAuthParams ?? {}),
  });
  return `${config.authUrl}?${params.toString()}`;
}

async function exchangeCodeForTokens(config: PlatformOAuthConfig, code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}> {
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
  });

  return new Promise((resolve, reject) => {
    const request = net.request({
      method: 'POST',
      url: config.tokenUrl,
    });
    request.setHeader('Content-Type', 'application/x-www-form-urlencoded');
    request.setHeader('Accept', 'application/json');

    let body = '';
    request.on('response', (res) => {
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.error) reject(new Error(data.error_description || data.error));
          else resolve(data);
        } catch {
          reject(new Error(`Resposta inválida do ${config.platform} token endpoint`));
        }
      });
    });
    request.on('error', reject);
    request.write(params.toString());
    request.end();
  });
}

async function fetchUserInfo(config: PlatformOAuthConfig, accessToken: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = net.request({
      method: 'GET',
      url: config.userInfoUrl,
    });
    request.setHeader('Authorization', `Bearer ${accessToken}`);
    request.setHeader('Accept', 'application/json');

    let body = '';
    request.on('response', (res) => {
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve(data);
        } catch {
          reject(new Error(`Resposta inválida do ${config.platform} userinfo`));
        }
      });
    });
    request.on('error', reject);
    request.end();
  });
}

// Steam usa OpenID - fluxo especial
async function handleSteamCallback(params: URLSearchParams): Promise<{
  externalUserId: string;
  displayName: string;
  metadata: Record<string, unknown>;
}> {
  // Valida resposta OpenID
  const claimedId = params.get('openid.claimed_id');
  if (!claimedId) throw new Error('Steam OpenID: claimed_id não recebido');

  const match = claimedId.match(/\/(\d{17})$/);
  const steamId = match?.[1];
  if (!steamId) throw new Error('Steam ID não encontrado no claimed_id');

  // Tenta buscar persona via Steam Web API se tiver key
  const steamKey = process.env.STEAM_API_KEY ?? getSetting('keys.steam') ?? '';
  let displayName = 'Steam User';
  let avatar = '';

  if (steamKey) {
    try {
      const userData = await new Promise<any>((resolve, reject) => {
        const request = net.request({
          method: 'GET',
          url: `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${steamKey}&steamids=${steamId}`,
        });
        request.setHeader('Accept', 'application/json');
        let body = '';
        request.on('response', (res) => {
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try { resolve(JSON.parse(body)); } catch { reject(new Error('JSON inválido')); }
          });
        });
        request.on('error', reject);
        request.end();
      });
      const player = userData?.response?.players?.[0];
      if (player) {
        displayName = player.personaname || displayName;
        avatar = player.avatarfull || '';
      }
    } catch {
      // ignora erro de API
    }
  }

  return {
    externalUserId: steamId,
    displayName,
    metadata: { steamId, avatar },
  };
}

// Estado pendente por plataforma
const pendingStates = new Map<
  string,
  { resolve: (v: PlatformAccount) => void; reject: (e: Error) => void }
>();

function requireUserId(): string {
  const fromSession = getCurrentUserId();
  if (fromSession) return fromSession;
  const fallback = getAuthRepository().getFirstUserId();
  if (!fallback) throw new Error('Faça login com Google primeiro');
  return fallback;
}

/** Abre janela OAuth da loja, captura redirect e grava platform_accounts. */
export function connectPlatform(
  platform: 'steam' | 'gog' | 'epic' | 'amazon'
): Promise<PlatformAccount> {
  const config = PLATFORM_CONFIGS[platform];
  if (platform !== 'steam' && (!config.clientId || !config.clientSecret)) {
    return Promise.reject(
      new Error(`${platform.toUpperCase()}_CLIENT_ID/SECRET não configurados`)
    );
  }

  const userId = requireUserId();
  const state = generateState();
  const authUrl = buildAuthUrl(config, state);

  return new Promise((resolve, reject) => {
    pendingStates.set(state, { resolve, reject });

    const authWindow = new BrowserWindow({
      width: 520,
      height: 720,
      title: `Conectar ${platform.charAt(0).toUpperCase() + platform.slice(1)}`,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      pendingStates.delete(state);
      fn();
    };

    const handleRedirect = async (url: string) => {
      if (!url.startsWith(config.redirectUri)) return;
      try {
        const urlObj = new URL(url);
        const error = urlObj.searchParams.get('error');
        if (error) throw new Error(`${platform}: ${error}`);

        const returnedState = urlObj.searchParams.get('state');
        if (returnedState && returnedState !== state) {
          throw new Error('State OAuth inválido');
        }

        let account: PlatformAccount;
        if (platform === 'steam') {
          // OpenID devolve params na query; serializa para finishPlatformAuth
          const code = urlObj.searchParams.toString();
          account = await finishPlatformAuth(userId, platform, code, state);
        } else {
          const code = urlObj.searchParams.get('code');
          if (!code) throw new Error('Código de autorização não recebido');
          account = await finishPlatformAuth(userId, platform, code, state);
        }

        if (!authWindow.isDestroyed()) authWindow.close();
        finish(() => resolve(account));
      } catch (err) {
        if (!authWindow.isDestroyed()) authWindow.close();
        finish(() => reject(err instanceof Error ? err : new Error(String(err))));
      }
    };

    authWindow.webContents.on('will-redirect', (event, url) => {
      if (url.startsWith(config.redirectUri)) {
        event.preventDefault();
        void handleRedirect(url);
      }
    });
    authWindow.webContents.on('will-navigate', (event, url) => {
      if (url.startsWith(config.redirectUri)) {
        event.preventDefault();
        void handleRedirect(url);
      }
    });

    authWindow.on('closed', () => {
      finish(() => reject(new Error('Conexão cancelada')));
    });

    void authWindow.loadURL(authUrl);
  });
}

async function finishPlatformAuth(
  userId: string,
  platform: string,
  code: string,
  _state: string
): Promise<PlatformAccount> {
  const config = PLATFORM_CONFIGS[platform as 'steam' | 'gog' | 'epic' | 'amazon'];
  if (!config) throw new Error(`Plataforma desconhecida: ${platform}`);

  const repo = getAuthRepository();

  let result: { externalUserId: string; displayName: string; metadata: Record<string, unknown> };
  let accessToken: string | undefined;
  let refreshToken: string | undefined;
  let expiresIn: number | undefined;

  if (platform === 'steam') {
    const params = new URLSearchParams(code);
    result = await handleSteamCallback(params);
  } else {
    const tokens = await exchangeCodeForTokens(config, code);
    const userData = await fetchUserInfo(config, tokens.access_token);
    result = {
      externalUserId: config.extractUserId(userData),
      displayName: config.extractDisplayName(userData),
      metadata: config.extractMetadata(userData),
    };
    accessToken = tokens.access_token;
    refreshToken = tokens.refresh_token;
    expiresIn = tokens.expires_in;
  }

  const tokenExpiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : undefined;

  return repo.upsertPlatformAccount({
    userId,
    platform: platform as 'steam' | 'gog' | 'epic' | 'amazon',
    externalUserId: result.externalUserId,
    displayName: result.displayName,
    accessToken,
    refreshToken,
    tokenExpiresAt,
    metadata: result.metadata,
  });
}

export function registerPlatformAuthHandlers(): void {
  ipcMain.handle(
    'auth:get-platform-auth-url',
    async (_event, platform: 'steam' | 'gog' | 'epic' | 'amazon'): Promise<PlatformOAuthStartResult> => {
      const config = PLATFORM_CONFIGS[platform];
      const state = generateState();
      return { authUrl: buildAuthUrl(config, state), state, platform };
    }
  );

  ipcMain.handle(
    'auth:connect-platform',
    async (_event, platform: 'steam' | 'gog' | 'epic' | 'amazon') => connectPlatform(platform)
  );

  ipcMain.handle(
    'auth:platform-callback',
    async (_event, params: { platform: string; code: string; state: string }) => {
      const userId = requireUserId();
      return finishPlatformAuth(userId, params.platform, params.code, params.state);
    }
  );

  ipcMain.handle('auth:list-platform-accounts', async () => {
    try {
      const userId = requireUserId();
      return getAuthRepository().listPlatformAccounts(userId);
    } catch {
      return [];
    }
  });

  ipcMain.handle('auth:unlink-platform', async (_event, platform: string) => {
    const userId = requireUserId();
    getAuthRepository().removePlatformAccount(userId, platform);
    return { ok: true };
  });
}