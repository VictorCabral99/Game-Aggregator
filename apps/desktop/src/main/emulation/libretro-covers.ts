import { titleMatchScore } from '@gagg/providers-meta';
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

const BOXART_MATCH_THRESHOLD = 450;

/** Remove tags de dump `[!]` / `[b]` mas mantém região `(USA)`. */
export function romBasenameForCover(filePathOrTitle: string): string {
  const base = filePathOrTitle.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  return base
    .replace(/_/g, ' ')
    .replace(/\s*\[[^\]]*\]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Remove Disc/CD/Volume para casar a capa “base” do jogo. */
export function stripDiscTags(title: string): string {
  return title
    .replace(/\s*\((?:Disc|Disk|CD|DVD|Volume|Vol\.?)\s*\d+[^)]*\)\s*/gi, ' ')
    .replace(/\s*-\s*(?:Disc|Disk|CD)\s*\d+\s*$/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasRegionTag(title: string): boolean {
  return /\(\s*(USA|Europe|Japan|World|En\b|Fr\b|De\b|Es\b|It\b|UE|JP|US)/i.test(title);
}

/** Variantes de título para Named_Boxarts (No-Intro). */
export function libretroTitleVariants(title: string): string[] {
  const clean = stripDiscTags(romBasenameForCover(title));
  if (!clean) return [];

  const cores = [
    clean,
    clean.replace(/:/g, ' - '),
    clean.replace(/&/g, 'and'),
    clean.replace(/\s+-\s+/g, ': '),
    // Pokemon Emerald → Pokemon - Emerald Version (padrão No-Intro)
    clean.replace(/^Pokemon\s+([A-Za-z]+)$/i, 'Pokemon - $1 Version'),
    clean.replace(/^Pokémon\s+([A-Za-z]+)$/i, 'Pokemon - $1 Version'),
  ];

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

  return out.slice(0, 48);
}

export function libretroSystemsForConsole(consoleId: string): string[] {
  const fromDefault = DEFAULT_CONSOLES.find((c) => c.id === consoleId)?.libretroSystem;
  const systems = [fromDefault].filter(Boolean) as string[];
  if (consoleId === 'gbc') systems.push('Nintendo - Game Boy');
  if (consoleId === 'gb') systems.push('Nintendo - Game Boy Color');
  // aliases comuns de pasta / id
  if (consoleId === 'psx' || consoleId === 'ps') {
    systems.push('Sony - PlayStation');
  }
  if (consoleId === 'md' || consoleId === 'gen') {
    systems.push('Sega - Mega Drive - Genesis');
  }
  return [...new Set(systems)];
}

/**
 * Escolhe o melhor nome de arquivo Named_Boxarts a partir do índice do CDN.
 * Retorna o stem sem `.png`.
 */
export function pickBestBoxartName(queries: string[], indexedNames: string[]): {
  name: string;
  score: number;
  query: string;
} | null {
  const qList = [...new Set(queries.map((q) => stripDiscTags(romBasenameForCover(q))).filter(Boolean))];
  if (qList.length === 0 || indexedNames.length === 0) return null;

  let best: { name: string; score: number; query: string } | null = null;

  for (const query of qList) {
    for (const name of indexedNames) {
      // Pontua contra o nome completo e sem região
      const bare = name.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
      const score = Math.max(titleMatchScore(query, name), titleMatchScore(query, bare));
      if (!best || score > best.score) {
        best = { name, score, query };
      }
    }
    // Atalho: match exato / prefixo forte
    if (best && best.score >= 800) break;
  }

  if (!best || best.score < BOXART_MATCH_THRESHOLD) return null;
  return best;
}

/** Candidatos de capa no CDN (guess URLs — fallback se índice falhar). */
export function libretroCoverCandidates(
  title: string,
  consoleId: string,
  extraTitles: string[] = []
): string[] {
  const systems = libretroSystemsForConsole(consoleId);
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

export function libretroBoxartUrl(system: string, fileStem: string): string {
  return `https://thumbnails.libretro.com/${encodeURIComponent(system)}/Named_Boxarts/${encodeURIComponent(fileStem)}.png`;
}

export { BOXART_MATCH_THRESHOLD };
