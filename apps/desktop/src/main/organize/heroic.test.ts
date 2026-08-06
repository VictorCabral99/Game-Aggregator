import { describe, expect, it } from 'vitest';
import { parseGogInstalled, parseLegendaryInstalled, parseNileInstalled } from './heroic';
import path from 'node:path';

const ROOT = 'C:\\Games';

describe('organize/heroic parsers', () => {
  it('parseia Legendary installed.json (Cozy Grove)', () => {
    const data = {
      CozyGrove: {
        app_name: 'CozyGrove',
        title: 'Cozy Grove',
        install_path: 'C:\\Users\\Victor\\Games\\Heroic\\CozyGrove',
        install_size: 123456,
        is_dlc: false,
      },
      SomeDlc: {
        app_name: 'SomeDlc',
        title: 'DLC',
        install_path: 'C:\\x',
        is_dlc: true,
      },
    };
    const items = parseLegendaryInstalled(data, ROOT);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Cozy Grove');
    expect(items[0].platform).toBe('epic');
    expect(items[0].externalId).toBe('CozyGrove');
    expect(items[0].folder).toBe('Epic');
    expect(items[0].suggestedPath).toBe(path.join(ROOT, 'Epic', 'Cozy Grove'));
    expect(items[0].alreadyStandard).toBe(false);
    expect(items[0].id).toBe('heroic:epic:CozyGrove');
  });

  it('parseia GOG installed.json (Moonscars) em lista', () => {
    const data = {
      installed: [
        {
          appName: '2106173825',
          install_path: 'C:\\Users\\Victor\\Games\\Heroic\\Moonscars',
          size: 999,
        },
      ],
    };
    const items = parseGogInstalled(data, ROOT);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Moonscars');
    expect(items[0].platform).toBe('gog');
    expect(items[0].suggestedPath).toBe(path.join(ROOT, 'GOG', 'Moonscars'));
  });

  it('parseia Nile installed.json (Clouds & Sheep 2)', () => {
    const data = [
      {
        id: 'amzn1.adg.product.2cbd524e-6778-4f53-b367-b3255aca792c',
        path: 'C:\\\\Users\\\\Victor\\\\Games\\\\Heroic\\\\Clouds & Sheep 2',
        size: 50,
      },
    ];
    const items = parseNileInstalled(data, ROOT);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Clouds & Sheep 2');
    expect(items[0].platform).toBe('amazon');
    expect(items[0].folder).toBe('Luna');
    expect(items[0].suggestedPath).toBe(path.join(ROOT, 'Luna', 'Clouds & Sheep 2'));
  });

  it('marca alreadyStandard quando já está em C:\\Games\\GOG', () => {
    const data = {
      installed: [
        {
          appName: '1',
          title: 'Moonscars',
          install_path: 'C:\\Games\\GOG\\Moonscars',
        },
      ],
    };
    const items = parseGogInstalled(data, ROOT);
    expect(items[0].alreadyStandard).toBe(true);
  });
});
