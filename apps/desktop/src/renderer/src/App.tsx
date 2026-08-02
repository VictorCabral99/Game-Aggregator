import { useCallback, useEffect, useState } from 'react';
import type { DbHealth, LaunchResult } from '../../shared/api';

interface LogEntry {
  ts: string;
  message: string;
  ok?: boolean;
}

const NOTEPAD = 'C:\\Windows\\System32\\notepad.exe';

export default function App(): JSX.Element {
  const [dbHealth, setDbHealth] = useState<DbHealth | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const append = useCallback((message: string, ok?: boolean) => {
    setLogs((prev) => [...prev.slice(-20), { ts: new Date().toLocaleTimeString(), message, ok }]);
  }, []);

  useEffect(() => {
    window.api
      .dbHealth()
      .then((h) => {
        setDbHealth(h);
        append(`DB: ${h.ok ? 'ok' : 'falha'} — ${h.path ?? h.error}`, h.ok);
      })
      .catch((err: unknown) => append(`DB check falhou: ${String(err)}`, false));
  }, [append]);

  const launchNotepad = async () => {
    append(`Lançando: ${NOTEPAD}`);
    const res: LaunchResult = await window.api.launchExe({ exe: NOTEPAD });
    append(res.ok ? `Processo iniciado (pid ${res.pid})` : `Erro: ${res.error}`, res.ok);
  };

  return (
    <main className="shell">
      <header className="shell__header">
        <h1>Game Aggregator Launcher</h1>
        <span className="badge">{dbHealth?.ok ? 'DB ok' : 'DB …'}</span>
      </header>

      <section className="panel">
        <h2>Fase 0 — Fundação</h2>
        <p>
          Shell Electron + IPC. Na próxima fase: biblioteca local de jogos (.exe).
        </p>

        <div className="row">
          <button type="button" onClick={launchNotepad} className="primary">
            Abrir Notepad
          </button>
          <button type="button" onClick={() => append('Navegador/FS ainda não expostos')}>
            (placeholder)
          </button>
        </div>

        {dbHealth && (
          <dl className="health">
            <div>
              <dt>Path</dt>
              <dd>{dbHealth.path ?? '—'}</dd>
            </div>
            <div>
              <dt>App</dt>
              <dd>v{dbHealth.appVersion ?? '?'}</dd>
            </div>
            <div>
              <dt>Schema</dt>
              <dd>v{dbHealth.schemaVersion ?? '?'}</dd>
            </div>
          </dl>
        )}
      </section>

      <section className="panel panel--logs">
        <h2>Log</h2>
        <ul>
          {logs.map((l, i) => (
            <li key={i} className={l.ok === false ? 'log--error' : ''}>
              {l.ts} — {l.message}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
