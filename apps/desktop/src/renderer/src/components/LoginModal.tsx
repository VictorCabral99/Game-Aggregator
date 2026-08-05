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
      const { user } = await window.api.authLoginWithGoogle();
      onSuccess(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro no login');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const check = async () => {
      const user = await window.api.authGetCurrentUser();
      if (user) onSuccess(user);
    };
    void check();
  }, [onSuccess]);

  if (loading) {
    return (
      <div className="modal-backdrop">
        <div
          className="modal modal--login"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          data-pad-root="1"
        >
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
      <div
        className="modal modal--login"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        data-pad-root="1"
      >
        <div className="modal__header">
          <h2>Game Aggregator Launcher</h2>
        </div>
        <div className="login__body">
          <img
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            alt="Google"
            className="login__logo"
          />
          <h3>Faça login para continuar</h3>
          <p className="login__hint">
            O login com Google é obrigatório para acessar o launcher. Depois você pode conectar
            Steam, Epic, GOG e Amazon.
          </p>
          {error && <p className="login__error">{error}</p>}
          <button
            type="button"
            className="primary login__btn"
            onClick={() => void handleGoogleLogin()}
            disabled={loading}
          >
            {loading ? 'Entrando…' : 'Entrar com Google'}
          </button>
        </div>
      </div>
    </div>
  );
}
