import { useEffect, useRef } from 'react';

export type InputDevice = 'gamepad' | 'mouse' | 'keyboard';

const DEADZONE = 0.55;
const REPEAT_DELAY_MS = 300;
const REPEAT_INTERVAL_MS = 130;
const CURSOR_HIDE_MS = 3000;

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

function fireKey(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

const AXIS_X = 0;
const AXIS_Y = 1;

export function useGamepadNav({
  enabled,
  tvMode,
  onDeviceChange,
  onAction,
}: Options): void {
  const state = useRef({
    device: 'keyboard' as InputDevice,
    axisX: 0,
    axisY: 0,
    dpad: { up: false, down: false, left: false, right: false },
    buttons: new Set<number>(),
    lastCursorHide: 0,
  });
  const opts = useRef({ enabled, tvMode, onDeviceChange, onAction });
  opts.current = { enabled, tvMode, onDeviceChange, onAction };

  useEffect(() => {
    const s = state.current;

    const hideCursor = () => {
      if (opts.current.tvMode) {
        document.body.classList.add('cursor-hidden');
      }
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
      if (opts.current.tvMode) {
        s.lastCursorHide = Date.now();
      }
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

    const onMouseMove = () => markMouse();
    const onMouseDown = () => markMouse();
    const onKeyDown = () => markKeyboard();
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);

    let poll: number | null = null;
    const held = {
      dir: null as 'up' | 'down' | 'left' | 'right' | null,
      since: 0,
      lastFire: 0,
    };

    const sendNav = (dir: 'up' | 'down' | 'left' | 'right', now: number) => {
      if (held.dir !== dir) {
        held.dir = dir;
        held.since = now;
        held.lastFire = now;
        fireKey({ up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[dir]);
        return;
      }
      const delay = now - held.since;
      const sinceFire = now - held.lastFire;
      if (delay >= REPEAT_DELAY_MS && sinceFire >= REPEAT_INTERVAL_MS) {
        held.lastFire = now;
        fireKey({ up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[dir]);
      }
    };

    const readGamepad = () => {
      const pads = navigator.getGamepads();
      const pad = pads.find((p) => p !== null);
      if (!pad) return;

      const axisX = pad.axes[AXIS_X] ?? 0;
      const axisY = pad.axes[AXIS_Y] ?? 0;
      const now = performance.now();
      const navHeld =
        Math.abs(axisX) > DEADZONE ||
        Math.abs(axisY) > DEADZONE ||
        pad.buttons[12]?.pressed ||
        pad.buttons[13]?.pressed ||
        pad.buttons[14]?.pressed ||
        pad.buttons[15]?.pressed;

      if (s.device !== 'gamepad' && navHeld) {
        markGamepad();
        held.since = 0;
        held.lastFire = 0;
      }
      if (s.device !== 'gamepad') return;

      const wasPressed = (i: number) => s.buttons.has(i);
      const press = (i: number) => {
        const nowPressed = pad.buttons[i]?.pressed ?? false;
        if (nowPressed && !wasPressed(i)) {
          s.buttons.add(i);
          return true;
        }
        if (!nowPressed) s.buttons.delete(i);
        return false;
      };

      const navDir = () => {
        if (Math.abs(axisX) > DEADZONE) return axisX < 0 ? 'left' : 'right';
        if (Math.abs(axisY) > DEADZONE) return axisY < 0 ? 'up' : 'down';
        if (pad.buttons[12]?.pressed) return 'up';
        if (pad.buttons[13]?.pressed) return 'down';
        if (pad.buttons[14]?.pressed) return 'left';
        if (pad.buttons[15]?.pressed) return 'right';
        return null;
      };

      const dir = navDir();
      if (dir) {
        sendNav(dir, now);
      } else {
        held.dir = null;
      }

      if (press(0)) {
        fireKey('Enter');
        opts.current.onAction?.('confirm');
      }
      if (press(1)) {
        fireKey('Escape');
        opts.current.onAction?.('back');
      }
      if (press(2)) {
        fireKey('Enter');
        opts.current.onAction?.('open');
      }
      if (press(3)) {
        opts.current.onAction?.('search');
      }
      if (press(9)) {
        opts.current.onAction?.('settings');
      }
      if (press(8)) {
        opts.current.onAction?.('emulation');
      }

      if (opts.current.tvMode && Date.now() - s.lastCursorHide > CURSOR_HIDE_MS) {
        hideCursor();
      }
    };

    if (enabled) {
      poll = window.setInterval(readGamepad, 50);
    }

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
      if (poll !== null) window.clearInterval(poll);
      showCursor();
    };
  }, [enabled]);
}
