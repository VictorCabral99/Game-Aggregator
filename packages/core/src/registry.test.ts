import { describe, expect, it, vi } from 'vitest';
import { ProviderRegistry } from './registry';
import type { GameProvider, ProviderGame } from './types';

function fakeProvider(
  id: GameProvider['id'],
  opts?: {
    available?: boolean;
    games?: ProviderGame[];
    failScan?: boolean;
  }
): GameProvider {
  return {
    id,
    displayName: id,
    capabilities: {
      scanLibrary: true,
      launch: true,
      install: false,
      playtime: false,
      uninstall: false,
    },
    isAvailable: async () => opts?.available ?? true,
    scan: async () => {
      if (opts?.failScan) throw new Error('scan falhou');
      return opts?.games ?? [];
    },
    launch: async () => ({ ok: true }),
  };
}

describe('ProviderRegistry', () => {
  it('registra, lista e obtém providers', () => {
    const registry = new ProviderRegistry();
    const steam = fakeProvider('steam');
    registry.register(steam);
    expect(registry.get('steam')).toBe(steam);
    expect(registry.list()).toEqual([steam]);
  });

  it('lança ao registrar o mesmo id duas vezes', () => {
    const registry = new ProviderRegistry();
    registry.register(fakeProvider('steam'));
    expect(() => registry.register(fakeProvider('steam'))).toThrow(
      /já registrado/i
    );
  });

  it('unregister remove o provider', () => {
    const registry = new ProviderRegistry();
    registry.register(fakeProvider('epic'));
    expect(registry.unregister('epic')).toBe(true);
    expect(registry.get('epic')).toBeUndefined();
    expect(registry.unregister('epic')).toBe(false);
  });

  it('statusAll reporta disponibilidade e contagem de jogos', async () => {
    const registry = new ProviderRegistry();
    registry.register(
      fakeProvider('steam', {
        available: true,
        games: [
          {
            providerId: 'steam',
            externalId: '1',
            title: 'A',
          },
        ],
      })
    );
    registry.register(fakeProvider('gog', { available: false }));

    const status = await registry.statusAll();
    expect(status.find((s) => s.id === 'steam')).toMatchObject({
      available: true,
      gamesCount: 1,
    });
    expect(status.find((s) => s.id === 'gog')).toMatchObject({
      available: false,
      gamesCount: 0,
    });
  });

  it('statusAll captura erro de scan sem derrubar os demais', async () => {
    const registry = new ProviderRegistry();
    registry.register(fakeProvider('steam', { failScan: true }));
    registry.register(fakeProvider('epic', { available: true, games: [] }));

    const status = await registry.statusAll();
    expect(status.find((s) => s.id === 'steam')?.available).toBe(false);
    expect(status.find((s) => s.id === 'steam')?.error).toMatch(/scan falhou/i);
    expect(status.find((s) => s.id === 'epic')?.available).toBe(true);
  });

  it('statusAll captura rejeição de isAvailable', async () => {
    const registry = new ProviderRegistry();
    const broken: GameProvider = {
      ...fakeProvider('amazon'),
      isAvailable: async () => {
        throw new Error('offline');
      },
    };
    // statusAll usa Promise.allSettled no map; isAvailable throw é catch interno
    registry.register(broken);
    const spy = vi.fn();
    broken.scan = spy;
    const status = await registry.statusAll();
    expect(status[0]).toMatchObject({
      id: 'amazon',
      available: false,
      error: 'offline',
    });
    expect(spy).not.toHaveBeenCalled();
  });
});
