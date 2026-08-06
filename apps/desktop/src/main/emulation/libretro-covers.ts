import { normalizeGameTitle } from '@gagg/providers-meta';
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

/** Marcadores de sequência (evita DKC2 casar capa do DKC1). */
const SEQUEL_TOKEN_RE = /^(?:\d{1,2}|ii|iii|iv|v|vi|vii|viii|ix|x)$/i;

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

/** Remove anos tipo `(1994)` — comuns em títulos enriquecidos, quebram match exato. */
export function stripYearTags(title: string): string {
  return title
    .replace(/\s*\((?:19|20)\d{2}(?:\s*[-–]\s*(?:19|20)\d{2})?\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Título “nu” para comparar: sem região/rev/meta entre parênteses e sem ano. */
export function stripBoxartMeta(title: string): string {
  return stripYearTags(title)
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasRegionTag(title: string): boolean {
  return /\(\s*(USA|Europe|Japan|World|En\b|Fr\b|De\b|Es\b|It\b|UE|JP|US)/i.test(title);
}

function sequelMarkers(normalized: string): string[] {
  return normalized.split(' ').filter((t) => SEQUEL_TOKEN_RE.test(t));
}

/**
 * Score específico para Named_Boxarts: distingue sequências e ignora anos.
 * Não reusa titleMatchScore (prefixo 800 fazia DKC2/3 virarem DKC1).
 */
export function boxartMatchScore(query: string, candidate: string): number {
  const qBare = normalizeGameTitle(stripBoxartMeta(query));
  const cBare = normalizeGameTitle(stripBoxartMeta(candidate));
  if (!qBare || !cBare) return 0;

  const qMarks = sequelMarkers(qBare);
  const cMarks = sequelMarkers(cBare);
  if (qMarks.join('\0') !== cMarks.join('\0')) return 0;

  if (qBare === cBare) return 1000;

  if (cBare.startsWith(qBare) || qBare.startsWith(cBare)) {
    const longer = qBare.length >= cBare.length ? qBare : cBare;
    const shorter = qBare.length < cBare.length ? qBare : cBare;
    const rest = longer.slice(shorter.length).trim();
    // Prefixo só conta se o resto não começa com token “forte” (número/sequel já filtrado;
    // ainda evita "Metroid" → "Metroid Fusion" empatar como se fosse o mesmo jogo forte).
    if (rest && !rest.startsWith('-')) {
      // "donkey kong country 2 diddy..." vs "donkey kong country 2" → rest = "diddy..." → 750
      return 750;
    }
    return 800;
  }

  if (cBare.includes(qBare) || qBare.includes(cBare)) return 600;

  const qTokens = qBare.split(' ').filter(Boolean);
  const cTokens = new Set(cBare.split(' ').filter(Boolean));
  const overlap = qTokens.filter((t) => cTokens.has(t)).length;
  if (overlap === 0) return 0;
  return 100 + overlap * 50 + (overlap === qTokens.length ? 100 : 0);
}

/** Variantes de título para Named_Boxarts (No-Intro). */
export function libretroTitleVariants(title: string): string[] {
  const clean = stripYearTags(stripDiscTags(romBasenameForCover(title)));
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
  const qList = [
    ...new Set(
      queries
        .map((q) => stripYearTags(stripDiscTags(romBasenameForCover(q))))
        .filter(Boolean)
    ),
  ];
  if (qList.length === 0 || indexedNames.length === 0) return null;

  let best: { name: string; score: number; query: string; specificity: number } | null = null;

  for (const query of qList) {
    const qNorm = normalizeGameTitle(stripBoxartMeta(query));
    for (const name of indexedNames) {
      const score = boxartMatchScore(query, name);
      // Empate: prefere boxart cujo título nu é mais próximo do query (evita 1º do índice ganhar)
      const cNorm = normalizeGameTitle(stripBoxartMeta(name));
      const specificity = qNorm && cNorm ? -Math.abs(cNorm.length - qNorm.length) : -999;
      if (
        !best ||
        score > best.score ||
        (score === best.score && specificity > best.specificity)
      ) {
        best = { name, score, query, specificity };
      }
    }
    // Atalho: match exato
    if (best && best.score >= 1000) break;
  }

  if (!best || best.score < BOXART_MATCH_THRESHOLD) return null;
  return { name: best.name, score: best.score, query: best.query };
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
