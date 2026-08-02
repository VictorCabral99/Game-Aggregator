import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-helpers';
import {
  baseUrl,
  setOAuthCookies,
  randomString,
} from '@/lib/oauth-helpers';
import { AmazonAPI } from '@/lib/amazon-api';

function bridgeHtml(authUrl: string) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Conectar Amazon Games</title>
  <style>
    body{font-family:system-ui,sans-serif;background:#0b0b0b;color:#eee;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#1a1a1a;border:1px solid #333;border-radius:16px;max-width:520px;width:100%;padding:28px}
    h1{margin:0 0 8px;font-size:1.5rem}
    p,li{color:#aaa;line-height:1.5;font-size:.95rem}
    ol{padding-left:1.2rem}
    a.btn,button{display:block;width:100%;text-align:center;text-decoration:none;border:0;border-radius:10px;padding:12px 16px;font-weight:700;cursor:pointer;margin-top:12px;box-sizing:border-box}
    a.btn{background:#ff9900;color:#111}
    textarea{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #444;background:#111;color:#fff;margin-top:8px;min-height:90px;font-family:ui-monospace,monospace;font-size:12px}
    button[type=submit]{background:#22c55e;color:#041}
    .muted{font-size:.8rem;color:#777;margin-top:16px}
  </style>
</head>
<body>
  <div class="card">
    <h1>Entrar com Amazon Games</h1>
    <p>Fluxo Nile / Heroic — sem conta de desenvolvedor Amazon.</p>
    <ol>
      <li>Clique em <b>Abrir login Amazon</b></li>
      <li>Faça login na Amazon</li>
      <li>Quando voltar para <code>amazon.com</code>, copie a <b>URL completa</b> da barra de endereço</li>
      <li>Cole abaixo e confirme</li>
    </ol>
    <a class="btn" href="${authUrl}" target="_blank" rel="noopener">Abrir login Amazon</a>
    <form method="POST" action="/api/platforms/amazon/callback">
      <textarea name="code" placeholder="Cole a URL completa (com openid.oa2.authorization_code=...)" required></textarea>
      <button type="submit">Conectar Amazon</button>
    </form>
    <p class="muted">A URL precisa conter <code>openid.oa2.authorization_code</code>. Cole logo após o login.</p>
  </div>
</body>
</html>`;
}

export async function GET(request: NextRequest) {
  const auth = await requireUserId();
  if ('error' in auth) {
    return NextResponse.redirect(new URL('/auth/signin', baseUrl(request)));
  }

  const login = AmazonAPI.startNileLogin();
  const state = login.state || randomString(16);

  const response = new NextResponse(bridgeHtml(login.authUrl), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });

  setOAuthCookies(response, 'amazon', {
    state,
    verifier: login.codeVerifier,
    userId: auth.userId,
  });

  const maxAge = 60 * 10;
  response.cookies.set('oauth_amazon_client_id', login.clientId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
  response.cookies.set('oauth_amazon_serial', login.serial, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge,
  });

  return response;
}
