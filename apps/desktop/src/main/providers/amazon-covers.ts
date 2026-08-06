/**
 * Extrai URL de capa do payload de entitlement Amazon Games (Nile / Heroic).
 * Arte fica em product.productDetail — não em product.productImageUrl.
 */
export function amazonCoverUrlFromProduct(product: Record<string, unknown> | null | undefined): string | undefined {
  if (!product || typeof product !== 'object') return undefined;

  const detail = (product.productDetail as Record<string, unknown> | undefined) || {};
  const details = (detail.details as Record<string, unknown> | undefined) || {};

  const candidates = [
    detail.iconUrl,
    details.logoUrl,
    details.backgroundUrl2,
    details.backgroundUrl1,
    product.productImageUrl,
    product.iconUrl,
  ];

  for (const raw of candidates) {
    if (typeof raw !== 'string') continue;
    const url = raw.trim();
    if (!url) continue;
    if (url.startsWith('//')) return `https:${url}`;
    return url;
  }
  return undefined;
}
