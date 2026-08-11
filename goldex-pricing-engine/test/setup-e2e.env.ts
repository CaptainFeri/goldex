process.env.NODE_ENV = 'test';
process.env.PORT = '3100';

// PostgreSQL
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '55432';
process.env.DB_USERNAME = 'postgres';
process.env.DB_PASSWORD = 'postgres';
process.env.DB_DATABASE = 'pricing_e2e';

// RabbitMQ (docker-compose.test.yml)
process.env.RABBITMQ_URL = 'amqp://guest:guest@localhost:55672';
process.env.RABBITMQ_HOST = 'localhost';
process.env.RABBITMQ_PORT = '55672';
process.env.RABBITMQ_USER = 'guest';
process.env.RABBITMQ_PASS = 'guest';

// Redis
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '56179';
process.env.REDIS_PASSWORD = '';

// Mock provider server (spawned in global-setup.ts)
process.env.MOCK_HOST = 'localhost';
process.env.MOCK_PORT = '5010';
process.env.MOCK_SEED_ACTIVE = 'true';
