import { promises as fs } from 'fs';
import path from 'path';

export type RatingsFileLog = {
  filePath: string;
  relativePath: string;
  line: (msg: string) => void;
  flush: () => Promise<string>;
};

/** Log append-only em logs/ratings-*.log (projeto root). */
export async function createRatingsFileLog(): Promise<RatingsFileLog> {
  const dir = path.join(process.cwd(), 'logs');
  await fs.mkdir(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `ratings-${stamp}.log`;
  const filePath = path.join(dir, fileName);
  const relativePath = path.join('logs', fileName).replace(/\\/g, '/');
  const lines: string[] = [
    `# ratings batch log — ${new Date().toISOString()}`,
    `# file: ${relativePath}`,
    '',
  ];

  return {
    filePath,
    relativePath,
    line(msg: string) {
      const row = `[${new Date().toISOString()}] ${msg}`;
      lines.push(row);
      console.log(msg.startsWith('[ratings]') ? msg : `[ratings] ${msg}`);
    },
    async flush() {
      await fs.writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');
      return relativePath;
    },
  };
}
