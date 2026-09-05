import Redis from 'ioredis';

export default async function globalSetup(): Promise<void> {
  const client = new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '56179', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    lazyConnect: true,
  });
  await client.connect();
  try {
    const patterns = ['wallet:*', 'price:*', 'arbitrage:*', 'opportunity:*'];
    for (const pattern of patterns) {
      const keys = await client.keys(pattern);
      if (keys.length > 0) await client.del(...keys);
    }
  } finally {
    client.disconnect();
  }
}
