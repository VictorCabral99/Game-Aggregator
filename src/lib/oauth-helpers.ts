import { createHash, randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

type OriginSource =
  | NextRequest
  | URL
  | string
  | { nextUrl?: URL; url?: string; headers?: Headers }
  | null
  | undefined;

/** Prefer the live request origin so dynamic ports (3001, 3002…) work in dev. */
export function baseUrl(source?: OriginSource) {
  if (typeof source === 'string' && source) {
    try {
      return new URL(source).origin;
    } catch {
      // fall through
    }
  }

  if (source instanceof URL) {
    return source.origin;
  }

  if (source && typeof source === 'object') {
    const nextUrl = 'nextUrl' in source ? source.nextUrl : undefined;
    if (nextUrl?.origin) return nextUrl.origin;

    if ('url' in source && source.url) {
      try {
        return new URL(source.url).origin;
      } catch {
        // fall through
      }
    }

    const headers = 'headers' in source ? source.headers : undefined;
    if (headers) {
      const host =
        headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
        headers.get('host')?.split(',')[0]?.trim();
      const proto =
        headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'http';
      if (host) return `${proto}://${host}`;
    }
  }

  return process.env.NEXTAUTH_URL || 'http://localhost:3000';
}

export function randomString(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function pkceChallenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function setOAuthCookies(
  response: NextResponse,
  platform: string,
  data: { state: string; verifier?: string; userId: string }
) {
  const maxAge = 60 * 10;
  response.cookies.set(`oauth_${platform}_state`, data.state, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
  response.cookies.set(`oauth_${platform}_uid`, data.userId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
  if (data.verifier) {
    response.cookies.set(`oauth_${platform}_verifier`, data.verifier, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge,
    });
  }
  return response;
}

export function clearOAuthCookies(response: NextResponse, platform: string) {
  for (const key of ['state', 'uid', 'verifier']) {
    response.cookies.set(`oauth_${platform}_${key}`, '', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  }
  return response;
}

export function redirectDashboard(
  message: string,
  ok = true,
  source?: OriginSource
) {
  const url = new URL('/dashboard', baseUrl(source));
  url.searchParams.set(ok ? 'linked' : 'error', message);
  return NextResponse.redirect(url);
}

/** Public GOG Galaxy client (Heroic / gogdl / GameNative) */
export const GOG_PUBLIC_CLIENT_ID =
  process.env.GOG_CLIENT_ID || '46899977096215655';
export const GOG_PUBLIC_CLIENT_SECRET =
  process.env.GOG_CLIENT_SECRET ||
  '9d85c43b1482497dbbce61f6e4aa173a433796eeae2ca8c5f6129f2dc4de46d9';

/** Official Galaxy redirect — cannot use localhost */
export const GOG_REDIRECT_URI =
  'https://embed.gog.com/on_login_success?origin=client';

/** Legendary Epic client credentials (public, same as Heroic/Legendary) */
export const EPIC_CLIENT_ID =
  process.env.EPIC_CLIENT_ID || '34a02cf8f4414e29b15921876da36f9a';
export const EPIC_CLIENT_SECRET =
  process.env.EPIC_CLIENT_SECRET || 'daafbccc737745039dffe53d94fc76cf';
