import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

export async function requireUserId() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { userId: session.user.id as string };
}

export async function getUserSyncState(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      lastDailySyncAt: true,
      lastRatingsSyncAt: true,
      lastDealsSyncAt: true,
    },
  });
}

export function isStale(date: Date | null | undefined, hours = 24) {
  if (!date) return true;
  return Date.now() - date.getTime() > hours * 60 * 60 * 1000;
}

export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
