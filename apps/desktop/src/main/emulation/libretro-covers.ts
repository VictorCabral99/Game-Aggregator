import { DEFAULT_CONSOLES } from '../emulation/catalog';

/** Candidatos de capa no CDN público de thumbnails do Libretro. */
export function libretroCoverCandidates(title: string, consoleId: string): string[] {
  const fromDefault = DEFAULT_CONSOLES.find((c) => c.id === consoleId)?.libretroSystem;
  const systems = [fromDefault].filter(Boolean) as string[];
  if (consoleId === 'gbc') {
    systems.push('Nintendo - Game Boy');
  }
  if (systems.length === 0) return [];

  const clean = title.trim();
  if (!clean) return [];

  const variants = [
    clean,
    `The ${clean}`,
    clean.replace(/:/g, ' - '),
    clean.replace(/&/g, 'and'),
  ];

  const urls: string[] = [];
  for (const system of systems) {
    const sysEnc = encodeURIComponent(system);
    for (const variant of [...new Set(variants)]) {
      const nameEnc = encodeURIComponent(variant);
      urls.push(
        `https://thumbnails.libretro.com/${sysEnc}/Named_Boxarts/${nameEnc}.png`
      );
    }
  }
  return urls;
}
