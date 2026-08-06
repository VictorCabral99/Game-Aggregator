/** Capa Steam CDN — header é o mais estável pra wishlist. */
export function steamWishlistCoverUrl(appId: number | string): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
}

export function steamWishlistCoverFallbacks(appId: number | string): string[] {
  const id = String(appId);
  return [
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`,
    `https://cdn.akamai.steamstatic.com/steam/apps/${id}/header.jpg`,
  ];
}

export function wishlistCoverUrl(entry: {
  coverUrl?: string | null;
  steamAppId?: string | null;
}): string | null {
  if (entry.coverUrl?.trim()) return entry.coverUrl.trim();
  if (entry.steamAppId?.trim()) return steamWishlistCoverUrl(entry.steamAppId.trim());
  return null;
}

export function wishlistCoverCandidates(entry: {
  coverUrl?: string | null;
  steamAppId?: string | null;
}): string[] {
  const out: string[] = [];
  if (entry.coverUrl?.trim()) out.push(entry.coverUrl.trim());
  if (entry.steamAppId?.trim()) {
    for (const u of steamWishlistCoverFallbacks(entry.steamAppId.trim())) {
      if (!out.includes(u)) out.push(u);
    }
  }
  return out;
}
