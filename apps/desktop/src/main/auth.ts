import { BrowserWindow, ipcMain, net } from 'electron';
import { URLSearchParams } from 'node:url';
import { getAuthRepository, getSetting, setSetting } from './db';
import type {
  GoogleAuthCallbackResult,
  GoogleAuthStartResult,
  User,
} from '../shared/api';

/** Redirect usado pelo desktop — cadastre EXATAMENTE este URI no Google Cloud. */
export const GOOGLE_REDIRECT_URI = 'http://localhost:3000/auth/callback/google';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

let currentUser: User | null = null;
let pendingState: string | null = null;

function persistSession(user: User | null): void {
  setSetting('auth.sessionUserId', user?.id ?? '');
}

/** Restaura usuário do SQLite (sobrevive a restart). Logout explícito grava session vazia. */
export function restoreSession(): User | null {
  if (currentUser) return currentUser;

  const repo = getAuthRepository();
  const raw = getSetting('auth.sessionUserId');

  // '' = logout explícito — não reabrir sessão automática
  if (raw === '') return null;

  if (raw?.trim()) {
    const user = repo.getUser(raw.trim());
    if (user && repo.getAccount(user.id, 'google')) {
      currentUser = user;
      return currentUser;
    }
  }

  // Contas antigas (pré-persistência): hidrata o último Google e grava a flag
  const latest = repo.getLatestGoogleUser();
  if (latest) {
    currentUser = latest;
    persistSession(latest);
    return currentUser;
  }

  return null;
}

export function getCurrentUser(): User | null {
  return currentUser ?? restoreSession();
}

export function getCurrentUserId(): string | null {
  return getCurrentUser()?.id ?? null;
}

function clientId(): string {
  return process.env.GOOGLE_CLIENT_ID?.trim() ?? '';
}

function clientSecret(): string {
  return process.env.GOOGLE_CLIENT_SECRET?.trim() ?? '';
}

function generateState(): string {
  return crypto.randomUUID();
}

function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}> {
  const params = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    code,
    redirect_uri: GOOGLE_REDIRECT_URI,
    grant_type: 'authorization_code',
  });

  return new Promise((resolve, reject) => {
    const request = net.request({ method: 'POST', url: GOOGLE_TOKEN_URL });
    const chunks: Buffer[] = [];
    request.on('response', (response) => {
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        try {
          const json = JSON.parse(body) as Record<string, unknown>;
          if (json.error) {
            reject(new Error(String(json.error_description ?? json.error)));
            return;
          }
          resolve(json as never);
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    });
    request.on('error', reject);
    request.setHeader('Content-Type', 'application/x-www-form-urlencoded');
    request.write(params.toString());
    request.end();
  });
}

async function fetchGoogleUserInfo(accessToken: string): Promise<{
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
}> {
  return new Promise((resolve, reject) => {
    const request = net.request({
      method: 'GET',
      url: GOOGLE_USERINFO_URL,
    });
    request.setHeader('Authorization', `Bearer ${accessToken}`);
    const chunks: Buffer[] = [];
    request.on('response', (response) => {
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    });
    request.on('error', reject);
    request.end();
  });
}

function getOrCreateUserFromGoogle(
  googleData: {
    sub: string;
    email: string;
    name?: string;
    picture?: string;
    email_verified?: boolean;
  },
  tokens: {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in: number;
    token_type: string;
    scope?: string;
  }
): GoogleAuthCallbackResult {
  const repo = getAuthRepository();
  let user =
    repo.getUserByProvider('google', googleData.sub) ?? repo.getUserByEmail(googleData.email);

  if (user) {
    repo.updateUser(user.id, {
      name: googleData.name ?? user.name,
      image: googleData.picture ?? user.image,
      emailVerified: googleData.email_verified ? new Date().toISOString() : user.emailVerified,
    });
    user = repo.getUser(user.id)!;
  } else {
    user = repo.createUser({
      id: crypto.randomUUID(),
      email: googleData.email,
      name: googleData.name ?? null,
      image: googleData.picture ?? null,
      emailVerified: googleData.email_verified ? new Date().toISOString() : null,
    });
  }

  const account = repo.upsertAccount({
    userId: user.id,
    type: 'oauth',
    provider: 'google',
    providerAccountId: googleData.sub,
    refreshToken: tokens.refresh_token ?? null,
    accessToken: tokens.access_token,
    expiresAt: Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 3600),
    tokenType: tokens.token_type ?? 'Bearer',
    scope: tokens.scope ?? 'openid email profile',
    idToken: tokens.id_token ?? null,
    sessionState: null,
  });

  currentUser = user;
  persistSession(user);
  return { user, account };
}

