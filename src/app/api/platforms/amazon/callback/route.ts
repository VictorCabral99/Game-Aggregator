import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { AmazonAPI } from '@/lib/amazon-api';
import { authOptions } from '@/lib/auth-options';
import {
  clearOAuthCookies,
  redirectDashboard,
} from '@/lib/oauth-helpers';

function clearAmazonCookies(response: NextResponse) {
  clearOAuthCookies(response, 'amazon');
  for (const key of ['client_id', 'serial']) {
    response.cookies.set(`oauth_amazon_${key}`, '', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  }
  return response;
}

async function resolveUserId(request: NextRequest): Promise<string | null> {
  const fromCookie = request.cookies.get('oauth_amazon_uid')?.value;
  if (fromCookie) return fromCookie;
  const session = await getServerSession(authOptions);
  return session?.user?.id || null;
}

async function finishAmazonLink(
  userId: string,
  code: string,
  clientId: string,
  codeVerifier: string,
  serial: string,
  request: NextRequest
) {
  const tokens = await AmazonAPI.registerDevice({
    code,
    clientId,
    codeVerifier,
    serial,
  });

  if (!tokens.access_token || !tokens.account_id) {
    throw new Error('Amazon: resposta de registro incompleta');
  }

  const metadata = JSON.stringify({
    nile: true,
    clientId: tokens.clientId,
    serial: tokens.serial,
  });

  await prisma.platformAccount.upsert({
    where: {
      userId_platform: { userId, platform: 'amazon' },
    },
    update: {
      externalUserId: tokens.account_id,
      displayName: tokens.displayName || tokens.account_id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || null,
      tokenExpiresAt: tokens.expires_in
        ? new Date(Date.now() + Number(tokens.expires_in) * 1000)
        : null,
      metadata,
    },
    create: {
      userId,
      platform: 'amazon',
      externalUserId: tokens.account_id,
      displayName: tokens.displayName || tokens.account_id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || null,
      tokenExpiresAt: tokens.expires_in
        ? new Date(Date.now() + Number(tokens.expires_in) * 1000)
        : null,
      metadata,
    },
  });

  const res = redirectDashboard('amazon', true, request);
  return clearAmazonCookies(res);
}

export async function GET(request: NextRequest) {
  // Legacy LWA redirect — send user to the Nile bridge instead
  return NextResponse.redirect(
    new URL('/api/platforms/amazon/login', request.url)
  );
}

export async function POST(request: NextRequest) {
  const userId = await resolveUserId(request);
  if (!userId) {
    const res = redirectDashboard(
      'Amazon: faça login Google primeiro',
      false,
      request
    );
    return clearAmazonCookies(res);
  }

  const clientId = request.cookies.get('oauth_amazon_client_id')?.value;
  const codeVerifier = request.cookies.get('oauth_amazon_verifier')?.value;
  const serial = request.cookies.get('oauth_amazon_serial')?.value;

  if (!clientId || !codeVerifier || !serial) {
    const res = redirectDashboard(
      'Amazon: sessão de login expirada — abra Entrar com Amazon de novo',
      false,
      request
    );
    return clearAmazonCookies(res);
  }

  const form = await request.formData();
  const code = AmazonAPI.extractAuthCode(String(form.get('code') || ''));
  if (!code) {
    const res = redirectDashboard(
      'Amazon: URL inválida — cole a URL com openid.oa2.authorization_code',
      false,
      request
    );
    return clearAmazonCookies(res);
  }

  try {
    return await finishAmazonLink(
      userId,
      code,
      clientId,
      codeVerifier,
      serial,
      request
    );
  } catch (error) {
    console.error('Amazon Nile callback error:', error);
    const message =
      error instanceof Error
        ? error.message
        : 'Amazon: falha ao autenticar (código expirado? tente de novo)';
    const res = redirectDashboard(message, false, request);
    return clearAmazonCookies(res);
  }
}
