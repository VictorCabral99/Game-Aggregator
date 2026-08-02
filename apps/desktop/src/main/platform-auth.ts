import { BrowserWindow, ipcMain, net } from 'electron';
import { URLSearchParams } from 'node:url';
import { getAuthRepository, getSetting } from './db';
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
    clientId: process.env.GOG_CLIENT_ID ?? '',
    clientSecret: process.env.GOG_CLIENT_SECRET ?? '',
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
    clientId: process.env.EPIC_CLIENT_ID ?? '',
    clientSecret: process.env.EPIC_CLIENT_SECRET ?? '',
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
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scope,
    state,
    ...config.extraAuthParams,
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
const pendingStates = new Map<string, { resolve: (v: PlatformOAuthStartResult) => void; reject: (e: Error) => void }>();
const callbackStates = new Map<string, string>(); // state -> platform

function startPlatformAuth(platform: 'steam' | 'gog' | 'epic' | 'amazon'): Promise<PlatformOAuthStartResult> {
  const config = PLATFORM_CONFIGS[platform];
  if (!config.clientId || !config.clientSecret) {
    if (platform !== 'steam') { // Steam não precisa de client secret
      return Promise.reject(new Error(`${platform.toUpperCase()}_CLIENT_ID/SECRET não configurados`));
    }
  }

  const state = generateState();
  const authUrl = buildAuthUrl(config, state);

  callbackStates.set(state, platform);

  return new Promise((resolve, reject) => {
    pendingStates.set(state, { resolve, reject });

    const authWindow = new BrowserWindow({
      width: 500,
      height: 650,
      title: `Conectar ${platform.charAt(0).toUpperCase() + platform.slice(1)}`,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    authWindow.loadURL(authUrl);

    authWindow.webContents.on('will-redirect', async (event, url) => {
      const config = PLATFORM_CONFIGS[platform];
      if (url.startsWith(config.redirectUri)) {
        event.preventDefault();
        try {
          const urlObj = new URL(url);
          const code = urlObj.searchParams.get('code');
          const returnedState = urlObj.searchParams.get('state');
          const error = urlObj.searchParams.get('error');

          if (error) throw new Error(`${platform}: ${error}`);

          if (!returnedState) throw new Error('State OAuth não recebido');

          const pending = pendingStates.get(returnedState);
          if (!pending) throw new Error('State expirado ou inválido');
          if (returnedState !== state) throw new Error('State OAuth inválido');

          // Steam tem fluxo especial (OpenID)
          let result: { externalUserId: string; displayName: string; metadata: Record<string, unknown> };
          if (platform === 'steam') {
            result = await handleSteamCallback(urlObj.searchParams);
          } else {
            if (!code) throw new Error('Código de autorização não recebido');
            const tokens = await exchangeCodeForTokens(config, code);
            const userData = await fetchUserInfo(config, tokens.access_token);
            result = {
              externalUserId: config.extractUserId(userData),
              displayName: config.extractDisplayName(userData),
              metadata: {
                ...config.extractMetadata(userData),
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                expiresIn: tokens.expires_in,
              },
            };
          }

          authWindow.close();
          pendingStates.delete(state);
          callbackStates.delete(state);

          resolve({
            authUrl: '', // já abriu
            state,
            platform,
          });

          // O callback real será feito via auth:platform-callback IPC
          // Aqui apenas fechamos a janela e retornamos sucesso do start
        } catch (err) {
          authWindow.close();
          pendingStates.delete(state);
          callbackStates.delete(state);
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      }
    });

    authWindow.on('closed', () => {
      const pending = pendingStates.get(state);
      if (pending) {
        pendingStates.delete(state);
        callbackStates.delete(state);
        pending.reject(new Error('Login cancelado'));
      }
    });
  });
}

async function finishPlatformAuth(userId: string, platform: string, code: string, state: string): Promise<PlatformAccount> {
  const config = PLATFORM_CONFIGS[platform as 'steam' | 'gog' | 'epic' | 'amazon'];
  if (!config) throw new Error(`Plataforma desconhecida: ${platform}`);

  const repo = getAuthRepository();

  let result: { externalUserId: string; displayName: string; metadata: Record<string, unknown> };
  let accessToken: string | undefined;
  let refreshToken: string | undefined;
  let expiresIn: number | undefined;

  if (platform === 'steam') {
    // Para Steam, o code contém os params OpenID
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
    metadata: {
      ...result.metadata,
      accessToken: undefined, // não salva token bruto no metadata
      refreshToken: undefined,
    },
  });
}

export function registerPlatformAuthHandlers(): void {
  ipcMain.handle('auth:get-platform-auth-url', async (_event, platform: 'steam' | 'gog' | 'epic' | 'amazon') => {
    // Retorna URL para abrir no browser - o renderer vai abrir a janela
    const config = PLATFORM_CONFIGS[platform];
    const state = generateState();
    callbackStates.set(state, platform);
    const authUrl = buildAuthUrl(config, state);
    return { authUrl, state, platform };
  });

  ipcMain.handle('auth:platform-callback', async (_event, params: { platform: string; code: string; state: string }) => {
    // Precisa do userId - por enquanto usa o primeiro usuário logado
    const repo = getAuthRepository();
    // TODO: pegar user da sessão real
    const userId = repo.getFirstUserId();
    if (!userId) throw new Error('Faça login com Google primeiro');

    return finishPlatformAuth(userId, params.platform, params.code, params.state);
  });

  ipcMain.handle('auth:list-platform-accounts', async () => {
    const repo = getAuthRepository();
    // TODO: pegar user da sessão real
    const userId = repo.getFirstUserId();
    if (!userId) return [];
    return repo.listPlatformAccounts(userId);
  });

  ipcMain.handle('auth:unlink-platform', async (_event, platform: string) => {
    const repo = getAuthRepository();
    // TODO: pegar user da sessão real
    const userId = repo.getFirstUserId();
    if (!userId) throw new Error('Usuário não logado');
    repo.removePlatformAccount(userId, platform);
    return { ok: true };
  });
}