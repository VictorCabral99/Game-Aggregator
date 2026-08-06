import { DEFAULT_CONSOLES } from '../emulation/catalog';

const COMMON_REGIONS = [
  '(USA)',
  '(Europe)',
  '(Japan)',
  '(World)',
  '(USA, Europe)',
  '(Japan, USA)',
  '(Europe, USA)',
  '(En, Fr, De, Es, It)',
  '(USA) (Rev 1)',
  '(Europe) (Rev 1)',
];

/** Remove tags de dump `[!]` / `[b]` mas mantém região `(USA)`. */
export function romBasenameForCover(filePathOrTitle: string): string {
  const base = filePathOrTitle.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  return base
    .replace(/\s*\[[^\]]*\]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasRegionTag(title: string): boolean {
  return /\(\s*(USA|Europe|Japan|World|En\b|Fr\b|De\b|Es\b|It\b|UE|JP|US)/i.test(title);
}

/** Variantes de título para Named_Boxarts (No-Intro). */
export function libretroTitleVariants(title: string): string[] {
  const clean = romBasenameForCover(title);
  if (!clean) return [];

  const cores = [
    clean,
    clean.replace(/:/g, ' - '),
    clean.replace(/&/g, 'and'),
    clean.replace(/\s+-\s+/g, ': '),
  ];

  // Se já veio sem "The ", também tenta com; se veio com, tenta sem
  const withThe: string[] = [];
  for (const c of cores) {
    withThe.push(c);
    if (/^The\s+/i.test(c)) withThe.push(c.replace(/^The\s+/i, ''));
    else withThe.push(`The ${c}`);
  }

  const out: string[] = [];
  const push = (s: string) => {
    const t = s.replace(/\s+/g, ' ').trim();
    if (t && !out.includes(t)) out.push(t);
  };

  for (const core of withThe) {
    push(core);
    if (!hasRegionTag(core)) {
      for (const region of COMMON_REGIONS) {
        push(`${core} ${region}`);
      }
    }
  }

  // Limite para não explodir requests (sistemas × variantes)
  return out.slice(0, 40);
}

/** Candidatos de capa no CDN público de thumbnails do Libretro. */
export function libretroCoverCandidates(
  title: string,
  consoleId: string,
  extraTitles: string[] = []
): string[] {
  const fromDefault = DEFAULT_CONSOLES.find((c) => c.id === consoleId)?.libretroSystem;
  const systems = [fromDefault].filter(Boolean) as string[];
  if (consoleId === 'gbc') {
    systems.push('Nintendo - Game Boy');
  }
  if (consoleId === 'gb') {
    systems.push('Nintendo - Game Boy Color');
  }
  if (systems.length === 0) return [];

  const variants = [
    ...libretroTitleVariants(title),
    ...extraTitles.flatMap((t) => libretroTitleVariants(t)),
  ];
  const uniqueVariants = [...new Set(variants)].slice(0, 48);
  if (uniqueVariants.length === 0) return [];

  const urls: string[] = [];
  for (const system of systems) {
    const sysEnc = encodeURIComponent(system);
    for (const variant of uniqueVariants) {
      const nameEnc = encodeURIComponent(variant);
      urls.push(`https://thumbnails.libretro.com/${sysEnc}/Named_Boxarts/${nameEnc}.png`);
    }
  }
  return [...new Set(urls)];
}
