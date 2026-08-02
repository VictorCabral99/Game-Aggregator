import path from 'node:path';

/** Título limpo a partir do filename (P4-10). */
export function cleanRomTitle(filePath: string): string {
  const base = path.basename(filePath);
  const noExt = base.replace(/\.[^.]+$/, '');
  return (
    noExt
      // No-Intro: "(USA)", "(Europe)", "[!]", etc.
      .replace(/\s*\([^)]*\)\s*/g, ' ')
      // TOSEC: "(USA)", " (En,Fr)", etc. + region codes
      .replace(/\s*\[[^\]]*\]\s*/g, ' ')
      // Revision suffix: " v1.1", " (Rev 1)"
      .replace(/\s*v\d+(\.\d+)?\s*$/i, '')
      .replace(/\s*\(Rev \d+\)\s*/g, ' ')
      .replace(/^The\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

export function isValidRom(file: string, extensions: string[]): boolean {
  const ext = path.extname(file).toLowerCase();
  return extensions.some((e) => e.toLowerCase() === ext);
}

export function isHiddenEntry(name: string): boolean {
  return name.startsWith('.') || name.startsWith('$') || name === 'System Volume Information';
}
