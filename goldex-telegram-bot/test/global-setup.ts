import { Client } from 'pg';

export default async function globalSetup(): Promise<void> {
  const client = new Client({
    host: process.env.TELEGRAM_BOT_POSTGRES_URL ?? 'localhost',
    port: parseInt(process.env.TELEGRAM_BOT_POSTGRES_PORT ?? '55432', 10),
    user: process.env.TELEGRAM_BOT_POSTGRES_USERNAME ?? 'postgres',
    password: process.env.TELEGRAM_BOT_POSTGRES_PASSWORD ?? 'postgres',
    database: 'postgres',
  });
  await client.connect();
  const dbName = process.env.TELEGRAM_BOT_POSTGRES_DBNAME ?? 'telegram_bot_e2e';
  const exists = await client.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [dbName],
  );
  if (exists.rowCount === 0) {
    await client.query(`CREATE DATABASE "${dbName}"`);
  }
  await client.end();
}
