import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-helpers';
import { SteamAPI } from '@/lib/steam-api';
import { GogAPI } from '@/lib/gog-api';
import { prisma } from '@/lib/prisma';

async function ensureGogToken(account: {
  id: string;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
}) {
  let token = account.accessToken;
  if (
    (!token ||
      (account.tokenExpiresAt && account.tokenExpiresAt.getTime() < Date.now())) &&
    account.refreshToken
  ) {
    const refreshed = await GogAPI.refreshAccessToken(account.refreshToken);
    token = refreshed.access_token;
    await prisma.platformAccount.update({
      where: { id: account.id },
      data: {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token || account.refreshToken,
        tokenExpiresAt: refreshed.expires_in
          ? new Date(Date.now() + refreshed.expires_in * 1000)
          : null,
      },
    });
  }
  if (!token) throw new Error('GOG access token missing');
  return token;
}

async function pruneWishlist(
  userId: string,
  platform: string,
  keepExternalIds: string[]
) {
  await prisma.wishlistItem.deleteMany({
    where: {
      userId,
      platform,
      ...(keepExternalIds.length > 0
        ? { externalId: { notIn: keepExternalIds } }
        : {}),
    },
  });
}

export async function GET() {
  const auth = await requireUserId();
  if ('error' in auth) return auth.error;

  const items = await prisma.wishlistItem.findMany({
    where: { userId: auth.userId },
    include: { deals: true },
    orderBy: { syncedAt: 'desc' },
  });

  return NextResponse.json({ items });
}

export async function POST() {
  const auth = await requireUserId();
  if ('error' in auth) return auth.error;

  const accounts = await prisma.platformAccount.findMany({
    where: { userId: auth.userId },
  });

  let total = 0;
  const errors: string[] = [];

  for (const account of accounts) {
    try {
      if (account.platform === 'steam') {
        if (!process.env.STEAM_API_KEY) {
          errors.push('STEAM_API_KEY missing');
          continue;
        }
        const steam = new SteamAPI(process.env.STEAM_API_KEY);
        const result = await steam.getWishlist(account.externalUserId);

        if (result.error) {
          errors.push(result.error);
          continue;
        }
        if (result.warning) {
          errors.push(result.warning);
        }

        const ids: string[] = [];
        for (const game of result.games) {
          const externalId = String(game.appid);
          ids.push(externalId);
          await prisma.wishlistItem.upsert({
            where: {
              userId_platform_externalId: {
                userId: auth.userId,
                platform: 'steam',
                externalId,
              },
            },
            update: {
              gameData: JSON.stringify(game),
              syncedAt: new Date(),
            },
            create: {
              userId: auth.userId,
              platform: 'steam',
              externalId,
              gameData: JSON.stringify(game),
            },
          });
          total += 1;
        }

        // Não prune se veio vazia (pode ser wishlist privada)
        if (result.games.length > 0 || !result.warning) {
          await pruneWishlist(auth.userId, 'steam', ids);
        }
        await prisma.platformAccount.update({
          where: { id: account.id },
          data: { lastWishlistSyncAt: new Date() },
        });
      }

      if (account.platform === 'gog') {
        const token = await ensureGogToken(account);
        const gog = new GogAPI(token);
        const wishlist = await gog.getWishlist();
        const ids: string[] = [];

        for (const game of wishlist) {
          const externalId = String(game.id);
          ids.push(externalId);
          await prisma.wishlistItem.upsert({
            where: {
              userId_platform_externalId: {
                userId: auth.userId,
                platform: 'gog',
                externalId,
              },
            },
            update: {
              gameData: JSON.stringify({ name: game.title, ...game }),
              syncedAt: new Date(),
            },
            create: {
              userId: auth.userId,
              platform: 'gog',
              externalId,
              gameData: JSON.stringify({ name: game.title, ...game }),
            },
          });
          total += 1;
        }

        await pruneWishlist(auth.userId, 'gog', ids);
        await prisma.platformAccount.update({
          where: { id: account.id },
          data: { lastWishlistSyncAt: new Date() },
        });
      }

      // Epic / Amazon wishlist ainda sem API — não sincroniza nem apaga itens
    } catch (error) {
      console.error(`Wishlist sync error (${account.platform}):`, error);
      const message =
        error instanceof Error ? error.message : `${account.platform}: sync failed`;
      errors.push(message);
    }
  }

  return NextResponse.json({ success: true, itemCount: total, errors });
}
