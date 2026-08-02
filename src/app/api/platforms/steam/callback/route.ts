import { NextRequest } from 'next/server';
import axios from 'axios';
import { prisma } from '@/lib/prisma';
import { SteamAPI } from '@/lib/steam-api';
import {
  clearOAuthCookies,
  redirectDashboard,
} from '@/lib/oauth-helpers';

const STEAM_OPENID = 'https://steamcommunity.com/openid/login';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const state = params.get('state');
  const cookieState = request.cookies.get('oauth_steam_state')?.value;
  const userId = request.cookies.get('oauth_steam_uid')?.value;

  if (!userId || !state || !cookieState || state !== cookieState) {
    const res = redirectDashboard('Steam: estado OAuth inválido', false, request);
    return clearOAuthCookies(res, 'steam');
  }

  if (params.get('openid.mode') === 'error') {
    const res = redirectDashboard('Steam: login cancelado', false, request);
    return clearOAuthCookies(res, 'steam');
  }

  const verify = new URLSearchParams();
  params.forEach((value, key) => {
    if (key.startsWith('openid.')) {
      verify.set(key, value);
    }
  });
  verify.set('openid.mode', 'check_authentication');

  try {
    const verification = await axios.post(STEAM_OPENID, verify.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (!String(verification.data).includes('is_valid:true')) {
      const res = redirectDashboard('Steam: verificação falhou', false, request);
      return clearOAuthCookies(res, 'steam');
    }

    const claimedId = params.get('openid.claimed_id') || '';
    const match = claimedId.match(/\/openid\/id\/(\d+)$/);
    if (!match) {
      const res = redirectDashboard('Steam: SteamID não encontrado', false, request);
      return clearOAuthCookies(res, 'steam');
    }

    const steamId = match[1];
    let displayName = steamId;

    if (process.env.STEAM_API_KEY) {
      try {
        const steam = new SteamAPI(process.env.STEAM_API_KEY);
        const summaries = await steam.getPlayerSummaries([steamId]);
        displayName =
          summaries?.response?.players?.[0]?.personaname || steamId;
      } catch {
        // keep steamId
      }
    }

    await prisma.platformAccount.upsert({
      where: {
        userId_platform: { userId, platform: 'steam' },
      },
      update: {
        externalUserId: steamId,
        displayName,
      },
      create: {
        userId,
        platform: 'steam',
        externalUserId: steamId,
        displayName,
      },
    });

    const res = redirectDashboard('steam', true, request);
    return clearOAuthCookies(res, 'steam');
  } catch (error) {
    console.error('Steam OpenID callback error:', error);
    const res = redirectDashboard('Steam: erro no callback', false, request);
    return clearOAuthCookies(res, 'steam');
  }
}
