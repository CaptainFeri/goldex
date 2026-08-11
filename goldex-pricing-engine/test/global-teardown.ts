import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export default async function globalTeardown(): Promise<void> {
  const pidFile = path.join(__dirname, '..', '.mock-server.pid');
  if (!fs.existsSync(pidFile)) return;
  const pid = Number(fs.readFileSync(pidFile, 'utf8'));
  fs.unlinkSync(pidFile);
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGTERM');
    }
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* already dead */
    }
  }
}
