import { useEffect, useState } from 'react';

interface SettingsModalProps {
  onClose: () => void;
  onChanged: () => void;
}

interface SettingRow {
  key: string;
  label: string;
  hint: string;
}

const ROWS: SettingRow[] = [
  {
    key: 'ui.tvMode',
    label: 'Modo TV (console)',
    hint: 'Esconde o cursor e aumenta o texto para uso com controle',
  },
  {
    key: 'ui.fullscreen',
    label: 'Iniciar em tela cheia',
    hint: 'Abre o launcher em fullscreen no boot (requer reiniciar o app)',
  },
  {
    key: 'ui.sounds',
    label: 'Sons de UI',
    hint: 'Sons curtos ao mover, selecionar e voltar (controle/teclado)',
  },
];

export default function SettingsModal({ onClose, onChanged }: SettingsModalProps): JSX.Element {
  const [values, setValues] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const entries: Record<string, boolean> = {};
      for (const row of ROWS) {
        const v = await window.api.settingsGet(row.key);
        entries[row.key] = v === '1';
      }
      setValues(entries);
      setLoading(false);
    };
    void load();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggle = async (key: string) => {
    const next = !values[key];
    setValues((prev) => ({ ...prev, [key]: next }));
    await window.api.settingsSet(key, next ? '1' : '0');
    onChanged();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal modal--settings"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal__header">
          <h2>Configurações</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <p className="settings__hint">Botão Start do controle abre esta tela.</p>
        {loading ? (
          <p className="emulation__empty">Carregando…</p>
        ) : (
          <div className="settings__list">
            {ROWS.map((row) => (
              <label key={row.key} className="settings__row">
                <span className="settings__text">
                  <strong>{row.label}</strong>
                  <small>{row.hint}</small>
                </span>
                <input
                  type="checkbox"
                  checked={values[row.key] ?? false}
                  onChange={() => void toggle(row.key)}
                />
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
