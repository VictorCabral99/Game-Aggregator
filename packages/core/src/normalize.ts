/**
 * Normalização de títulos para dedupe/agrupamento de jogos.
 * Regras conservadoras: só agrupa o que é quase certamente o mesmo jogo.
 */

const EDITION_SUFFIXES = [
  'game of the year',
  'game of the year edition',
  'goty edition',
  'definitive edition',
  'ultimate edition',
  'deluxe edition',
  'collectors edition',
  "collector's edition",
  'gold edition',
  'complete edition',
  'complete pack',
  'special edition',
  'standard edition',
  'enhanced edition',
  'anniversary edition',
  'remastered',
  'remake',
];

function stripSuffixes(input: string): string {
  let out = input.trim();
  for (const suffix of EDITION_SUFFIXES) {
    if (out.endsWith(suffix)) {
      out = out.slice(0, -suffix.length).trim();
    }
  }
  return out;
}

function stripBrackets(input: string): string {
  let out = input;
  for (;;) {
    const prev = out;
    out = out.replace(
      /[\[(][^[\]]*(edition|goty|game of the year|definitive|ultimate|deluxe|complete|gold|remastered|remake)[^)\]]*[)\]]/gi,
      ' '
    );
    if (out === prev) break;
  }
  return out.trim();
}

export function normalizeTitle(title: string): string {
  if (!title) return '';
  // Limpeza leve antes do strip: remove ™ ® © e normaliza aspas tipográficas para '
  let out = title
    .replace(/[\u2122\u00ae\u00a9]/g, '')
    .replace(/[\u2018\u2019\u201a\u00b4]/g, "'")
    .replace(/[\u2014\u2013]/g, ' ') // em/en dash → espaço
    .trim()
    .toLowerCase();

  // Strip de edições precisa rodar ANTES de remover pontuação,
  // senão "(GOTY)" vira espaço e nunca é removido.
  out = stripBrackets(out);
  out = stripSuffixes(out);

  return out
    .replace(/'/g, '') // apóstrofos somem: "baldur's gate" == "baldurs gate"
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
