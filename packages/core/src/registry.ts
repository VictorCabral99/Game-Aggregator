import type { GameProvider, PlatformId, ProviderStatus } from './types';

/**
 * Registry em runtime: providers se registram pelo id e são consultados
 * pela UI sem conhecer implementações concretas.
 */
export class ProviderRegistry {
  private providers = new Map<PlatformId, GameProvider>();

  register(provider: GameProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`Provider já registrado: ${provider.id}`);
    }
    this.providers.set(provider.id, provider);
  }

  unregister(id: PlatformId): boolean {
    return this.providers.delete(id);
  }

  get(id: PlatformId): GameProvider | undefined {
    return this.providers.get(id);
  }

  list(): GameProvider[] {
    return [...this.providers.values()];
  }

  async statusAll(): Promise<ProviderStatus[]> {
    const results = await Promise.allSettled(
      this.list().map(async (p) => {
        try {
          const available = await p.isAvailable();
          const games = available ? (await p.scan()).length : 0;
          return {
            id: p.id,
            available,
            gamesCount: games,
          } satisfies ProviderStatus;
        } catch (err) {
          return {
            id: p.id,
            available: false,
            error: err instanceof Error ? err.message : String(err),
          } satisfies ProviderStatus;
        }
      })
    );

    return results.map((r, i) => {
      const id = this.list()[i].id;
      if (r.status === 'fulfilled') return r.value;
      return {
        id,
        available: false,
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      } satisfies ProviderStatus;
    });
  }
}

export const registry = new ProviderRegistry();
