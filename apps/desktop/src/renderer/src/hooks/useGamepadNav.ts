import { useEffect, useRef } from 'react';

export type InputDevice = 'gamepad' | 'mouse' | 'keyboard';

const DEADZONE = 0.45;
const REPEAT_DELAY_MS = 280;
const REPEAT_INTERVAL_MS = 120;
const CURSOR_HIDE_MS = 3000;
/** Ignora micro-movimento do mouse enquanto o controle está ativo. */
const MOUSE_STEAL_PX = 8;

interface Options {
  enabled: boolean;
  tvMode: boolean;
  onDeviceChange?: (device: InputDevice) => void;
  onAction?: (action: GamepadAction) => void;
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
  | 'settings'
  | 'emulation';

const AXIS_X = 0;
const AXIS_Y = 1;

function anyPad(): Gamepad | null {
  const pads = navigator.getGamepads?.() ?? [];
  for (const p of pads) {
    if (p && p.connected) return p;
  }
  return null;
}

function buttonPressed(pad: Gamepad, i: number): boolean {
  const b = pad.buttons[i];
  if (!b) return false;
  return b.pressed || b.value > 0.5;
}

/** Direção do D-pad / stick / hat (eixos extras em alguns pads Windows). */
function readNavDir(pad: Gamepad): 'up' | 'down' | 'left' | 'right' | null {
  const axisX = pad.axes[AXIS_X] ?? 0;
  const axisY = pad.axes[AXIS_Y] ?? 0;
  if (Math.abs(axisX) > DEADZONE || Math.abs(axisY) > DEADZONE) {
    if (Math.abs(axisX) >= Math.abs(axisY)) return axisX < 0 ? 'left' : 'right';
    return axisY < 0 ? 'up' : 'down';
  }

  // Hat / D-pad como eixos (comum em alguns drivers)
  for (const [hx, hy] of [
    [6, 7],
    [4, 5],
  ] as const) {
    const x = pad.axes[hx];
    const y = pad.axes[hy];
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

function anyInput(pad: Gamepad): boolean {
  if (readNavDir(pad)) return true;
  for (let i = 0; i < pad.buttons.length; i += 1) {
    if (buttonPressed(pad, i)) return true;
  }
  return false;
}

export function useGamepadNav({
  enabled,
  tvMode,
  onDeviceChange,
  onAction,
}: Options): void {
  const state = useRef({
    device: 'keyboard' as InputDevice,
    buttons: new Set<number>(),
    lastCursorHide: 0,
    lastMouse: { x: 0, y: 0 },
    seenPad: false,
  });
  const opts = useRef({ enabled, tvMode, onDeviceChange, onAction });
  opts.current = { enabled, tvMode, onDeviceChange, onAction };

  useEffect(() => {
    if (!enabled) return;

    const s = state.current;

    const hideCursor = () => {
      if (opts.current.tvMode) document.body.classList.add('cursor-hidden');
    };
    const showCursor = () => {
      document.body.classList.remove('cursor-hidden');
    };

    const markMouse = () => {
      if (s.device !== 'mouse') {
        s.device = 'mouse';
        opts.current.onDeviceChange?.('mouse');
        showCursor();
      }
      if (opts.current.tvMode) s.lastCursorHide = Date.now();
    };
    const markKeyboard = () => {
      if (s.device !== 'keyboard') {
        s.device = 'keyboard';
        opts.current.onDeviceChange?.('keyboard');
        showCursor();
      }
    };
    const markGamepad = () => {
      if (s.device !== 'gamepad') {
        s.device = 'gamepad';
        opts.current.onDeviceChange?.('gamepad');
        if (opts.current.tvMode) hideCursor();
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const dx = Math.abs(e.clientX - s.lastMouse.x);
      const dy = Math.abs(e.clientY - s.lastMouse.y);
      s.lastMouse = { x: e.clientX, y: e.clientY };
      if (s.device === 'gamepad' && dx + dy < MOUSE_STEAL_PX) return;
      markMouse();
    };
    const onMouseDown = () => markMouse();
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignora teclas sintéticas (se algum código ainda disparar)
      if (!e.isTrusted) return;
      markKeyboard();
    };

    window.addEventListener('mousemove', onMouseMove);
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
      const pad = anyPad();
      if (!pad) {
        held.dir = null;
        return;
      }

      // DEBUG: log gamepad detectado
      if (!s.seenPad) {
        console.log('[gamepad] detectado:', {
          id: pad.id,
          index: pad.index,
          connected: pad.connected,
          buttons: pad.buttons.length,
          axes: pad.axes.length,
          mapping: pad.mapping,
        });
      }

      // Precisa de 1 interação do usuário (spec) — qualquer botão/stick ativa
      if (anyInput(pad)) {
        s.seenPad = true;
        markGamepad();
      }
      if (s.device !== 'gamepad') return;

      const now = performance.now();
      const dir = readNavDir(pad);
      if (dir) fireNav(dir, now);
      else held.dir = null;

      // Standard Gamepad: 0=A/Cross, 1=B/Circle, 2=X/Square, 3=Y/Triangle
      if (edgePress(pad, 0)) opts.current.onAction?.('confirm');
      if (edgePress(pad, 1)) opts.current.onAction?.('back');
      if (edgePress(pad, 2)) opts.current.onAction?.('open');
      if (edgePress(pad, 3)) opts.current.onAction?.('search');
      if (edgePress(pad, 9)) opts.current.onAction?.('settings'); // Start
      if (edgePress(pad, 8)) opts.current.onAction?.('emulation'); // Select/Back

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

    const onConnected = () => {
      // força Chromium a atualizar a lista
      void navigator.getGamepads?.();
      console.log('[gamepad] gamepadconnected event fired');
    };
    window.addEventListener('gamepadconnected', onConnected);
    window.addEventListener('gamepaddisconnected', onConnected);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('gamepadconnected', onConnected);
      window.removeEventListener('gamepaddisconnected', onConnected);
      window.cancelAnimationFrame(raf);
      showCursor();
    };
  }, [enabled]);
}
