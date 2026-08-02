import { NextRequest, NextResponse } from 'next/server';
import {
  requireUserId,
  getUserSyncState,
  isStale,
} from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';

async function callInternal(
  origin: string,
  path: string,
  cookie: string | null
) {
  const response = await fetch(`${origin}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

export async function GET() {
  const auth = await requireUserId();
  if ('error' in auth) return auth.error;

  const state = await getUserSyncState(auth.userId);
  return NextResponse.json({
    lastDailySyncAt: state?.lastDailySyncAt ?? null,
    lastRatingsSyncAt: state?.lastRatingsSyncAt ?? null,
    lastDealsSyncAt: state?.lastDealsSyncAt ?? null,
    needsSync: isStale(state?.lastDailySyncAt, 24 * 7),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireUserId();
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const force = Boolean(body?.force);
  const markOnly = Boolean(body?.markOnly);

  const state = await getUserSyncState(auth.userId);

  if (markOnly) {
    const now = new Date();
    await prisma.user.update({
      where: { id: auth.userId },
      data: {
        lastDailySyncAt: now,
        lastRatingsSyncAt: now,
        lastDealsSyncAt: now,
      },
    });
    return NextResponse.json({
      success: true,
      marked: true,
      lastDailySyncAt: now,
    });
  }

  if (!force && !isStale(state?.lastDailySyncAt, 24 * 7)) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'Already synced within 7 days',
      lastDailySyncAt: state?.lastDailySyncAt,
    });
  }

  const origin = request.nextUrl.origin;
  const cookie = request.headers.get('cookie');
  const stage = typeof body?.stage === 'string' ? body.stage : 'all';

  const results: Record<string, unknown> = {};

  if (stage === 'all' || stage === 'library') {
    const library = await callInternal(origin, '/api/library', cookie);
    results.library = library.data;
  }

  if (stage === 'all' || stage === 'wishlist') {
    const wishlist = await callInternal(origin, '/api/wishlist', cookie);
    results.wishlist = wishlist.data;
  }

  const now = new Date();
  // Notas e preços ficam nos botões dedicados; sync de lojas só marca daily
  if (
    stage === 'all' ||
    stage === 'enrich' ||
    stage === 'library' ||
    stage === 'wishlist'
  ) {
    await prisma.user.update({
      where: { id: auth.userId },
      data: { lastDailySyncAt: now },
    });
  }

  return NextResponse.json({
    success: true,
    skipped: false,
    stage,
    lastDailySyncAt: now,
    results,
  });
}
