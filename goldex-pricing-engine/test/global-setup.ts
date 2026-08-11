import { Client } from 'pg';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const PG = {
  host: 'localhost',
  port: 55432,
  user: 'postgres',
  password: 'postgres',
  database: 'postgres',
};

const MOCK_PORT = process.env.MOCK_PORT || '5010';
const PID_FILE = path.join(__dirname, '..', '.mock-server.pid');

export default async function globalSetup(): Promise<void> {
  const client = new Client(PG);
  await client.connect();
  try {
    const res = await client.query("SELECT 1 FROM pg_database WHERE datname = 'pricing_e2e'");
    if (res.rowCount === 0) {
      await client.query('CREATE DATABASE pricing_e2e');
    }
  } finally {
    await client.end();
  }

  const mock = spawn('npx', ['ts-node', 'mock-server/index.ts'], {
    cwd: path.resolve(__dirname, '..'),
    shell: process.platform === 'win32',
    env: { ...process.env, MOCK_PORT },
    stdio: 'ignore',
    detached: process.platform !== 'win32',
  });

  mock.on('error', (err) => {
    console.warn('[globalSetup] failed to spawn mock server:', err.message);
  });

  fs.writeFileSync(PID_FILE, String(mock.pid));

  const deadline = Date.now() + 15000;
  for (;;) {
    try {
      const res = await fetch(`http://localhost:${MOCK_PORT}/__mock/health`);
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) {
      console.warn('[globalSetup] mock server did not become healthy in time; continuing');
      break;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}
