/**
 * Parser mínimo de VDF (Valve KeyValues) para libraryfolders.vdf e appmanifest_*.acf.
 * Não resolve o formato completo do Source 2 (valve_gc), suficiente para Steam clássico.
 */

export interface VdfNode {
  [key: string]: string | VdfNode;
}

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === '{' || ch === '}') {
      tokens.push(ch);
      i += 1;
      continue;
    }
    if (ch === '"') {
      let s = '';
      i += 1;
      while (i < n) {
        if (text[i] === '\\' && text[i + 1] === '"') {
          s += '"';
          i += 2;
          continue;
        }
        if (text[i] === '\\' && text[i + 1] === '\\') {
          s += '\\';
          i += 2;
          continue;
        }
        if (text[i] === '"') {
          i += 1;
          break;
        }
        s += text[i];
        i += 1;
      }
      tokens.push(s);
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i += 1;
      continue;
    }
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    let s = '';
    while (i < n && !/[\s{}]/.test(text[i])) {
      s += text[i];
      i += 1;
    }
    tokens.push(s);
  }
  return tokens;
}

function parseTokens(tokens: string[], start: number): { node: VdfNode; next: number } {
  const node: VdfNode = {};
  let i = start;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok === '}') return { node, next: i + 1 };
    if (tok === '{') {
      i += 1;
      continue;
    }
    const key = tok;
    const nextTok = tokens[i + 1];
    if (nextTok === '{') {
      const parsed = parseTokens(tokens, i + 2);
      node[key] = parsed.node;
      i = parsed.next;
    } else {
      node[key] = nextTok ?? '';
      i += 2;
    }
  }
  return { node, next: i };
}

export function parseVdf(text: string): VdfNode {
  const { node } = parseTokens(tokenize(text), 0);
  return node;
}

export function vdfGet(node: VdfNode | undefined, key: string): string | null {
  if (!node) return null;
  const v = node[key];
  return typeof v === 'string' ? v : null;
}

/** Extrai a lista de library folders a partir do libraryfolders.vdf. */
export function libraryFoldersFromVdf(root: VdfNode): string[] {
  const out: string[] = [];
  for (const value of Object.values(root)) {
    if (!value || typeof value === 'string') continue;
    const path = vdfGet(value, 'path');
    if (path) {
      out.push(path);
      continue;
    }
    // formato antigo: o próprio valor é o path
    for (const inner of Object.values(value)) {
      if (typeof inner === 'string' && inner.includes(':')) out.push(inner);
    }
  }
  return [...new Set(out)];
}
