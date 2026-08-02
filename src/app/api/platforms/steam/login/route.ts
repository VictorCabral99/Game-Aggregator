import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-helpers';
import { baseUrl, setOAuthCookies, randomString } from '@/lib/oauth-helpers';

const STEAM_OPENID = 'https://steamcommunity.com/openid/login';

export async function GET(request: NextRequest) {
  const origin = baseUrl(request);
  const auth = await requireUserId();
  if ('error' in auth) {
    return NextResponse.redirect(new URL('/auth/signin', origin));
  }

  const returnTo = `${origin}/api/platforms/steam/callback`;
  const state = randomString(16);

  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': `${returnTo}?state=${state}`,
    'openid.realm': origin,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });

  const response = NextResponse.redirect(`${STEAM_OPENID}?${params.toString()}`);
  setOAuthCookies(response, 'steam', { state, userId: auth.userId });
  return response;
}
