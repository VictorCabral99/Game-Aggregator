import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { prisma } from '@/lib/prisma';
import { GogAPI } from '@/lib/gog-api';
import {
  clearOAuthCookies,
  redirectDashboard,
  GOG_PUBLIC_CLIENT_ID,
  GOG_PUBLIC_CLIENT_SECRET,
  GOG_REDIRECT_URI,
} from '@/lib/oauth-helpers';

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

async function finishGog(userId: string, code: string, request: NextRequest) {
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
}

/** Keep callback for form posts / accidental redirects */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const userId = request.cookies.get('oauth_gog_uid')?.value;
  if (!userId || !code) {
    return NextResponse.redirect(new URL('/api/platforms/gog/login', request.url));
  }
  try {
    return await finishGog(userId, code, request);
  } catch (error) {
    console.error('GOG callback GET error:', error);
    const res = redirectDashboard('GOG: falha ao autenticar', false, request);
    return clearOAuthCookies(res, 'gog');
  }
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
    return await finishGog(userId, code, request);
  } catch (error) {
    console.error('GOG callback POST error:', error);
    const res = redirectDashboard(
      'GOG: falha ao trocar código (cole a URL logo após o login)',
      false,
      request
    );
    return clearOAuthCookies(res, 'gog');
  }
}