/** Abre janela Google, captura redirect e cria sessão local. */
export function loginWithGoogle(): Promise<GoogleAuthCallbackResult> {
  if (!clientId() || !clientSecret()) {
    return Promise.reject(
      new Error(
        'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET não configurados. Coloque no .env.local da raiz e reinicie o app.'
      )
    );
  }

  const state = generateState();
  pendingState = state;
  const authUrl = buildGoogleAuthUrl(state);

  return new Promise((resolve, reject) => {
    const authWindow = new BrowserWindow({
      width: 520,
      height: 720,
      title: 'Entrar com Google',
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
      fn();
    };

    const handleRedirect = async (url: string) => {
      if (!url.startsWith(GOOGLE_REDIRECT_URI)) return;
      try {
        const urlObj = new URL(url);
        const error = urlObj.searchParams.get('error');
        if (error) throw new Error(urlObj.searchParams.get('error_description') ?? error);
        const code = urlObj.searchParams.get('code');
        const returnedState = urlObj.searchParams.get('state');
        if (!code) throw new Error('Código de autorização não recebido');
        if (!returnedState || returnedState !== state) throw new Error('State OAuth inválido');

        const tokens = await exchangeCodeForTokens(code);
        const googleData = await fetchGoogleUserInfo(tokens.access_token);
        const result = getOrCreateUserFromGoogle(googleData, tokens);
        if (!authWindow.isDestroyed()) authWindow.close();
        finish(() => resolve(result));
      } catch (err) {
        if (!authWindow.isDestroyed()) authWindow.close();
        finish(() => reject(err instanceof Error ? err : new Error(String(err))));
      }
    };

    authWindow.webContents.on('will-redirect', (event, url) => {
      if (url.startsWith(GOOGLE_REDIRECT_URI)) {
        event.preventDefault();
        void handleRedirect(url);
      }
    });
    authWindow.webContents.on('will-navigate', (event, url) => {
      if (url.startsWith(GOOGLE_REDIRECT_URI)) {
        event.preventDefault();
        void handleRedirect(url);
      }
    });

    authWindow.on('closed', () => {
      finish(() => reject(new Error('Login cancelado')));
    });

    void authWindow.loadURL(authUrl);
  });
}

export function startGoogleAuth(): Promise<GoogleAuthStartResult> {
  if (!clientId() || !clientSecret()) {
    return Promise.reject(
      new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET não configurados')
    );
  }
  const state = generateState();
  pendingState = state;
  return Promise.resolve({ authUrl: buildGoogleAuthUrl(state), state });
}

export function registerAuthHandlers(): void {
  ipcMain.handle('auth:get-current-user', async () => getCurrentUser());

  ipcMain.handle('auth:get-google-auth-url', async () => startGoogleAuth());

  /** Fluxo completo: abre janela + callback + sessão. */
  ipcMain.handle('auth:login-with-google', async () => loginWithGoogle());

  ipcMain.handle('auth:google-callback', async (_event, params: { code: string; state: string }) => {
    if (params.state !== pendingState) throw new Error('State inválido');
    const tokens = await exchangeCodeForTokens(params.code);
    const googleData = await fetchGoogleUserInfo(tokens.access_token);
    return getOrCreateUserFromGoogle(googleData, tokens);
  });

  ipcMain.handle('auth:logout', async () => {
    currentUser = null;
    persistSession(null);
    return { ok: true };
  });
}

export function getPendingState(): string | null {
  return pendingState;
}
