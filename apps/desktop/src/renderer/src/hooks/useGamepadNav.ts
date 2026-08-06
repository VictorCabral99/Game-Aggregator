import { useEffect, useRef } from 'react';

export type InputDevice = 'gamepad' | 'mouse' | 'keyboard';

const DEADZONE = 0.32;
const REPEAT_DELAY_MS = 280;
const REPEAT_INTERVAL_MS = 110;
const CURSOR_HIDE_MS = 3000;
/** Só rouba do gamepad com movimento grande intencional (não drift do Windows). */
const MOUSE_STEAL_FROM_PAD_PX = 120;

interface Options {
  enabled: boolean;
  tvMode: boolean;
  onDeviceChange?: (device: InputDevice) => void;
  onAction?: (action: GamepadAction) => void;
  /** Aviso quando o pad conecta ou ativa. */
  onPadStatus?: (status: { connected: boolean; id: string | null; active: boolean }) => void;
}

export type GamepadAction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'confirm'
  | 'back'
  | 'open'
  | 'search'
  | 'menu'
  | 'emulation'
  | 'filterPrev'
  | 'filterNext';

const AXIS_X = 0;
const AXIS_Y = 1;

export function buttonPressed(pad: Gamepad, i: number): boolean {
  const b = pad.buttons[i];
  if (!b) return false;
  return b.pressed || b.value > 0.5;
}

/** Direção do D-pad / stick / eixos extras (alguns pads Windows). */
export function readNavDir(pad: Gamepad): 'up' | 'down' | 'left' | 'right' | null {
  const axisX = pad.axes[AXIS_X] ?? 0;
  const axisY = pad.axes[AXIS_Y] ?? 0;
  if (Math.abs(axisX) > DEADZONE || Math.abs(axisY) > DEADZONE) {
    if (Math.abs(axisX) >= Math.abs(axisY)) return axisX < 0 ? 'left' : 'right';
    return axisY < 0 ? 'up' : 'down';
  }

  for (const [ax, ay] of [
    [2, 3],
    [6, 7],
    [4, 5],
  ] as const) {
    const x = pad.axes[ax];
    const y = pad.axes[ay];
    if (x == null || y == null) continue;
    if (Math.abs(x) > 0.5 || Math.abs(y) > 0.5) {
      if (Math.abs(x) >= Math.abs(y)) return x < 0 ? 'left' : 'right';
      return y < 0 ? 'up' : 'down';
    }
  }

  if (buttonPressed(pad, 12)) return 'up';
  if (buttonPressed(pad, 13)) return 'down';
  if (buttonPressed(pad, 14)) return 'left';
  if (buttonPressed(pad, 15)) return 'right';
  return null;
}

export function anyInput(pad: Gamepad): boolean {
  if (readNavDir(pad)) return true;
  for (let i = 0; i < pad.buttons.length; i += 1) {
    if (buttonPressed(pad, i)) return true;
  }
  for (let i = 0; i < pad.axes.length; i += 1) {
    const v = pad.axes[i] ?? 0;
    if (Math.abs(v) > DEADZONE) return true;
  }
  return false;
}

/** Prefere o pad que está gerando input; senão o primeiro conectado. */
export function pickActivePad(): Gamepad | null {
  const pads = navigator.getGamepads?.() ?? [];
  let fallback: Gamepad | null = null;
  for (const p of pads) {
    if (!p || !p.connected) continue;
    if (!fallback) fallback = p;
    if (anyInput(p)) return p;
  }
  return fallback;
}

