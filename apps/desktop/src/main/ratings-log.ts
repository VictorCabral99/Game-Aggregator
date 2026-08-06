import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

export type RatingsFileLog = {
  filePath: string;
  relativePath: string;
  line: (msg: string) => void;
  flush: () => Promise<string>;
};

/** Log append-only em userData/logs/ratings-*.log (+ espelho no console). */
export async function createRatingsFileLog(): Promise<RatingsFileLog> {
  const dir = join(app.getPath('userData'), 'logs');
  await fs.mkdir(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `ratings-${stamp}.log`;
  const filePath = join(dir, fileName);
  const relativePath = `logs/${fileName}`;
  const lines: string[] = [
    `# ratings batch log — ${new Date().toISOString()}`,
    `# file: ${filePath}`,
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
      return filePath;
    },
  };
}
