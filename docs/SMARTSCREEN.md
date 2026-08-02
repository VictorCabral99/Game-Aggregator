# SmartScreen e assinatura de código

O instalador NSIS do Game Aggregator Launcher **não é assinado** com certificado Authenticode
na v1.0.0 (custo/processo de EV Code Signing fica para uma release futura).

## O que o usuário vê

No Windows 10/11, o SmartScreen pode mostrar:

> O Windows protegeu o computador — O Windows não reconheceu este aplicativo

Isso é esperado para publishers sem certificado. O app continua seguro se veio do
release oficial do repositório.

## Como instalar mesmo assim

1. Clique em **Mais informações**
2. Clique em **Executar mesmo assim**
3. Conclua o wizard NSIS

## Assinatura (quando houver certificado)

Com um `.pfx` / Azure Trusted Signing:

```yml
# electron-builder.yml (exemplo)
win:
  certificateFile: path/to/cert.pfx
  certificatePassword: ${WIN_CSC_KEY_PASSWORD}
  signingHashAlgorithms: [sha256]
```

Ou via env `CSC_LINK` / `CSC_KEY_PASSWORD` no CI. Depois de assinado + reputação acumulada,
o SmartScreen deixa de bloquear.

## Verificação da build

- Compare o hash SHA256 do instalador com o publicado nas Release Notes do GitHub.
- Não baixe o `.exe` de mirrors não oficiais.
