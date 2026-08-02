import { BrowserWindow, app, ipcMain, net } from 'electron';
import { URLSearchParams } from 'node:url';
import { getAuthRepository } from './db';
import type { Account, GoogleAuthCallbackResult, GoogleAuthStartResult, PlatformAccount, User } from '../shared/api';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';
const GOOGLE_REDIRECT_URI = 'http://localhost:3000/auth/callback/google';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

function generateState(): string {
  return crypto.randomUUID();
}

function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
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
  refresh_token: string;
  id_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}> {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    code,
    redirect_uri: GOOGLE_REDIRECT_URI,
    grant_type: 'authorization_code',
  });

  return new Promise((resolve, reject) => {
    const request = net.request({
      method: 'POST',
      url: GOOGLE_TOKEN_URL,
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
          reject(new Error('Resposta inválida do Google token endpoint'));
        }
      });
    });
    request.on('error', reject);
    request.write(params.toString());
    request.end();
  });
}

async function fetchGoogleUserInfo(accessToken: string): Promise<{ sub: string; email: string; name: string; picture: string; email_verified: boolean }> {
  return new Promise((resolve, reject) => {
    const request = net.request({
      method: 'GET',
      url: GOOGLE_USERINFO_URL,
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
          reject(new Error('Resposta inválida do Google userinfo'));
        }
      });
    });
    request.on('error', reject);
    request.end();
  });
}

async function getOrCreateUserFromGoogle(googleData: {
  sub: string;
  email: string;
  name: string;
  picture: string;
  email_verified: boolean;
}, tokens: {
  access_token: string;
  refresh_token: string;
  id_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}): Promise<GoogleAuthCallbackResult> {
  const repo = getAuthRepository();

  let user = repo.getUserByProvider('google', googleData.sub);
  let isNewUser = false;

  if (!user) {
    user = repo.getUserByEmail(googleData.email);
  }

  if (!user) {
    isNewUser = true;
    user = repo.createUser({
      id: `u-${crypto.randomUUID()}`,
      email: googleData.email,
      name: googleData.name,
      image: googleData.picture,
      emailVerified: googleData.email_verified ? new Date().toISOString() : null,
    });
  } else {
    // Atualiza perfil se mudou
    repo.updateUser(user.id, {
      name: googleData.name,
      image: googleData.picture,
      emailVerified: googleData.email_verified ? new Date().toISOString() : user.emailVerified,
    });
  }

  const account = repo.upsertAccount({
    userId: user.id,
    type: 'oauth',
    provider: 'google',
    providerAccountId: googleData.sub,
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
    tokenType: tokens.token_type,
    scope: tokens.scope,
    idToken: tokens.id_token,
    sessionState: null,
  });

  return { user, account };
}

let authWindow: BrowserWindow | null = null;
let authResolver: ((result: GoogleAuthCallbackResult) => void) | null = null;
let authRejecter: ((err: Error) => void) | null = null;
let pendingState: string | null = null;
let pendingResolve: ((result: GoogleAuthStartResult) => void) | null = null;
let pendingReject: ((err: Error) => void) | null = null;

export function startGoogleAuth(): Promise<GoogleAuthStartResult> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return Promise.reject(new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET não configurados'));
  }

  const state = generateState();
  pendingState = state;
  const authUrl = buildGoogleAuthUrl(state);

  return new Promise((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;
    resolve({ authUrl, state });
  });
}

export function resolveGoogleAuth(result: GoogleAuthCallbackResult): void {
  if (pendingResolve) {
    // Note: this is a design issue - we resolve start with callback result
    // For now, we'll handle it in the IPC handler
    pendingResolve = null;
    pendingReject = null;
  }
}

// IPC handlers
export function registerAuthHandlers(): void {
  ipcMain.handle('auth:get-current-user', async () => {
    // Por enquanto retorna null; sessão persistida virá depois
    return null;
  });

  ipcMain.handle('auth:get-google-auth-url', async () => {
    return startGoogleAuth();
  });

  ipcMain.handle('auth:google-callback', async (_event, params: { code: string; state: string }) => {
    if (params.state !== pendingState) throw new Error('State inválido');
    const tokens = await exchangeCodeForTokens(params.code);
    const googleData = await fetchGoogleUserInfo(tokens.access_token);
    return getOrCreateUserFromGoogle(googleData, tokens);
  });

  ipcMain.handle('auth:logout', async () => {
    // Limpa estado local (sessão em memória)
    return { ok: true };
  });
}

export function getPendingState(): string | null {
  return pendingState;
}