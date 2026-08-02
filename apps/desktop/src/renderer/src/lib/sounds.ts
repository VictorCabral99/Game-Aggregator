let ctx: AudioContext | null = null;
let enabled = false;

export function setSoundsEnabled(value: boolean): void {
  enabled = value;
}

function ensureCtx(): AudioContext | null {
  if (!enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function beep(freq: number, dur: number, gain: number): void {
  const c = ensureCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  osc.connect(g).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + dur);
}

export function uiMove(): void {
  beep(520, 0.045, 0.04);
}

export function uiSelect(): void {
  beep(760, 0.07, 0.06);
}

export function uiBack(): void {
  beep(330, 0.08, 0.05);
}
