function parseMonitoredChannels(
  raw: string | undefined,
): { id?: string; username?: string }[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      if (/^-?\d+$/.test(entry)) return { id: entry };
      return { username: entry.replace(/^@/, '') };
    });
}

export default () => ({
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
  rabbitmq: {
    host: process.env.RABBITMQ_HOST || 'localhost',
    port: parseInt(process.env.RABBITMQ_PORT ?? '5672', 10) || 5672,
    user: process.env.RABBITMQ_USER || 'guest',
    pass: process.env.RABBITMQ_PASS || 'guest',
    exchange: process.env.RABBITMQ_EXCHANGE || 'signalr.providers',
  },
  telegram: {
    apiId: parseInt(process.env.TELEGRAM_API_ID ?? '', 10) || 0,
    apiHash: process.env.TELEGRAM_API_HASH ?? '',
    phoneNumber: process.env.TELEGRAM_PHONE_NUMBER ?? '',
    password: process.env.TELEGRAM_PASSWORD,
    sessionString: process.env.TELEGRAM_SESSION_STRING,
    sessionFolder: process.env.TELEGRAM_SESSION_FOLDER || 'sessions',
    monitoredChannels: parseMonitoredChannels(
      process.env.TELEGRAM_MONITORED_CHANNELS,
    ),
    targetChannel: process.env.TELEGRAM_TARGET_CHANNEL || '',
    walletReportChannel: process.env.TELEGRAM_WALLET_REPORT_CHANNEL || '',
  },
});
