# ADR 0002 — Navegação espacial (TV/gamepad)

**Data:** 2026-08-02
**Status:** Aceito

## Contexto

Fase 5 pede experiência console/TV: com controle, abrir o app → navegar a grade →
abrir detalhe → jogar → voltar, sem mouse. O launcher já tem navegação por teclado
(setas + Enter) na grade e teclas de atalho (Ctrl+N, Delete…) em modais.

Duas opções para foco 2D:

1. **Biblioteca de spatial nav** (ex.: react-arborist / roving tabindex + libs de
   gamepad) — mais robusta, porém outro runtime + curva de adaptação da UI atual.
2. **Engine próprio fino**: um hook `useGamepadNav` que traduz input de gamepad
   (d-pad, left stick, botões A/B/X/Y/Start) em eventos de teclado padrão
   (`ArrowLeft/Right/Up/Down`, `Enter`, `Escape`, atalhos). O app inteiro já
   responde a teclado, então o gamepad "vira teclado".

## Decisão

**Engine próprio** (opção 2), com:

- `useGamepadNav` (renderer): poll `navigator.getGamepads()` via `requestAnimationFrame`,
  repeat delay, e **ações diretas** (`onAction`) + foco espacial (`spatialFocus`) —
  não depende mais de teclas sintéticas.
- Mapa: A=confirm, B=back, X=open, Y=search, Start=settings, Select=emulation.
- **Last input device wins**, com cuidado no mouse: com gamepad ativo, só clique ou
  movimento ≥ ~120px troca para mouse (micro-drift do Windows não “mata” o pad).
- Toast em `gamepadconnected` / ativação; logs `[gamepad]` no console.
- Foco (`selected` + grade virtual + `data-pad-root`) em `App.tsx` / `spatialFocus`.

## Consequências

- Zero dependência nova; gamepad "reusa" todo o fluxo de teclado já testado.
- Limitação aceita: foco em modais é sequencial (Enter/Escape), não "pixel-perfect"
  como libs de spatial nav — suficiente para o MVP console.
- Se mais tarde precisar de foco 2D completo em modais, dá para evoluir o mesmo hook.
