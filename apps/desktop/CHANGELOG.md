# Changelog — Game Aggregator Launcher

## 1.0.0 — 2026-08-02

### Produto
- Launcher Electron fullscreen com biblioteca unificada (local, Steam, Epic, GOG, Amazon, emulação)
- Dedupe canônico, capas offline, notas RAWG/Steam, wishlist + ITAD
- UX TV/gamepad, perfis desk/TV/handheld, Moonlight, presets de launch
- Onboarding Steam, grade virtualizada, export/import JSON, auto-update (electron-updater)

### Distribuição
- Instalador NSIS Windows x64
- Sem assinatura de código no momento — ver `docs/SMARTSCREEN.md`
- Telemetria/Sentry opt-in (desligada por padrão)

### Notas de upgrade N-1 → N
- Migrations SQLite sobem automaticamente (schema v9+)
- Settings e biblioteca em `%APPDATA%` são preservados
- Sidecars em `resources/bin` precisam ser recolocados se o instalador limpar extras
