export default () => ({
  postgres: {
    url: process.env.TELEGRAM_BOT_POSTGRES_URL,
    port: parseInt(process.env.TELEGRAM_BOT_POSTGRES_PORT) || 5432,
    username: process.env.TELEGRAM_BOT_POSTGRES_USERNAME || 'postgres',
    password: process.env.TELEGRAM_BOT_POSTGRES_PASSWORD || 'postgres',
    dbname: process.env.TELEGRAM_BOT_POSTGRES_DBNAME || 'goldex-telegram-bot',
  },
  bot: {
    token: process.env.TELEGRAM_BOT_TOKEN,
  },
  backend: {
    baseUrl: process.env.GOLDEX_BACKEND_URL || 'http://localhost:4040',
    apiPrefix: '/api/v1',
  },
  channel: {
    targetId: process.env.TELEGRAM_TARGET_CHANNEL_ID,
    chatId: process.env.TELEGRAM_CHANNEL_CHAT_ID
      ? Number(process.env.TELEGRAM_CHANNEL_CHAT_ID)
      : undefined,
    inviteLink: process.env.TELEGRAM_CHANNEL_INVITE_LINK,
  },
});
