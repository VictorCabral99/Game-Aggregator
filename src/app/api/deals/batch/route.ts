import { NextRequest, NextResponse } from 'next/server';
import { requireUserId, sleep, mapPool } from '@/lib/auth-helpers';
import { ITADAPI } from '@/lib/itad-api';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const LOOKUP_DELAY_MS = 120;
const CONCURRENCY = 2;
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;

function ndjsonResponse(
  write: (send: (obj: unknown) => void) => Promise<void>
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      };
      try {
        await write(send);
      } catch (error) {
        console.error('Deals stream error:', error);
        send({ type: 'error', error: 'Falha ao buscar preços' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireUserId();
  if ('error' in auth) return auth.error;

  if (!process.env.ITAD_API_KEY) {
    return NextResponse.json(
      { error: 'ITAD_API_KEY is not configured' },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const force = Boolean(body?.force);

  const items = await prisma.wishlistItem.findMany({
    where: { userId: auth.userId },
    include: { deals: true },
  });

  const staleCutoff = Date.now() - FRESH_MS;
  const eligible = items.filter((item) => {
    if (force) return true;
    const deal = item.deals.find((d) => d.source === 'itad');
    if (!deal || deal.currentPrice === null) return true;
    return deal.lastUpdated.getTime() < staleCutoff;
  });

  const itad = new ITADAPI(
    process.env.ITAD_API_KEY,
    process.env.ITAD_COUNTRY || 'BR'
  );

  return ndjsonResponse(async (send) => {
    send({
      type: 'meta',
      totalEligible: eligible.length,
      scanned: eligible.length,
      remaining: 0,
      total: items.length,
      concurrency: CONCURRENCY,
    });

    if (eligible.length === 0) {
      send({
        type: 'done',
        updated: 0,
        scanned: 0,
        remaining: 0,
        totalEligible: 0,
        total: items.length,
      });
      return;
    }

    let updated = 0;
    let completed = 0;
    let authError: string | null = null;

    await mapPool(eligible, CONCURRENCY, async (item) => {
      if (authError) {
        completed += 1;
        return;
      }
      try {
        const gameData =
          typeof item.gameData === 'string'
            ? JSON.parse(item.gameData)
            : item.gameData;
        const title = String(gameData.name || gameData.title || 'Jogo');

        send({
          type: 'looking',
          title,
          current: completed,
          total: eligible.length,
        });
        await sleep(10);

        const existing = item.deals.find(
          (d) => d.source === 'itad' && d.externalId
        );

        let dealInfo: {
          itadId: string;
          slug: string | null;
          currentPrice: number | null;
          regularPrice: number | null;
          currency: string | null;
          cut: number | null;
          shopName: string | null;
          historicalLow: number | null;
          historicalLowShop: string | null;
          url: string | null;
        } | null = null;

        if (existing?.externalId && !force) {
          const overview = await itad.getOverview([existing.externalId]);
          const price = overview.prices.find((p) => p.id === existing.externalId);
          if (price) {
            dealInfo = {
              itadId: existing.externalId,
              slug: null,
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
            };
          }
        } else {
          const deal = await itad.getDealForGame({
            appid: item.platform === 'steam' ? item.externalId : gameData.appid,
            title: gameData.name || gameData.title,
          });
          if (deal) {
            dealInfo = {
              itadId: deal.itadId,
              slug: deal.slug,
              currentPrice: deal.currentPrice,
              regularPrice: deal.regularPrice,
              currency: deal.currency,
              cut: deal.cut,
              shopName: deal.shopName,
              historicalLow: deal.historicalLow,
              historicalLowShop: deal.historicalLowShop,
              url: deal.url,
            };
          }
        }

        if (dealInfo) {
          await prisma.gameDeal.upsert({
            where: {
              wishlistItemId_source: {
                wishlistItemId: item.id,
                source: 'itad',
              },
            },
            update: {
              externalId: dealInfo.itadId,
              currentPrice: dealInfo.currentPrice,
              regularPrice: dealInfo.regularPrice,
              currency: dealInfo.currency,
              cut: dealInfo.cut,
              shopName: dealInfo.shopName,
              historicalLow: dealInfo.historicalLow,
              historicalLowShop: dealInfo.historicalLowShop,
              url:
                dealInfo.url ||
                (dealInfo.slug
                  ? `https://isthereanydeal.com/game/${dealInfo.slug}/info/`
                  : null),
              dealData: JSON.stringify(dealInfo),
              lastUpdated: new Date(),
            },
            create: {
              wishlistItemId: item.id,
              source: 'itad',
              externalId: dealInfo.itadId,
              currentPrice: dealInfo.currentPrice,
              regularPrice: dealInfo.regularPrice,
              currency: dealInfo.currency,
              cut: dealInfo.cut,
              shopName: dealInfo.shopName,
              historicalLow: dealInfo.historicalLow,
              historicalLowShop: dealInfo.historicalLowShop,
              url:
                dealInfo.url ||
                (dealInfo.slug
                  ? `https://isthereanydeal.com/game/${dealInfo.slug}/info/`
                  : null),
              dealData: JSON.stringify(dealInfo),
            },
          });
          updated += 1;
        }

        completed += 1;
        send({
          type: 'item',
          title,
          currentPrice: dealInfo?.currentPrice ?? null,
          currency: dealInfo?.currency ?? null,
          cut: dealInfo?.cut ?? null,
          shopName: dealInfo?.shopName ?? null,
          current: completed,
          total: eligible.length,
        });

        await sleep(LOOKUP_DELAY_MS);
      } catch (error) {
        completed += 1;
        const msg = error instanceof Error ? error.message : 'ITAD lookup error';
        console.error('ITAD lookup error:', error);
        if (msg.includes('ITAD_API_KEY') || msg.includes('ITAD ')) {
          authError = msg;
          send({ type: 'error', error: msg });
        }
      }
    });

    if (authError) {
      send({ type: 'error', error: authError });
    }

    await prisma.user.update({
      where: { id: auth.userId },
      data: { lastDealsSyncAt: new Date() },
    });

    send({
      type: 'done',
      updated,
      scanned: eligible.length,
      remaining: 0,
      totalEligible: eligible.length,
      total: items.length,
      error: authError,
    });
  });
}
