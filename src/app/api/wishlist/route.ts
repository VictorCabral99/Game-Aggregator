import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-helpers';
import { SteamAPI } from '@/lib/steam-api';
import { GogAPI } from '@/lib/gog-api';
import { EpicAPI } from '@/lib/epic-api';
import { AmazonAPI } from '@/lib/amazon-api';
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
        const wishlist = await steam.getWishlist(account.externalUserId);
        for (const game of wishlist) {
          await prisma.wishlistItem.upsert({
            where: {
              userId_platform_externalId: {
                userId: auth.userId,
                platform: 'steam',
                externalId: String(game.appid),
              },
            },
            update: {
              gameData: JSON.stringify(game),
              syncedAt: new Date(),
            },
            create: {
              userId: auth.userId,
              platform: 'steam',
              externalId: String(game.appid),
              gameData: JSON.stringify(game),
            },
          });
          total += 1;
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
        for (const game of wishlist) {
          await prisma.wishlistItem.upsert({
            where: {
              userId_platform_externalId: {
                userId: auth.userId,
                platform: 'gog',
                externalId: String(game.id),
              },
            },
            update: {
              gameData: JSON.stringify(game),
              syncedAt: new Date(),
            },
            create: {
              userId: auth.userId,
              platform: 'gog',
              externalId: String(game.id),
              gameData: JSON.stringify(game),
            },
          });
          total += 1;
        }
        await prisma.platformAccount.update({
          where: { id: account.id },
          data: { lastWishlistSyncAt: new Date() },
        });
      }

      if (account.platform === 'epic') {
        if (!account.accessToken) continue;
        const epic = new EpicAPI(account.accessToken);
        const wishlist = await epic.getWishlist();
        for (const game of wishlist) {
          await prisma.wishlistItem.upsert({
            where: {
              userId_platform_externalId: {
                userId: auth.userId,
                platform: 'epic',
                externalId: game.id,
              },
            },
            update: {
              gameData: JSON.stringify({ name: game.title, ...game }),
              syncedAt: new Date(),
            },
            create: {
              userId: auth.userId,
              platform: 'epic',
              externalId: game.id,
              gameData: JSON.stringify({ name: game.title, ...game }),
            },
          });
          total += 1;
        }
        await prisma.platformAccount.update({
          where: { id: account.id },
          data: { lastWishlistSyncAt: new Date() },
        });
      }

      if (account.platform === 'amazon') {
        if (!account.accessToken) continue;
        const amazon = new AmazonAPI(account.accessToken);
        const wishlist = await amazon.getWishlist();
        for (const game of wishlist) {
          await prisma.wishlistItem.upsert({
            where: {
              userId_platform_externalId: {
                userId: auth.userId,
                platform: 'amazon',
                externalId: game.id,
              },
            },
            update: {
              gameData: JSON.stringify({ name: game.title, ...game }),
              syncedAt: new Date(),
            },
            create: {
              userId: auth.userId,
              platform: 'amazon',
              externalId: game.id,
              gameData: JSON.stringify({ name: game.title, ...game }),
            },
          });
          total += 1;
        }
        await prisma.platformAccount.update({
          where: { id: account.id },
          data: { lastWishlistSyncAt: new Date() },
        });
      }
    } catch (error) {
      console.error(`Wishlist sync error (${account.platform}):`, error);
      errors.push(`${account.platform}: sync failed`);
    }
  }

  return NextResponse.json({ success: true, itemCount: total, errors });
}
