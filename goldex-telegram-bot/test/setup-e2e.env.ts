process.env.NODE_ENV = 'test';
process.env.TELEGRAM_BOT_PORT = '3100';

// PostgreSQL (docker-compose.test.yml)
process.env.TELEGRAM_BOT_POSTGRES_URL = 'localhost';
process.env.TELEGRAM_BOT_POSTGRES_PORT = '55432';
process.env.TELEGRAM_BOT_POSTGRES_USERNAME = 'postgres';
process.env.TELEGRAM_BOT_POSTGRES_PASSWORD = 'postgres';
process.env.TELEGRAM_BOT_POSTGRES_DBNAME = 'telegram_bot_e2e';

// Keep the bot fully disabled during tests — never connect to real Telegram.
// (The real token in .env must NOT leak in: process.env wins over dotenv.)
process.env.TELEGRAM_BOT_TOKEN = '';

// Backend is never called by the e2e suite; point at an unreachable host.
process.env.GOLDEX_BACKEND_URL = 'http://localhost:59999';

// Channel notifications are a no-op without a target channel.
process.env.TELEGRAM_TARGET_CHANNEL_ID = '';
process.env.TELEGRAM_CHANNEL_CHAT_ID = '';
process.env.TELEGRAM_CHANNEL_INVITE_LINK = '';
