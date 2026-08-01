import { NextResponse } from 'next/server';
import { requireUserId, sleep } from '@/lib/auth-helpers';
import { ITADAPI } from '@/lib/itad-api';
import { prisma } from '@/lib/prisma';

const LOOKUP_DELAY_MS = 200;

export async function POST() {
  const auth = await requireUserId();
  if ('error' in auth) return auth.error;

  if (!process.env.ITAD_API_KEY) {
    return NextResponse.json(
      { error: 'ITAD_API_KEY is not configured' },
      { status: 503 }
    );
  }

  const items = await prisma.wishlistItem.findMany({
    where: { userId: auth.userId },
    include: { deals: true },
  });

  const itad = new ITADAPI(
    process.env.ITAD_API_KEY,
    process.env.ITAD_COUNTRY || 'BR'
  );

  // Resolve ITAD IDs
  const resolved: { wishlistItemId: string; itadId: string; slug: string | null }[] =
    [];

  for (const item of items) {
    try {
      const gameData =
        typeof item.gameData === 'string'
          ? JSON.parse(item.gameData)
          : item.gameData;

      const existing = item.deals.find((d) => d.source === 'itad' && d.externalId);
      if (existing?.externalId) {
        resolved.push({
          wishlistItemId: item.id,
          itadId: existing.externalId,
          slug: null,
        });
        continue;
      }

      const deal = await itad.getDealForGame({
        appid: item.platform === 'steam' ? item.externalId : gameData.appid,
        title: gameData.name || gameData.title,
      });

      if (deal) {
        resolved.push({
          wishlistItemId: item.id,
          itadId: deal.itadId,
          slug: deal.slug,
        });

        await prisma.gameDeal.upsert({
          where: {
            wishlistItemId_source: {
              wishlistItemId: item.id,
              source: 'itad',
            },
          },
          update: {
            externalId: deal.itadId,
            currentPrice: deal.currentPrice,
            regularPrice: deal.regularPrice,
            currency: deal.currency,
            cut: deal.cut,
            shopName: deal.shopName,
            historicalLow: deal.historicalLow,
            historicalLowShop: deal.historicalLowShop,
            url: deal.url,
            dealData: JSON.stringify(deal),
            lastUpdated: new Date(),
          },
          create: {
            wishlistItemId: item.id,
            source: 'itad',
            externalId: deal.itadId,
            currentPrice: deal.currentPrice,
            regularPrice: deal.regularPrice,
            currency: deal.currency,
            cut: deal.cut,
            shopName: deal.shopName,
            historicalLow: deal.historicalLow,
            historicalLowShop: deal.historicalLowShop,
            url: deal.url,
            dealData: JSON.stringify(deal),
          },
        });
      }

      await sleep(LOOKUP_DELAY_MS);
    } catch (error) {
      console.error('ITAD lookup error:', error);
    }
  }

  // Batch overview refresh for known IDs (chunks of 200)
  const uniqueIds = Array.from(new Set(resolved.map((r) => r.itadId)));
  for (let i = 0; i < uniqueIds.length; i += 200) {
    const chunk = uniqueIds.slice(i, i + 200);
    try {
      const overview = await itad.getOverview(chunk);
      for (const price of overview.prices) {
        const matches = resolved.filter((r) => r.itadId === price.id);
        for (const match of matches) {
          await prisma.gameDeal.upsert({
            where: {
              wishlistItemId_source: {
                wishlistItemId: match.wishlistItemId,
                source: 'itad',
              },
            },
            update: {
              externalId: price.id,
              currentPrice: price.current?.price.amount ?? null,
              regularPrice: price.current?.regular.amount ?? null,
              currency:
                price.current?.price.currency ??
                price.lowest?.price.currency ??
                null,
              cut: price.current?.cut ?? null,
              shopName: price.current?.shop.name ?? null,
              historicalLow: price.lowest?.price.amount ?? null,
              historicalLowShop: price.lowest?.shop.name ?? null,
              url:
                price.urls?.game ||
                (match.slug
                  ? `https://isthereanydeal.com/game/${match.slug}/info/`
                  : null),
              dealData: JSON.stringify(price),
              lastUpdated: new Date(),
            },
            create: {
              wishlistItemId: match.wishlistItemId,
              source: 'itad',
              externalId: price.id,
              currentPrice: price.current?.price.amount ?? null,
              regularPrice: price.current?.regular.amount ?? null,
              currency:
                price.current?.price.currency ??
                price.lowest?.price.currency ??
                null,
              cut: price.current?.cut ?? null,
              shopName: price.current?.shop.name ?? null,
              historicalLow: price.lowest?.price.amount ?? null,
              historicalLowShop: price.lowest?.shop.name ?? null,
              url: price.urls?.game || null,
              dealData: JSON.stringify(price),
            },
          });
        }
      }
    } catch (error) {
      console.error('ITAD overview batch error:', error);
    }
  }

  await prisma.user.update({
    where: { id: auth.userId },
    data: { lastDealsSyncAt: new Date() },
  });

  return NextResponse.json({
    success: true,
    updated: resolved.length,
    total: items.length,
  });
}
