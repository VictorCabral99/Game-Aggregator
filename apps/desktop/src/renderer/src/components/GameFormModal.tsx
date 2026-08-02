import { useEffect, useState } from 'react';
import type { CreateGameInput, Game, UpdateGameInput } from '../../../shared/api';

interface Props {
  game: Game | null;
  onClose: () => void;
  onSave: (input: CreateGameInput) => Promise<void>;
}

export default function GameFormModal({ game, onClose, onSave }: Props): JSX.Element {
  const [title, setTitle] = useState(game?.title ?? '');
  const [executable, setExecutable] = useState(game?.executable ?? '');
  const [cwd, setCwd] = useState(game?.cwd ?? '');
  const [coverPath, setCoverPath] = useState<string | null>(game?.coverPath ?? null);
  const [coverUrl, setCoverUrl] = useState(game?.coverUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const pickExe = async () => {
    const path = await window.api.pickExe();
    if (!path) return;
    setExecutable(path);
    if (!title.trim()) {
      const base = path.split('\\').pop() ?? '';
      setTitle(base.replace(/\.exe$/i, '').replace(/[._-]+/g, ' ').trim());
    }
  };

  const pickCover = async () => {
    const path = await window.api.pickCover();
    if (path) {
      setCoverPath(path);
      setCoverUrl('');
    }
  };

  const fetchCoverUrl = async () => {
    if (!coverUrl.trim()) return;
    setError(null);
    try {
      const path = await window.api.coverFromUrl(coverUrl.trim());
      setCoverPath(path);
      setCoverUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const submit = async () => {
    setError(null);
    if (!title.trim() || !executable.trim()) {
      setError('Título e executável são obrigatórios');
      return;
    }
    const input: CreateGameInput = {
      title: title.trim(),
      executable: executable.trim(),
      cwd: cwd.trim() || undefined,
      coverPath: coverPath ?? undefined,
      coverUrl: coverUrl.trim() || undefined,
    };
    setSaving(true);
    try {
      await onSave(input);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{game ? 'Editar jogo' : 'Adicionar jogo'}</h2>

        <label className="field">
          <span>Título</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>

        <label className="field">
          <span>Executável (.exe)</span>
          <div className="field__row">
            <input value={executable} onChange={(e) => setExecutable(e.target.value)} />
            <button type="button" onClick={() => void pickExe()}>Procurar…</button>
          </div>
        </label>

        <label className="field">
          <span>Diretório de trabalho (opcional)</span>
          <input value={cwd} onChange={(e) => setCwd(e.target.value)} placeholder="Deixe vazio para usar o padrão" />
        </label>

        <div className="field">
          <span>Capa</span>
          <div className="field__row">
            <input
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              placeholder="URL da capa (opcional)"
            />
            <button type="button" onClick={() => void fetchCoverUrl()}>Baixar</button>
            <button type="button" onClick={() => void pickCover()}>Local…</button>
          </div>
          {(coverPath || coverUrl) && <p className="hint">Capa definida ✓</p>}
        </div>

        {error && <p className="error">{error}</p>}

        <div className="modal__actions">
          <button type="button" className="primary" disabled={saving} onClick={() => void submit()}>
            {saving ? 'Salvando…' : game ? 'Salvar' : 'Adicionar'}
          </button>
          <button type="button" onClick={onClose}>Cancelar (Esc)</button>
        </div>
      </div>
    </div>
  );
}

export type { UpdateGameInput };
