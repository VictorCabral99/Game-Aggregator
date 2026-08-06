import { describe, expect, it } from 'vitest';
import { libraryFoldersFromVdf, parseVdf, vdfGet } from './vdf';

describe('parseVdf', () => {
  it('parseia pares chave/valor simples', () => {
    const node = parseVdf(`
"AppState"
{
  "appid"		"730"
  "name"		"Counter-Strike 2"
}
`);
    const app = node.AppState as Record<string, string>;
    expect(app.appid).toBe('730');
    expect(app.name).toBe('Counter-Strike 2');
  });

  it('respeita escape de aspas dentro do valor', () => {
    const node = parseVdf('"root" { "name" "Say \\"hi\\"" }');
    const root = node.root as Record<string, string>;
    expect(root.name).toBe('Say "hi"');
  });

  it('ignora comentários de linha', () => {
    const node = parseVdf(`
"x"
{
  // comment
  "a" "1"
}
`);
    expect(vdfGet(node.x as Record<string, string>, 'a')).toBe('1');
  });
});

describe('vdfGet', () => {
  it('retorna null para nó ausente ou valor não-string', () => {
    expect(vdfGet(undefined, 'a')).toBeNull();
    expect(vdfGet({ nested: { a: '1' } }, 'nested')).toBeNull();
  });

  it('retorna string quando a chave existe', () => {
    expect(vdfGet({ path: 'D:\\Steam' }, 'path')).toBe('D:\\Steam');
  });
});

describe('libraryFoldersFromVdf', () => {
  it('extrai paths do formato moderno (path por pasta)', () => {
    const root = parseVdf(`
"libraryfolders"
{
  "0"
  {
    "path"		"C:\\\\Program Files (x86)\\\\Steam"
  }
  "1"
  {
    "path"		"D:\\\\SteamLibrary"
  }
}
`);
    const folders = libraryFoldersFromVdf(root.libraryfolders as never);
    expect(folders).toContain('C:\\Program Files (x86)\\Steam');
    expect(folders).toContain('D:\\SteamLibrary');
  });

  it('extrai paths do formato antigo (strings com drive dentro do nó)', () => {
    const folders = libraryFoldersFromVdf({
      '0': {
        '1': 'E:\\Games',
        '2': 'F:\\Library',
      },
    });
    expect(folders).toContain('E:\\Games');
    expect(folders).toContain('F:\\Library');
  });

  it('deduplica paths repetidos', () => {
    const folders = libraryFoldersFromVdf({
      '0': { path: 'D:\\Steam' },
      '1': { path: 'D:\\Steam' },
    });
    expect(folders).toEqual(['D:\\Steam']);
  });
});
