import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  anyInput,
  buttonPressed,
  pickActivePad,
  readNavDir,
} from './useGamepadNav';

function fakePad(partial: {
  buttons?: Array<{ pressed: boolean; value: number } | null>;
  axes?: number[];
  connected?: boolean;
  id?: string;
  index?: number;
}): Gamepad {
  const buttons = (partial.buttons ?? []).map((b) =>
    b
      ? ({ pressed: b.pressed, value: b.value, touched: b.pressed } as GamepadButton)
      : ({ pressed: false, value: 0, touched: false } as GamepadButton)
  );
  return {
    id: partial.id ?? 'Test Pad',
    index: partial.index ?? 0,
    connected: partial.connected ?? true,
    mapping: 'standard',
    timestamp: 0,
    axes: partial.axes ?? [0, 0, 0, 0],
    buttons,
    vibrationActuator: null,
  } as unknown as Gamepad;
}

describe('useGamepadNav helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('buttonPressed considera pressed ou value > 0.5', () => {
    const pad = fakePad({
      buttons: [
        { pressed: true, value: 1 },
        { pressed: false, value: 0.6 },
        { pressed: false, value: 0.1 },
      ],
    });
    expect(buttonPressed(pad, 0)).toBe(true);
    expect(buttonPressed(pad, 1)).toBe(true);
    expect(buttonPressed(pad, 2)).toBe(false);
    expect(buttonPressed(pad, 99)).toBe(false);
  });

  it('readNavDir prioriza stick esquerdo e depois D-pad', () => {
    expect(readNavDir(fakePad({ axes: [0.8, 0.1] }))).toBe('right');
    expect(readNavDir(fakePad({ axes: [-0.9, 0.2] }))).toBe('left');
    expect(readNavDir(fakePad({ axes: [0.1, -0.8] }))).toBe('up');
    expect(readNavDir(fakePad({ axes: [0.1, 0.8] }))).toBe('down');

    const dpad = fakePad({
      axes: [0, 0],
      buttons: Array.from({ length: 16 }, (_, i) =>
        i === 14 ? { pressed: true, value: 1 } : { pressed: false, value: 0 }
      ),
    });
    expect(readNavDir(dpad)).toBe('left');
  });

  it('readNavDir ignora deadzone e usa eixos extras', () => {
    expect(readNavDir(fakePad({ axes: [0.1, 0.1] }))).toBeNull();
    expect(readNavDir(fakePad({ axes: [0, 0, 0.9, 0] }))).toBe('right');
  });

  it('anyInput detecta botão ou eixo', () => {
    expect(anyInput(fakePad({ axes: [0, 0], buttons: [] }))).toBe(false);
    expect(
      anyInput(fakePad({ buttons: [{ pressed: true, value: 1 }], axes: [0, 0] }))
    ).toBe(true);
    expect(anyInput(fakePad({ axes: [0.5, 0], buttons: [] }))).toBe(true);
  });

  it('pickActivePad prefere o pad com input', () => {
    const idle = fakePad({ id: 'idle', index: 0, axes: [0, 0], buttons: [] });
    const active = fakePad({
      id: 'active',
      index: 1,
      axes: [0.7, 0],
      buttons: [],
    });
    vi.stubGlobal('navigator', {
      getGamepads: () => [idle, active],
    });
    expect(pickActivePad()?.id).toBe('active');
  });

  it('pickActivePad cai no primeiro conectado se ninguém tem input', () => {
    const a = fakePad({ id: 'a', index: 0 });
    const b = fakePad({ id: 'b', index: 1 });
    vi.stubGlobal('navigator', {
      getGamepads: () => [null, a, b],
    });
    expect(pickActivePad()?.id).toBe('a');
  });
});
