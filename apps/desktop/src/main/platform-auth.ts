import { BrowserWindow, ipcMain, net } from 'electron';
import { URLSearchParams } from 'node:url';
import { getAuthRepository, getSetting, setSetting } from './db';
import { getCurrentUserId } from './auth';
import type { PlatformAccount, PlatformOAuthStartResult } from '../shared/api';
import {
  epicLoginUrl,
  exchangeEpicAuthCode,
  extractEpicCode,
} from './providers/epic-library';
import {
  extractAmazonAuthCode,
  registerAmazonDevice,
  startAmazonNileLogin,
} from './providers/amazon-library';

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
    // Galaxy público (mesmo do Heroic/gogdl) — redirect NÃO é localhost
    authUrl: 'https://auth.gog.com/auth',
    tokenUrl: 'https://auth.gog.com/token',
    userInfoUrl: 'https://embed.gog.com/userData.json',
    clientId: process.env.GOG_CLIENT_ID || '46899977096215655',
    clientSecret:
      process.env.GOG_CLIENT_SECRET ||
      '9d85c43b1482497dbbce61f6e4aa173a433796eeae2ca8c5f6129f2dc4de46d9',
    redirectUri: 'https://embed.gog.com/on_login_success?origin=client',
    scope: '',
    extraAuthParams: {
      layout: 'client2',
    },
    extractUserId: (data: { userId?: string | number; user_id?: string | number }) =>
      String(data.userId ?? data.user_id ?? ''),
    extractDisplayName: (data: { username?: string; login?: string }) =>
      data.username || data.login || 'GOG User',
    extractMetadata: (data: any) => data,
  },
  // Epic/Amazon usam fluxos dedicados (Legendary redirect + Nile device-auth)
  epic: {
    platform: 'epic',
    authUrl: '',
    tokenUrl: '',
    userInfoUrl: '',
    clientId: process.env.EPIC_CLIENT_ID || '34a02cf8f4414e29b15921876da36f9a',
    clientSecret: process.env.EPIC_CLIENT_SECRET || 'daafbccc737745039dffe53d94fc76cf',
    redirectUri: '',
    scope: '',
    extractUserId: () => '',
    extractDisplayName: () => '',
    extractMetadata: () => ({}),
  },
  amazon: {
    platform: 'amazon',
    authUrl: '',
    tokenUrl: '',
    userInfoUrl: '',
    clientId: '',
    clientSecret: '',
    redirectUri: '',
    scope: '',
    extractUserId: () => '',
    extractDisplayName: () => '',
    extractMetadata: () => ({}),
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
    state,
    ...(config.extraAuthParams ?? {}),
  });
  if (config.scope.trim()) params.set('scope', config.scope);
  return `${config.authUrl}?${params.toString()}`;
}

function isOAuthCallback(config: PlatformOAuthConfig, url: string): boolean {
  if (config.platform === 'gog') {
    return url.startsWith('https://embed.gog.com/on_login_success');
  }
  return url.startsWith(config.redirectUri);
}

async function exchangeCodeForTokens(config: PlatformOAuthConfig, code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  user_id?: string;
}> {
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
  });

  // GOG Galaxy (gogdl/Heroic) usa GET no token endpoint
  if (config.platform === 'gog') {
    return new Promise((resolve, reject) => {
      const request = net.request({
        method: 'GET',
        url: `${config.tokenUrl}?${params.toString()}`,
      });
      request.setHeader('Accept', 'application/json');
      request.setHeader('User-Agent', 'gagg/1.0 (Game Aggregator)');
      let body = '';
      request.on('response', (res) => {
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.error) reject(new Error(data.error_description || data.error));
            else resolve(data);
          } catch {
            reject(new Error(`Resposta inválida do GOG token endpoint: ${body.slice(0, 200)}`));
          }
        });
      });
      request.on('error', reject);
      request.end();
    });
  }

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

async function syncAfterConnect(platform: 'steam' | 'gog' | 'epic' | 'amazon'): Promise<void> {
  try {
    const { syncAfterPlatformConnect } = await import('./ipc/providers');
    await syncAfterPlatformConnect(platform);
  } catch (syncErr) {
    console.warn(`[${platform}] sync após connect falhou:`, syncErr);
  }
}

