process.env.NODE_ENV = 'test';
process.env.PORT = '4100';

// PostgreSQL (docker-compose.test.yml)
process.env.PAYMENT_DB_HOST = 'localhost';
process.env.PAYMENT_DB_PORT = '55432';
process.env.PAYMENT_DB_USERNAME = 'postgres';
process.env.PAYMENT_DB_PASSWORD = 'postgres';
process.env.PAYMENT_DB_NAME = 'cbp_e2e';
process.env.PAYMENT_DB_SYNC = 'true';

// RabbitMQ
process.env.CBP_RABBITMQ_HOST = 'localhost';
process.env.CBP_RABBITMQ_PORT = '55672';
process.env.CBP_RABBITMQ_USER = 'guest';
process.env.CBP_RABBITMQ_PASS = 'guest';

// External gateways: point to an unreachable host; gateways are overridden in tests
process.env.KAINO_BASE_URL = 'http://localhost:59999';
process.env.SHAHIN_SERVICE_URL = 'http://localhost:59999';
