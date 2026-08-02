import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-helpers';
import {
  baseUrl,
  setOAuthCookies,
  randomString,
  EPIC_CLIENT_ID,
} from '@/lib/oauth-helpers';

function epicAuthUrl() {
  // Direct redirect endpoint used by Legendary / GameNative
  return `https://www.epicgames.com/id/api/redirect?clientId=${EPIC_CLIENT_ID}&responseType=code`;
}

function bridgeHtml(authUrl: string, legendaryUrl: string) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Conectar Epic Games</title>
  <style>
    body{font-family:system-ui,sans-serif;background:#0b0b0b;color:#eee;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#1a1a1a;border:1px solid #333;border-radius:16px;max-width:480px;width:100%;padding:28px}
    h1{margin:0 0 8px;font-size:1.5rem}
    p,li{color:#aaa;line-height:1.5;font-size:.95rem}
    ol{padding-left:1.2rem}
    a.btn,button{display:block;width:100%;text-align:center;text-decoration:none;border:0;border-radius:10px;padding:12px 16px;font-weight:700;cursor:pointer;margin-top:12px;box-sizing:border-box}
    a.btn{background:#0078f2;color:#fff}
    a.btn.alt{background:#333;color:#fff}
    input,textarea{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #444;background:#111;color:#fff;margin-top:8px}
    textarea{min-height:90px;font-family:ui-monospace,monospace;font-size:12px}
    button[type=submit]{background:#22c55e;color:#041}
    .muted{font-size:.8rem;color:#777;margin-top:16px}
  </style>
</head>
<body>
  <div class="card">
    <h1>Entrar com Epic Games</h1>
    <p>A Epic devolve um JSON no browser (não redireciona para o nosso site). Siga:</p>
    <ol>
      <li>Clique em <b>Abrir login Epic</b></li>
      <li>Faça login na Epic</li>
      <li>Na página que abrir, copie o JSON inteiro <b>ou</b> só o <code>authorizationCode</code></li>
      <li>Cole abaixo e confirme</li>
    </ol>
    <a class="btn" href="${authUrl}" target="_blank" rel="noopener">Abrir login Epic</a>
    <a class="btn alt" href="${legendaryUrl}" target="_blank" rel="noopener">Alternativa: legendary.gl/epiclogin</a>
    <form method="POST" action="/api/platforms/epic/callback">
      <textarea name="code" placeholder='{"authorizationCode":"..."} ou só o código' required></textarea>
      <button type="submit">Conectar Epic</button>
    </form>
    <p class="muted">Se a Epic mostrar erro de client, use o link alternativo legendary.gl.</p>
  </div>
</body>
</html>`;
}

export async function GET(request: NextRequest) {
  const auth = await requireUserId();
  if ('error' in auth) {
    return NextResponse.redirect(new URL('/auth/signin', baseUrl(request)));
  }

  const state = randomString(16);
  const response = new NextResponse(
    bridgeHtml(epicAuthUrl(), 'https://legendary.gl/epiclogin'),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
  setOAuthCookies(response, 'epic', { state, userId: auth.userId });
  return response;
}