export function useGamepadNav({
  enabled,
  tvMode,
  onDeviceChange,
  onAction,
  onPadStatus,
}: Options): void {
  const state = useRef({
    device: 'keyboard' as InputDevice,
    buttons: new Set<number>(),
    lastCursorHide: 0,
    lastMouse: { x: 0, y: 0 },
    mousePrimed: false,
    lastPadId: null as string | null,
    announcedConnect: false,
  });
  const opts = useRef({ enabled, tvMode, onDeviceChange, onAction, onPadStatus });
  opts.current = { enabled, tvMode, onDeviceChange, onAction, onPadStatus };

  useEffect(() => {
    if (!enabled) return;

    const s = state.current;

    const hideCursor = () => {
      if (opts.current.tvMode) document.body.classList.add('cursor-hidden');
    };
    const showCursor = () => {
      document.body.classList.remove('cursor-hidden');
    };

    const emitStatus = (connected: boolean, id: string | null, active: boolean) => {
      opts.current.onPadStatus?.({ connected, id, active });
    };

    const markMouse = () => {
      if (s.device !== 'mouse') {
        s.device = 'mouse';
        opts.current.onDeviceChange?.('mouse');
        showCursor();
        emitStatus(Boolean(s.lastPadId), s.lastPadId, false);
      }
      if (opts.current.tvMode) s.lastCursorHide = Date.now();
    };
    const markKeyboard = () => {
      if (s.device !== 'keyboard') {
        s.device = 'keyboard';
        opts.current.onDeviceChange?.('keyboard');
        showCursor();
        emitStatus(Boolean(s.lastPadId), s.lastPadId, false);
      }
    };
    const markGamepad = (pad: Gamepad) => {
      s.lastPadId = pad.id;
      if (s.device !== 'gamepad') {
        s.device = 'gamepad';
        opts.current.onDeviceChange?.('gamepad');
        if (opts.current.tvMode) hideCursor();
        console.log('[gamepad] ativo:', pad.id, 'mapping=', pad.mapping || '(none)');
      }
      emitStatus(true, pad.id, true);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!s.mousePrimed) {
        s.lastMouse = { x: e.clientX, y: e.clientY };
        s.mousePrimed = true;
        return;
      }
      const dx = Math.abs(e.clientX - s.lastMouse.x);
      const dy = Math.abs(e.clientY - s.lastMouse.y);
      s.lastMouse = { x: e.clientX, y: e.clientY };

      // Com gamepad ativo: só movimento grande rouba (evita drift do Windows)
      if (s.device === 'gamepad' && dx + dy < MOUSE_STEAL_FROM_PAD_PX) return;
      markMouse();
    };
    const onMouseDown = () => markMouse();
    const onKeyDown = () => markKeyboard();

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);

    const held = {
      dir: null as 'up' | 'down' | 'left' | 'right' | null,
      since: 0,
      lastFire: 0,
    };

    const fireNav = (dir: 'up' | 'down' | 'left' | 'right', now: number) => {
      const emit = () => opts.current.onAction?.(dir);
      if (held.dir !== dir) {
        held.dir = dir;
        held.since = now;
        held.lastFire = now;
        emit();
        return;
      }
      const delay = now - held.since;
      const sinceFire = now - held.lastFire;
      if (delay >= REPEAT_DELAY_MS && sinceFire >= REPEAT_INTERVAL_MS) {
        held.lastFire = now;
        emit();
      }
    };

    const wasPressed = (i: number) => s.buttons.has(i);
    const edgePress = (pad: Gamepad, i: number): boolean => {
      const nowPressed = buttonPressed(pad, i);
      if (nowPressed && !wasPressed(i)) {
        s.buttons.add(i);
        return true;
      }
      if (!nowPressed) s.buttons.delete(i);
      return false;
    };

    const tick = () => {
      const pad = pickActivePad();
      if (!pad) {
        held.dir = null;
        if (s.lastPadId) {
          s.lastPadId = null;
          s.announcedConnect = false;
          emitStatus(false, null, false);
        }
        return;
      }

      if (!s.announcedConnect || s.lastPadId !== pad.id) {
        s.announcedConnect = true;
        s.lastPadId = pad.id;
        console.log('[gamepad] conectado:', {
          id: pad.id,
          index: pad.index,
          buttons: pad.buttons.length,
          axes: pad.axes.length,
          mapping: pad.mapping || '(none)',
        });
        emitStatus(true, pad.id, s.device === 'gamepad');
      }

      if (anyInput(pad)) markGamepad(pad);
      if (s.device !== 'gamepad') return;

      const now = performance.now();
      const dir = readNavDir(pad);
      if (dir) fireNav(dir, now);
      else held.dir = null;

      // Standard: 0=A, 1=B, 2=X, 3=Y, 4=LB/L1, 5=RB/R1, 8=Select, 9=Start
      if (edgePress(pad, 0)) opts.current.onAction?.('confirm');
      if (edgePress(pad, 1)) opts.current.onAction?.('back');
      if (edgePress(pad, 2)) opts.current.onAction?.('open');
      if (edgePress(pad, 3)) opts.current.onAction?.('search');
      if (edgePress(pad, 4)) opts.current.onAction?.('filterPrev');
      if (edgePress(pad, 5)) opts.current.onAction?.('filterNext');
      if (edgePress(pad, 9)) opts.current.onAction?.('menu');
      if (edgePress(pad, 8)) opts.current.onAction?.('emulation');

      if (opts.current.tvMode && Date.now() - s.lastCursorHide > CURSOR_HIDE_MS) {
        hideCursor();
      }
    };

    let raf = 0;
    const loop = () => {
      tick();
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);

    const onConnected = (e: Event) => {
      void navigator.getGamepads?.();
      const ge = e as GamepadEvent;
      console.log('[gamepad] gamepadconnected', ge.gamepad?.id);
      if (ge.gamepad) {
        s.lastPadId = ge.gamepad.id;
        s.announcedConnect = true;
        emitStatus(true, ge.gamepad.id, false);
        if (anyInput(ge.gamepad)) markGamepad(ge.gamepad);
      }
    };
    const onDisconnected = (e: Event) => {
      const ge = e as GamepadEvent;
      console.log('[gamepad] gamepaddisconnected', ge.gamepad?.id);
      s.buttons.clear();
      s.announcedConnect = false;
      s.lastPadId = null;
      emitStatus(false, null, false);
      if (s.device === 'gamepad') {
        s.device = 'keyboard';
        opts.current.onDeviceChange?.('keyboard');
      }
    };
    window.addEventListener('gamepadconnected', onConnected);
    window.addEventListener('gamepaddisconnected', onDisconnected);
    void navigator.getGamepads?.();

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('gamepadconnected', onConnected);
      window.removeEventListener('gamepaddisconnected', onDisconnected);
      window.cancelAnimationFrame(raf);
      showCursor();
    };
  }, [enabled]);
}
