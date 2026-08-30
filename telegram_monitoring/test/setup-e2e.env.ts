process.env.NODE_ENV = 'test';
process.env.PORT = '3100';

// Redis (docker-compose.test.yml). The dev .env points at a docker-network
// hostname that is unreachable from the test runner, so it must be overridden.
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '56179';
process.env.REDIS_PASSWORD = '';
// Keep state between app instances of one run; global-setup.ts wipes caches.
process.env.REDIS_RESET_ON_START = 'false';

// RabbitMQ (docker-compose.test.yml) — connection failure is non-fatal.
process.env.RABBITMQ_HOST = 'localhost';
process.env.RABBITMQ_PORT = '55672';
process.env.RABBITMQ_USER = 'guest';
process.env.RABBITMQ_PASS = 'guest';
process.env.RABBITMQ_EXCHANGE = 'signalr.providers.e2e';

// Never connect to real Telegram during tests. The TelegramService is
// overridden in the spec anyway; these keep the app inert if the override
// is ever removed.
process.env.TELEGRAM_API_ID = '0';
process.env.TELEGRAM_API_HASH = '';
process.env.TELEGRAM_PHONE_NUMBER = '';
process.env.TELEGRAM_PASSWORD = '';
process.env.TELEGRAM_SESSION_STRING = '';
process.env.TELEGRAM_MONITORED_CHANNELS = '';
process.env.TELEGRAM_TARGET_CHANNEL = '';
process.env.TELEGRAM_WALLET_REPORT_CHANNEL = '';

// Wallet behaviour under test
process.env.WALLET_INITIAL_IRR = '100000000000';
process.env.WALLET_MIN_TRADE_KG = '1';
process.env.WALLET_DELIVERY_TYPE = 'e2e-delivery';
process.env.WALLET_HOURLY_EXCEL = 'false';