function openAuthWindow(title: string): BrowserWindow {
  return new BrowserWindow({
    width: 520,
    height: 720,
    title,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
}

/** Fecha a janela sem disparar "Conexão cancelada" no handler `closed`. */
function closeAuthWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  win.removeAllListeners('closed');
  win.close();
}

/** Epic: Legendary redirect — página JSON com authorizationCode (sem localhost). */
function connectEpic(): Promise<PlatformAccount> {
  const userId = requireUserId();
  const authUrl = epicLoginUrl();

  return new Promise((resolve, reject) => {
    const authWindow = openAuthWindow('Conectar Epic Games');
    let settled = false;
    let handling = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const tryCapture = async (url: string) => {
      if (handling || settled) return;
      const isRedirectApi = /epicgames\.com\/id\/api\/redirect/i.test(url);
      if (!isRedirectApi) return;
      handling = true;
      try {
        let code = extractEpicCode(url);
        if (!code && !authWindow.isDestroyed()) {
          for (let i = 0; i < 8 && !code; i += 1) {
            if (i > 0) await new Promise((r) => setTimeout(r, 250));
            if (authWindow.isDestroyed()) break;
            const text = await authWindow.webContents.executeJavaScript(
              'document.body ? (document.body.innerText || document.body.textContent || "") : ""'
            );
            code = extractEpicCode(String(text || ''));
          }
        }
        if (!code) {
          handling = false;
          return;
        }

        const tokens = await exchangeEpicAuthCode(code);
        if (!tokens.account_id || !tokens.access_token) {
          throw new Error('Epic: resposta de token incompleta');
        }

        const account = getAuthRepository().upsertPlatformAccount({
          userId,
          platform: 'epic',
          externalUserId: tokens.account_id,
          displayName: tokens.displayName || tokens.account_id,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt: tokens.expires_in
            ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
            : undefined,
          metadata: { legendary: true },
        });

        finish(() => resolve(account));
        closeAuthWindow(authWindow);
        await syncAfterConnect('epic');
      } catch (err) {
        closeAuthWindow(authWindow);
        finish(() => reject(err instanceof Error ? err : new Error(String(err))));
      }
    };

    authWindow.webContents.on('did-finish-load', () => {
      const url = authWindow.webContents.getURL();
      void tryCapture(url);
    });
    authWindow.webContents.on('did-navigate', (_e, url) => void tryCapture(url));
    authWindow.webContents.on('did-redirect-navigation', (_e, url) => void tryCapture(url));
    authWindow.webContents.on('will-redirect', (_e, url) => void tryCapture(url));

    authWindow.on('closed', () => {
      finish(() => reject(new Error('Conexão cancelada')));
    });

    void authWindow.loadURL(authUrl);
  });
}

/** Amazon: Nile device-auth + PKCE (sem AMAZON_CLIENT_ID). */
function connectAmazon(): Promise<PlatformAccount> {
  const userId = requireUserId();
  const login = startAmazonNileLogin();

  return new Promise((resolve, reject) => {
    const authWindow = openAuthWindow('Conectar Amazon Games');
    let settled = false;
    let handling = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const tryCapture = async (url: string) => {
      if (handling || settled) return;
      if (!/openid\.oa2\.authorization_code=|authorization_code=/i.test(url)) return;
      handling = true;
      try {
        const code = extractAmazonAuthCode(url);
        if (!code) throw new Error('Amazon: authorization_code não encontrado na URL');

        const tokens = await registerAmazonDevice({
          code,
          clientId: login.clientId,
          codeVerifier: login.codeVerifier,
          serial: login.serial,
        });
        if (!tokens.access_token || !tokens.account_id) {
          throw new Error('Amazon: resposta de registro incompleta');
        }

        const account = getAuthRepository().upsertPlatformAccount({
          userId,
          platform: 'amazon',
          externalUserId: tokens.account_id,
          displayName: tokens.displayName || tokens.account_id,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt: tokens.expires_in
            ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
            : undefined,
          metadata: {
            nile: true,
            clientId: tokens.clientId,
            serial: tokens.serial,
          },
        });

        finish(() => resolve(account));
        closeAuthWindow(authWindow);
        await syncAfterConnect('amazon');
      } catch (err) {
        closeAuthWindow(authWindow);
        finish(() => reject(err instanceof Error ? err : new Error(String(err))));
      }
    };

    authWindow.webContents.on('will-redirect', (event, url) => {
      if (/openid\.oa2\.authorization_code=/i.test(url)) {
        event.preventDefault();
        void tryCapture(url);
      }
    });
    authWindow.webContents.on('will-navigate', (event, url) => {
      if (/openid\.oa2\.authorization_code=/i.test(url)) {
        event.preventDefault();
        void tryCapture(url);
      }
    });
    authWindow.webContents.on('did-navigate', (_e, url) => void tryCapture(url));
    authWindow.webContents.on('did-redirect-navigation', (_e, url) => void tryCapture(url));

    authWindow.on('closed', () => {
      finish(() => reject(new Error('Conexão cancelada')));
    });

    void authWindow.loadURL(login.authUrl);
  });
}

/** Abre janela OAuth da loja, captura redirect e grava platform_accounts. */
export function connectPlatform(
  platform: 'steam' | 'gog' | 'epic' | 'amazon'
): Promise<PlatformAccount> {
  if (platform === 'epic') return connectEpic();
  if (platform === 'amazon') return connectAmazon();

  const config = PLATFORM_CONFIGS[platform];
  if (platform === 'gog' && (!config.clientId || !config.clientSecret)) {
    return Promise.reject(new Error('GOG_CLIENT_ID/SECRET não configurados'));
  }

  const userId = requireUserId();
  const state = generateState();
  const authUrl = buildAuthUrl(config, state);

  return new Promise((resolve, reject) => {
    pendingStates.set(state, { resolve, reject });

    const authWindow = openAuthWindow(
      `Conectar ${platform.charAt(0).toUpperCase() + platform.slice(1)}`
    );

    let settled = false;
    let handling = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      pendingStates.delete(state);
      fn();
    };

    const handleRedirect = async (url: string) => {
      if (!isOAuthCallback(config, url) || handling || settled) return;
      handling = true;
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
          const code = urlObj.searchParams.toString();
          account = await finishPlatformAuth(userId, platform, code, state);
        } else {
          const code = urlObj.searchParams.get('code');
          if (!code) throw new Error('Código de autorização não recebido');
          account = await finishPlatformAuth(userId, platform, code, state);
        }

        finish(() => resolve(account));
        closeAuthWindow(authWindow);
        await syncAfterConnect(platform);
      } catch (err) {
        closeAuthWindow(authWindow);
        finish(() => reject(err instanceof Error ? err : new Error(String(err))));
      }
    };

    const onMaybeCallback = (url: string) => {
      if (isOAuthCallback(config, url)) void handleRedirect(url);
    };

    authWindow.webContents.on('will-redirect', (event, url) => {
      if (isOAuthCallback(config, url)) {
        event.preventDefault();
        void handleRedirect(url);
      }
    });
    authWindow.webContents.on('will-navigate', (event, url) => {
      if (isOAuthCallback(config, url)) {
        event.preventDefault();
        void handleRedirect(url);
      }
    });
    authWindow.webContents.on('did-navigate', (_event, url) => onMaybeCallback(url));
    authWindow.webContents.on('did-redirect-navigation', (_event, url) => onMaybeCallback(url));

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
    accessToken = tokens.access_token;
    refreshToken = tokens.refresh_token;
    expiresIn = tokens.expires_in;

    let userData: Record<string, unknown> = {};
    try {
      userData = await fetchUserInfo(config, tokens.access_token);
    } catch {
      // GOG: o token já traz user_id; userData.json às vezes falha
      userData = {};
    }
    if (tokens.user_id && !config.extractUserId(userData)) {
      userData = { ...userData, user_id: tokens.user_id };
    }

    result = {
      externalUserId: config.extractUserId(userData) || String(tokens.user_id ?? ''),
      displayName: config.extractDisplayName(userData) || platform.toUpperCase(),
      metadata: config.extractMetadata(userData),
    };
    if (!result.externalUserId) {
      throw new Error(`${platform}: não foi possível obter o ID do usuário`);
    }
  }

  const tokenExpiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : undefined;

  const account = repo.upsertPlatformAccount({
    userId,
    platform: platform as 'steam' | 'gog' | 'epic' | 'amazon',
    externalUserId: result.externalUserId,
    displayName: result.displayName,
    accessToken,
    refreshToken,
    tokenExpiresAt,
    metadata: result.metadata,
  });

  // Mantém steam.id alinhado à conta OAuth (wishlist/import usavam só o setting).
  if (platform === 'steam' && result.externalUserId) {
    setSetting('steam.id', result.externalUserId);
  }

  return account;
}

export function registerPlatformAuthHandlers(): void {
  ipcMain.handle(
    'auth:get-platform-auth-url',
    async (_event, platform: 'steam' | 'gog' | 'epic' | 'amazon'): Promise<PlatformOAuthStartResult> => {
      if (platform === 'epic') {
        return { authUrl: epicLoginUrl(), state: generateState(), platform };
      }
      if (platform === 'amazon') {
        const login = startAmazonNileLogin();
        return { authUrl: login.authUrl, state: login.state, platform };
      }
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