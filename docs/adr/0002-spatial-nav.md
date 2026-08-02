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

- `useGamepadNav` (renderer): poll de `navigator.getGamepads()`, debounce + repeat
  delay para navegação contínua, e emissão de `KeyboardEvent`s sintéticos.
- Mapa de botões: A=Enter (confirm/play), B=Escape (back), X=Enter (abrir ficha),
  Y=foco busca, Start=settings, Select=abrir "Emulação".
- **Last input device wins**: se o usuário mexe mouse/teclado, gamepad para de
  emular; se mexe o gamepad, cursor esconde (modo TV) e foco volta à grade.
- O estado de foco (`selected` + colunas) continua em `App.tsx` — nada de lib nova.

## Consequências

- Zero dependência nova; gamepad "reusa" todo o fluxo de teclado já testado.
- Limitação aceita: foco em modais é sequencial (Enter/Escape), não "pixel-perfect"
  como libs de spatial nav — suficiente para o MVP console.
- Se mais tarde precisar de foco 2D completo em modais, dá para evoluir o mesmo hook.
