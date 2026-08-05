/** Foco espacial para navegação com controle (D-pad / stick). */

export type FocusDir = 'up' | 'down' | 'left' | 'right';

const FOCUSABLE_SEL =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isVisible(el: HTMLElement): boolean {
  if (el.getAttribute('aria-hidden') === 'true') return false;
  if (el.closest('[aria-hidden="true"]')) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

export function getPadRoot(): HTMLElement {
  const roots = Array.from(document.querySelectorAll<HTMLElement>('[data-pad-root]'));
  for (let i = roots.length - 1; i >= 0; i -= 1) {
    const el = roots[i];
    if (el && isVisible(el)) return el;
  }
  const dialog =
    document.querySelector<HTMLElement>('[aria-modal="true"]') ??
    document.querySelector<HTMLElement>('[role="dialog"]') ??
    document.querySelector<HTMLElement>('.modal');
  if (dialog && isVisible(dialog)) return dialog;
  return (
    document.querySelector<HTMLElement>('.app-layout') ??
    document.body
  );
}

export function listFocusables(root: HTMLElement = getPadRoot()): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SEL)).filter(isVisible);
}

function center(el: HTMLElement): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Vizinho mais próximo na direção pedida (score = eixo principal + penalidade perpendicular). */
export function moveFocus(dir: FocusDir, root: HTMLElement = getPadRoot()): HTMLElement | null {
  const items = listFocusables(root);
  if (items.length === 0) return null;

  const active = document.activeElement as HTMLElement | null;
  const current =
    active && root.contains(active) && items.includes(active) ? active : null;

  if (!current) {
    const first = items[0];
    first.focus({ preventScroll: false });
    first.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return first;
  }

  const from = center(current);
  let best: HTMLElement | null = null;
  let bestScore = Infinity;

  for (const el of items) {
    if (el === current) continue;
    const to = center(el);
    const dx = to.x - from.x;
    const dy = to.y - from.y;

    let primary = 0;
    let cross = 0;
    if (dir === 'right') {
      if (dx <= 4) continue;
      primary = dx;
      cross = Math.abs(dy);
    } else if (dir === 'left') {
      if (dx >= -4) continue;
      primary = -dx;
      cross = Math.abs(dy);
    } else if (dir === 'down') {
      if (dy <= 4) continue;
      primary = dy;
      cross = Math.abs(dx);
    } else {
      if (dy >= -4) continue;
      primary = -dy;
      cross = Math.abs(dx);
    }

    // Prefer candidatos alinhados; desempate por distância total.
    const score = primary + cross * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }

  if (!best) return current;
  best.focus({ preventScroll: false });
  best.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return best;
}

export function ensureFocus(root: HTMLElement = getPadRoot()): HTMLElement | null {
  const items = listFocusables(root);
  if (items.length === 0) return null;
  const active = document.activeElement as HTMLElement | null;
  if (active && root.contains(active) && items.includes(active)) return active;
  const first = items[0];
  first.focus({ preventScroll: false });
  return first;
}

export function activateFocused(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') {
    // Já focado — não clicar (evita toggles estranhos).
    return true;
  }
  if (tag === 'SELECT') {
    el.focus();
    return true;
  }
  el.click();
  return true;
}

export function emitEscape(): void {
  const target = document.activeElement ?? document.body;
  const ev = new KeyboardEvent('keydown', {
    key: 'Escape',
    code: 'Escape',
    keyCode: 27,
    which: 27,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(ev);
  if (!ev.defaultPrevented) {
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        which: 27,
        bubbles: true,
        cancelable: true,
      })
    );
  }
}

export function isInsideGrid(el: Element | null): boolean {
  return Boolean(el?.closest('.grid-virtual'));
}

export function focusSelectedCard(): HTMLElement | null {
  const card = document.querySelector<HTMLElement>('.grid-virtual .card--selected');
  if (!card) return null;
  card.focus({ preventScroll: true });
  return card;
}

export function gameIdFromFocusedCard(): string | null {
  const card = (document.activeElement as HTMLElement | null)?.closest('.card');
  if (!card) return null;
  return card.getAttribute('data-game-id');
}
