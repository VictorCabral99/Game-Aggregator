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

async function ensureEpicToken(account: {
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
    const refreshed = await EpicAPI.refresh(account.refreshToken);
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
  if (!token) throw new Error('Epic access token missing');
  return token;
}

async function ensureAmazonToken(account: {
  id: string;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  metadata: string | null;
}) {
  let token = account.accessToken;
  const meta = account.metadata
    ? (JSON.parse(account.metadata) as { serial?: string; nile?: boolean })
    : {};
  const serial = meta.serial || '';

  if (
    (!token ||
      (account.tokenExpiresAt &&
        account.tokenExpiresAt.getTime() < Date.now() + 60_000)) &&
    account.refreshToken
  ) {
    const refreshed = await AmazonAPI.refresh(account.refreshToken);
    token = refreshed.access_token;
    await prisma.platformAccount.update({
      where: { id: account.id },
      data: {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token || account.refreshToken,
        tokenExpiresAt: refreshed.expires_in
          ? new Date(Date.now() + Number(refreshed.expires_in) * 1000)
          : null,
      },
    });
  }

  if (!token) throw new Error('Amazon access token missing');
  if (!serial) throw new Error('Amazon device serial missing — reconecte a loja');
  return { token, serial };
}

export async function GET() {
  const auth = await requireUserId();
  if ('error' in auth) return auth.error;

  const games = await prisma.gameLibrary.findMany({
    where: { userId: auth.userId },
    include: { ratings: true },
    orderBy: { syncedAt: 'desc' },
  });

  return NextResponse.json({ games });
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

        // Keep persona name fresh for the store card
        let displayName = account.displayName;
        try {
          const summaries = await steam.getPlayerSummaries([
            account.externalUserId,
          ]);
          const persona =
            summaries?.response?.players?.[0]?.personaname || null;
          if (persona) displayName = persona;
        } catch {
          // keep existing displayName
        }

        const owned = await steam.getOwnedGames(account.externalUserId);
        for (const game of owned.response.games || []) {
          await prisma.gameLibrary.upsert({
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
          data: {
            lastLibrarySyncAt: new Date(),
            ...(displayName ? { displayName } : {}),
          },
        });
      }

      if (account.platform === 'gog') {
        const token = await ensureGogToken(account);
        const gog = new GogAPI(token);
        const owned = await gog.getOwnedGames();
        for (const game of owned) {
          await prisma.gameLibrary.upsert({
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
          data: { lastLibrarySyncAt: new Date() },
        });
      }

      if (account.platform === 'epic') {
        const token = await ensureEpicToken(account);
        const epic = new EpicAPI(token);
        const owned = await epic.getOwnedGames();
        for (const game of owned) {
          await prisma.gameLibrary.upsert({
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
          data: { lastLibrarySyncAt: new Date() },
        });
      }

      if (account.platform === 'amazon') {
        const { token, serial } = await ensureAmazonToken(account);
        const amazon = new AmazonAPI(token, serial);
        const owned = await amazon.getOwnedGames();
        for (const game of owned) {
          await prisma.gameLibrary.upsert({
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
          data: { lastLibrarySyncAt: new Date() },
        });
      }
    } catch (error) {
      console.error(`Library sync error (${account.platform}):`, error);
      const detail =
        error instanceof Error ? error.message : 'sync failed';
      errors.push(`${account.platform}: ${detail}`);
    }
  }

  return NextResponse.json({ success: true, gameCount: total, errors });
}
