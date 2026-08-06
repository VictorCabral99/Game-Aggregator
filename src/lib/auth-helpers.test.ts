import { describe, expect, it, vi } from 'vitest';

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/auth-options', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { isStale, mapPool } from '@/lib/auth-helpers';

describe('isStale', () => {
  it('trata null/undefined como desatualizado', () => {
    expect(isStale(null)).toBe(true);
    expect(isStale(undefined)).toBe(true);
  });

  it('retorna false para datas dentro da janela', () => {
    expect(isStale(new Date(), 24)).toBe(false);
    expect(isStale(new Date(Date.now() - 60 * 60 * 1000), 24)).toBe(false);
  });

  it('retorna true quando a data é mais antiga que o limiar em horas', () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    expect(isStale(old, 24)).toBe(true);
  });
});

describe('mapPool', () => {
  it('processa todos os itens respeitando a concorrência', async () => {
    const seen: number[] = [];
    let active = 0;
    let maxActive = 0;

    await mapPool([1, 2, 3, 4, 5], 2, async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      seen.push(item);
      active -= 1;
    });

    expect(seen.sort()).toEqual([1, 2, 3, 4, 5]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('lida com arrays vazios', async () => {
    const worker = vi.fn();
    await mapPool([], 3, worker);
    expect(worker).not.toHaveBeenCalled();
  });
});
