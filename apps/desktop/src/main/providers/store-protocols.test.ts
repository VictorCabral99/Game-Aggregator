import { describe, expect, it } from 'vitest';
import {
  epicAppUri,
  gogOpenUri,
  isStorePlatform,
  steamInstallUri,
  steamLaunchUri,
} from './store-protocols';

describe('store-protocols', () => {
  it('reconhece plataformas de loja', () => {
    expect(isStorePlatform('steam')).toBe(true);
    expect(isStorePlatform('epic')).toBe(true);
    expect(isStorePlatform('local')).toBe(false);
    expect(isStorePlatform('emulator')).toBe(false);
  });

  it('monta URIs Steam de instalar e iniciar', () => {
    expect(steamInstallUri('570')).toBe('steam://install/570');
    expect(steamLaunchUri('570')).toBe('steam://rungameid/570');
  });

  it('monta URI Epic com namespace + catalog + app', () => {
    const uri = epicAppUri('catalog123', 'installer', {
      namespace: 'ns',
      catalogItemId: 'catalog123',
      appId: 'MyGame',
    });
    expect(uri).toBe(
      'com.epicgames.launcher://apps/ns%3Acatalog123%3AMyGame?action=installer'
    );
  });

  it('monta URI Epic de launch com id composto', () => {
    const uri = epicAppUri('a:b:c', 'launch');
    expect(uri).toBe('com.epicgames.launcher://apps/a%3Ab%3Ac?action=launch');
  });

  it('abre página GOG Galaxy pelo product id', () => {
    expect(gogOpenUri('1207659012')).toBe('goggalaxy://openGameView/1207659012');
  });

  it('Epic sem namespace usa só o artifact (fallback sem launcher oficial)', () => {
    expect(epicAppUri('MyGame', 'launch')).toBe(
      'com.epicgames.launcher://apps/MyGame?action=launch'
    );
  });
});
