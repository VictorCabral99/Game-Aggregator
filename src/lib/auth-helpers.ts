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

/** Run async work over items with limited concurrency. */
export async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
) {
  const limit = Math.max(1, Math.min(concurrency, items.length || 1));
  let next = 0;

  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (true) {
        const index = next;
        next += 1;
        if (index >= items.length) return;
        await worker(items[index], index);
      }
    })
  );
}
