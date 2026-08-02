# resources/bin — sidecars

Sidecars (CLIs de lojas) ficam aqui, **fora do git** (`.gitignore` ignora `*.exe`).

| Sidecar | Loja | Origem |
|---------|------|--------|
| `legendary.exe` | Epic | https://github.com/derrod/legendary (releases) |
| `gogdl.exe` | GOG | https://github.com/Heroic-Games-Launcher/heroic-gogdl (releases) |
| `nile.exe` | Amazon | https://github.com/imLinguin/nile (releases) |

Regras:

- Baixar binário Windows e colocar aqui com o nome exato acima.
- Registrar a versão utilizada em `tools/scripts/smoke-sidecars.mjs` (ou README).
- Atribuição/licença de cada CLI no About do app (Fase 2).
- Smoke test: `npm run smoke:sidecars` na raiz.

Steam **não** usa sidecar: é provider próprio (scan + `steam://`).
