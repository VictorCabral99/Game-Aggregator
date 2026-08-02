import { useEffect, useState } from 'react';

interface Props {
  onSuccess: (user: { id: string; email: string; name: string | null; image: string | null }) => void;
}

export default function LoginModal({ onSuccess }: Props): JSX.Element {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      // Abre janela de auth via IPC
      const { authUrl, state } = await window.api.authGetGoogleAuthUrl();

      // A janela é aberta no main process; aqui só aguardamos o callback
      // O main process vai chamar o callback IPC quando o redirect chegar
      // Para simplificar, vamos usar uma abordagem: o main abre a janela e resolve a promise
      // O renderer só precisa aguardar

      // Na verdade, a janela é aberta no main via startGoogleAuth()
      // O renderer chama authGetGoogleAuthUrl que dispara a janela e retorna quando completa
      const result = await window.api.authGetGoogleAuthUrl();
      // Se chegou aqui, o login foi bem-sucedido (a promise resolveu no main)
      // O resultado vem no callback, mas vamos buscar o usuário atual
      const user = await window.api.authGetCurrentUser();
      if (user) {
        onSuccess(user);
      } else {
        setError('Login concluído mas usuário não encontrado');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro no login');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Verifica se já tem usuário logado ao abrir
    const check = async () => {
      const user = await window.api.authGetCurrentUser();
      if (user) onSuccess(user);
    };
    check();
  }, [onSuccess]);

  if (loading) {
    return (
      <div className="modal-backdrop">
        <div className="modal modal--login" onClick={(e) => e.stopPropagation()}>
          <div className="modal__header">
            <h2>Game Aggregator</h2>
          </div>
          <div className="login__body">
            <div className="login__spinner" />
            <p>Entrando com Google…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop">
      <div className="modal modal--login" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2>Game Aggregator Launcher</h2>
        </div>
        <div className="login__body">
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="login__logo" />
          <h3>Faça login para continuar</h3>
          <p className="login__hint">
            O login com Google é obrigatório para acessar o launcher.
            Depois você pode conectar Steam, Epic, GOG e Amazon.
          </p>
          {error && <p className="login__error">{error}</p>}
          <button
            type="button"
            className="primary login__btn"
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            {loading ? 'Entrando…' : 'Entrar com Google'}
          </button>
        </div>
      </div>
    </div>
  );
}