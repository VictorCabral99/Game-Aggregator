import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const auth = await requireUserId();
  if ('error' in auth) return auth.error;

  const accounts = await prisma.platformAccount.findMany({
    where: { userId: auth.userId },
    select: {
      id: true,
      platform: true,
      externalUserId: true,
      displayName: true,
      linkedAt: true,
      lastLibrarySyncAt: true,
      lastWishlistSyncAt: true,
    },
  });

  return NextResponse.json({ accounts });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUserId();
  if ('error' in auth) return auth.error;

  const { platform } = await request.json();
  if (!platform) {
    return NextResponse.json({ error: 'platform is required' }, { status: 400 });
  }

  await prisma.platformAccount.deleteMany({
    where: { userId: auth.userId, platform },
  });

  return NextResponse.json({ success: true });
}
