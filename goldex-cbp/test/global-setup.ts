import { Client } from 'pg';

export default async function globalSetup(): Promise<void> {
  const client = new Client({
    host: process.env.PAYMENT_DB_HOST ?? 'localhost',
    port: parseInt(process.env.PAYMENT_DB_PORT ?? '55432', 10),
    user: process.env.PAYMENT_DB_USERNAME ?? 'postgres',
    password: process.env.PAYMENT_DB_PASSWORD ?? 'postgres',
    database: 'postgres',
  });
  await client.connect();
  const dbName = process.env.PAYMENT_DB_NAME ?? 'cbp_e2e';
  const exists = await client.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [dbName],
  );
  if (exists.rowCount === 0) {
    await client.query(`CREATE DATABASE "${dbName}"`);
  }
  await client.end();
}
