import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { EpicAPI } from '@/lib/epic-api';
import { authOptions } from '@/lib/auth-options';
import {
  clearOAuthCookies,
  redirectDashboard,
} from '@/lib/oauth-helpers';

function extractEpicCode(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  if (value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value);
      return String(parsed.authorizationCode || parsed.code || '');
    } catch {
      const m = value.match(/"authorizationCode"\s*:\s*"([^"]+)"/);
      return m?.[1] || '';
    }
  }
  // redirectUrl=...?code=xxx
  try {
    if (value.includes('code=')) {
      const url = new URL(value.startsWith('http') ? value : `https://x/?${value}`);
      const fromQuery = url.searchParams.get('code');
      if (fromQuery) return fromQuery;
    }
  } catch {
    // ignore
  }
  const m = value.match(/authorizationCode["']?\s*[:=]\s*["']?([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  return value;
}

async function resolveUserId(request: NextRequest): Promise<string | null> {
  const fromCookie = request.cookies.get('oauth_epic_uid')?.value;
  if (fromCookie) return fromCookie;

  const session = await getServerSession(authOptions);
  return session?.user?.id || null;
}

async function finishEpicLink(userId: string, code: string, request: NextRequest) {
  const tokens = await EpicAPI.exchangeAuthCode(code);
  await prisma.platformAccount.upsert({
    where: { userId_platform: { userId, platform: 'epic' } },
    update: {
      externalUserId: tokens.account_id,
      displayName: tokens.displayName || tokens.account_id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || null,
      tokenExpiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null,
    },
    create: {
      userId,
      platform: 'epic',
      externalUserId: tokens.account_id,
      displayName: tokens.displayName || tokens.account_id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || null,
      tokenExpiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null,
    },
  });

  const res = redirectDashboard('epic', true, request);
  return clearOAuthCookies(res, 'epic');
}

export async function GET(request: NextRequest) {
  const code =
    request.nextUrl.searchParams.get('code') ||
    request.nextUrl.searchParams.get('authorizationCode');

  if (!code) {
    return NextResponse.redirect(new URL('/api/platforms/epic/login', request.url));
  }

  const userId = await resolveUserId(request);
  if (!userId) {
    const res = redirectDashboard('Epic: faça login Google primeiro', false, request);
    return clearOAuthCookies(res, 'epic');
  }

  try {
    return await finishEpicLink(userId, code, request);
  } catch (error) {
    console.error('Epic GET callback error:', error);
    const message =
      error instanceof Error ? error.message : 'Epic: falha ao autenticar';
    const res = redirectDashboard(message, false, request);
    return clearOAuthCookies(res, 'epic');
  }
}

export async function POST(request: NextRequest) {
  const userId = await resolveUserId(request);
  if (!userId) {
    const res = redirectDashboard('Epic: faça login Google primeiro', false, request);
    return clearOAuthCookies(res, 'epic');
  }

  const form = await request.formData();
  const code = extractEpicCode(String(form.get('code') || ''));
  if (!code) {
    const res = redirectDashboard('Epic: código vazio', false, request);
    return clearOAuthCookies(res, 'epic');
  }

  try {
    return await finishEpicLink(userId, code, request);
  } catch (error) {
    console.error('Epic POST callback error:', error);
    const message =
      error instanceof Error
        ? error.message
        : 'Epic: falha ao autenticar (código expirado? gere outro)';
    const res = redirectDashboard(message, false, request);
    return clearOAuthCookies(res, 'epic');
  }
}
