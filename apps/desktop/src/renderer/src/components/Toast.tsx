interface Props {
  message: string;
  kind: 'ok' | 'error';
}

export default function Toast({ message, kind }: Props): JSX.Element | null {
  if (!message) return null;
  return <div className={`toast toast--${kind}`}>{message}</div>;
}
