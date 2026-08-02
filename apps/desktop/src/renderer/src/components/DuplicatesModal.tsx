import { useEffect, useState } from 'react';
import type { Game } from '../../../shared/api';

interface Props {
  onClose: () => void;
  onMerged: () => void;
}

export default function DuplicatesModal({ onClose, onMerged }: Props): JSX.Element {
  const [pairs, setPairs] = useState<Array<{ a: Game; b: Game }>>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    void window.api
      .libraryPossibleDuplicates()
      .then(setPairs)
      .catch(() => setPairs([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  const merge = async (target: Game, other: Game) => {
    const sources = other.sources.map((s) => s.id);
    if (sources.length === 0) return;
    await window.api.libraryMergeSources({ targetGameId: target.id, sourceIds: sources });
    onMerged();
    load();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--dupes" onClick={(e) => e.stopPropagation()}>
        <h2>Possíveis duplicatas</h2>
        <p className="hint">
          Jogos com títulos semelhantes detectados. Aprove para juntar ou ignore se forem edições
          diferentes.
        </p>

        {loading && <p className="hint">Procurando…</p>}

        {!loading && pairs.length === 0 && (
          <p className="hint">Nenhuma duplicata potencial encontrada.</p>
        )}

        <div className="dupes__list">
          {pairs.map(({ a, b }) => (
            <article key={`${a.id}-${b.id}`} className="dupe-row">
              <div className="dupe-row__titles">
                <div>
                  <strong>{a.title}</strong>
                  <span className="dupe-row__sources">
                    {a.sources.map((s) => s.platform).join(' · ')}
                  </span>
                </div>
                <div>
                  <strong>{b.title}</strong>
                  <span className="dupe-row__sources">
                    {b.sources.map((s) => s.platform).join(' · ')}
                  </span>
                </div>
              </div>
              <div className="dupe-row__actions">
                <button type="button" className="primary" onClick={() => void merge(a, b)}>
                  Juntar {a.title} ← {b.title}
                </button>
                <button type="button" className="primary" onClick={() => void merge(b, a)}>
                  Juntar {b.title} ← {a.title}
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="modal__actions">
          <button type="button" onClick={onClose}>Fechar (Esc)</button>
        </div>
      </div>
    </div>
  );
}
