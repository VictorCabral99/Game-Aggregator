import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';

/** Epic / Luna linking stubs — UI shows "em breve"; accepts token for future use */
export async function POST(request: NextRequest) {
  const auth = await requireUserId();
  if ('error' in auth) return auth.error;

  const { platform, accessToken, externalUserId, displayName } =
    await request.json();

  if (platform !== 'epic' && platform !== 'luna') {
    return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
  }

  if (!accessToken && !externalUserId) {
    return NextResponse.json(
      {
        error: `${platform} integration is coming soon`,
        comingSoon: true,
      },
      { status: 501 }
    );
  }

  const account = await prisma.platformAccount.upsert({
    where: {
      userId_platform: {
        userId: auth.userId,
        platform,
      },
    },
    update: {
      externalUserId: externalUserId || 'pending',
      displayName: displayName || platform,
      accessToken: accessToken || null,
    },
    create: {
      userId: auth.userId,
      platform,
      externalUserId: externalUserId || 'pending',
      displayName: displayName || platform,
      accessToken: accessToken || null,
    },
  });

  return NextResponse.json({
    success: true,
    comingSoon: true,
    account: {
      id: account.id,
      platform: account.platform,
      externalUserId: account.externalUserId,
      displayName: account.displayName,
    },
  });
}
