import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { requireUserId } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { GogAPI } from '@/lib/gog-api';
import {
  baseUrl,
  setOAuthCookies,
  clearOAuthCookies,
  redirectDashboard,
  randomString,
  GOG_PUBLIC_CLIENT_ID,
  GOG_PUBLIC_CLIENT_SECRET,
  GOG_REDIRECT_URI,
} from '@/lib/oauth-helpers';

function gogAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: GOG_PUBLIC_CLIENT_ID,
    redirect_uri: GOG_REDIRECT_URI,
    response_type: 'code',
    layout: 'galaxy',
    state,
  });
  return `https://auth.gog.com/auth?${params.toString()}`;
}

function extractCode(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  if (value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value);
      return String(parsed.code || parsed.authorizationCode || '');
    } catch {
      return '';
    }
  }
  try {
    if (value.includes('code=')) {
      const url = new URL(value.startsWith('http') ? value : `https://x/?${value}`);
      return url.searchParams.get('code') || '';
    }
  } catch {
    // fall through
  }
  return value;
}

function bridgeHtml(authUrl: string) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Conectar GOG</title>
  <style>
    body{font-family:system-ui,sans-serif;background:#0b0b0b;color:#eee;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#1a1a1a;border:1px solid #333;border-radius:16px;max-width:480px;width:100%;padding:28px}
    h1{margin:0 0 8px;font-size:1.5rem}
    p{color:#aaa;line-height:1.5;font-size:.95rem}
    ol{color:#ccc;line-height:1.6;padding-left:1.2rem}
    a.btn,button{display:block;width:100%;text-align:center;text-decoration:none;border:0;border-radius:10px;padding:12px 16px;font-weight:700;cursor:pointer;margin-top:12px}
    a.btn{background:#86328a;color:#fff}
    a.btn:hover{background:#9b3fa0}
    input{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #444;background:#111;color:#fff;margin-top:8px}
    button[type=submit]{background:#22c55e;color:#041}
    .muted{font-size:.8rem;color:#777;margin-top:16px}
  </style>
</head>
<body>
  <div class="card">
    <h1>Entrar com GOG</h1>
    <p>O GOG só redireciona para a página oficial deles. Siga os passos:</p>
    <ol>
      <li>Clique em <b>Abrir login GOG</b></li>
      <li>Faça login na conta GOG</li>
      <li>Você cai numa página quase em branco em <code>embed.gog.com</code></li>
      <li>Copie a <b>URL inteira</b> da barra de endereço (tem <code>code=</code>) e cole abaixo</li>
    </ol>
    <a class="btn" href="${authUrl}" target="_blank" rel="noopener">Abrir login GOG</a>
    <form method="POST" action="/api/platforms/gog/callback">
      <input name="code" placeholder="Cole a URL ou o code=..." required />
      <button type="submit">Conectar GOG</button>
    </form>
    <p class="muted">Depois disso voltamos ao dashboard automaticamente.</p>
  </div>
</body>
</html>`;
}

export async function GET(request: NextRequest) {
  const auth = await requireUserId();
  if ('error' in auth) {
    return NextResponse.redirect(new URL('/auth/signin', baseUrl(request)));
  }

  const state = randomString(16);
  const response = new NextResponse(bridgeHtml(gogAuthUrl(state)), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
  setOAuthCookies(response, 'gog', { state, userId: auth.userId });
  return response;
}

export async function POST(request: NextRequest) {
  const userId = request.cookies.get('oauth_gog_uid')?.value;
  if (!userId) {
    const res = redirectDashboard(
      'GOG: faça login Google e tente de novo',
      false,
      request
    );
    return clearOAuthCookies(res, 'gog');
  }

  const form = await request.formData();
  const code = extractCode(String(form.get('code') || ''));
  if (!code) {
    const res = redirectDashboard('GOG: código/URL inválidos', false, request);
    return clearOAuthCookies(res, 'gog');
  }

  try {
    const tokenRes = await axios.get('https://auth.gog.com/token', {
      params: {
        client_id: GOG_PUBLIC_CLIENT_ID,
        client_secret: GOG_PUBLIC_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: GOG_REDIRECT_URI,
      },
    });

    const accessToken = tokenRes.data.access_token as string;
    const refreshToken = tokenRes.data.refresh_token as string | undefined;
    const expiresIn = tokenRes.data.expires_in as number | undefined;

    const gog = new GogAPI(accessToken);
    const userData = await gog.getUserData();

    await prisma.platformAccount.upsert({
      where: { userId_platform: { userId, platform: 'gog' } },
      update: {
        externalUserId: userData.userId,
        displayName: userData.username,
        accessToken,
        refreshToken: refreshToken || null,
        tokenExpiresAt: expiresIn
          ? new Date(Date.now() + expiresIn * 1000)
          : null,
      },
      create: {
        userId,
        platform: 'gog',
        externalUserId: userData.userId,
        displayName: userData.username,
        accessToken,
        refreshToken: refreshToken || null,
        tokenExpiresAt: expiresIn
          ? new Date(Date.now() + expiresIn * 1000)
          : null,
      },
    });

    const res = redirectDashboard('gog', true, request);
    return clearOAuthCookies(res, 'gog');
  } catch (error) {
    console.error('GOG OAuth error:', error);
    const res = redirectDashboard(
      'GOG: falha ao trocar código (verifique se colou a URL logo após o login)',
      false,
      request
    );
    return clearOAuthCookies(res, 'gog');
  }
}
