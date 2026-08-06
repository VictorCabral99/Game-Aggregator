import { describe, expect, it } from 'vitest';
import { dedupeOrganizeGames } from './discover';
import type { OrganizeGame } from './types';

function item(partial: Partial<OrganizeGame> & Pick<OrganizeGame, 'id' | 'title' | 'currentPath' | 'source'>): OrganizeGame {
  return {
    platform: 'local',
    folder: 'Outros',
    suggestedPath: partial.suggestedPath ?? 'C:\\Games\\Outros\\X',
    sizeBytes: null,
    alreadyStandard: false,
    externalId: partial.externalId ?? partial.id,
    ...partial,
  };
}

describe('dedupeOrganizeGames', () => {
  it('remove o mesmo path com casing diferente e prefere heroic', () => {
    const items = dedupeOrganizeGames([
      item({
        id: 'steam:1',
        title: 'Foo',
        currentPath: 'C:\\Games\\Heroic\\Foo',
        source: 'steam',
        platform: 'steam',
        folder: 'Steam',
      }),
      item({
        id: 'heroic:epic:foo',
        title: 'Foo',
        currentPath: 'c:\\games\\heroic\\foo',
        source: 'heroic',
        platform: 'epic',
        folder: 'Epic',
      }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].source).toBe('heroic');
  });

  it('mantém jogos em paths distintos', () => {
    const items = dedupeOrganizeGames([
      item({
        id: 'heroic:gog:1',
        title: 'A',
        currentPath: 'C:\\Users\\Victor\\Games\\Heroic\\A',
        source: 'heroic',
        platform: 'gog',
        folder: 'GOG',
      }),
      item({
        id: 'heroic:gog:2',
        title: 'B',
        currentPath: 'C:\\Users\\Victor\\Games\\Heroic\\B',
        source: 'heroic',
        platform: 'gog',
        folder: 'GOG',
      }),
    ]);
    expect(items).toHaveLength(2);
  });
});
