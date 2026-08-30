# goldex-backend

> **Core backend API service for the Goldex gold exchange platform**  
> Built with NestJS 11 + TypeScript + PostgreSQL + Redis + RabbitMQ

---

## Overview

`goldex-backend` is the monolithic NestJS API server that powers the entire Goldex ecosystem. It handles user authentication (OTP/password/2FA), admin management, order processing, wallet operations, KYC verification, financial tracking, and real-time price streaming via WebSocket.

---

## Tech Stack

| Category | Technology |
|----------|-----------|
| **Framework** | NestJS 11 + TypeScript 6 |
| **Database** | PostgreSQL (TypeORM with migrations) |
| **Cache** | Redis (ioredis) |
| **Message Broker** | RabbitMQ (amqplib) |
| **Real-time** | Socket.IO WebSocket gateway |
| **Auth** | JWT (passport-jwt) + speakeasy 2FA |
| **File Storage** | MinIO (S3-compatible) |
| **API Docs** | Swagger (express-basic-auth) |
| **Logging** | Winston with daily rotation + Filebeat |
| **Email** | Mailgun |
| **SMS** | Kavenegar |
| **i18n** | nestjs-i18n (English / Persian) |
| **Container** | Docker + docker-compose (dev/stage/prod) |

---

## Modules

### Core Business

| Module | Description |
|--------|-------------|
| **User** | Registration (OTP), login (password + 2FA), profile, device tracking, password recovery |
| **Admin** | Admin auth (mobile + OTP), JWT with role-based authorization |
| **Order** | Order CRUD, lifecycle management, admin overrides |
| **Wallet** | Balance management, transactions, freeze/unfreeze |
| **KYC** | Identity verification via Jibit (document scanning, face match, bank account) |
| **Financial** | Provider deal/balance snapshots, system ledger |
| **Discount** | Discount codes and promotions for users |

### Admin Operations

| Module | Description |
|--------|-------------|
| **Admin-Mgmt** | Create/suspend/delete admin accounts |
| **Admin-KYC** | Review and approve/reject KYC documents |
| **Admin-User** | View user profiles and activity |
| **Admin-Wallet** | Adjust balances, freeze wallets |
| **Admin-Symbol** | Manage asset symbols (gain types, payment gateways) |
| **Admin-Pair** | Manage trading pairs and market types |
| **Admin-Monitoring** | Proxy pricing-engine Redis data for admin charts |
| **Admin-Discount** | Manage promotions and discount codes |
| **Provider-Finance** | Provider settlement management |
| **Provider-Pair-Mapping** | Map provider items to system pairs |

### Infrastructure

| Module | Description |
|--------|-------------|
| **RabbitMQ** | Message broker (consumes pricing-engine events) |
| **Redis** | Caching and session management |
| **WebSocket** | Socket.IO market gateway for real-time prices |
| **MinIO** | S3-compatible file storage for KYC docs/avatars |
| **SMS** | Kavenegar integration for OTP |
| **Mail** | Mailgun integration for notifications |
| **File** | File upload management |
| **BaseInfo** | Countries, languages, enums |

---

## API

- Base URL: `/api/v1/`
- Response envelope: `{ status, message, data, errors }`
- Swagger docs: `/api-docs` (basic-auth protected)
- API versioning via URI prefix

---

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env

# Development (watch mode)
npm run start:dev

# Build
npm run build

# Production
npm run start:prod

# Run tests
npm test
```

### Docker

```bash
# Development environment
docker-compose -f docker-compose.dev.yaml up

# Staging
docker-compose -f docker-compose.stage.yaml up

# Production
docker-compose -f docker-compose.prod.yaml up
```

Services orchestrated: `goldex-service`, PostgreSQL, pgAdmin, RabbitMQ, Redis

---

## Project Structure

```
src/
├── admin/              # Admin authentication & roles
├── admin-discount/     # Discount & promotion management
├── admin-kyc/          # KYC document review
├── admin-management/   # Admin CRUD operations
├── admin-monitoring/   # Pricing engine data proxy
├── admin-pair/         # Trading pair management
├── admin-symbol/       # Asset symbol management
├── admin-user/         # User profile viewing
├── admin-wallet/       # Wallet admin operations
├── baseinfo/           # Countries, languages, enums
├── config/             # App, DB, Swagger, migration config
├── file/               # File upload handling
├── financial/          # Financial tracking & ledger
├── i18n/               # en/fa translations
├── kyc/                # KYC provider integration (Jibit)
├── logger/             # Winston configuration
├── mail/               # Email service (Mailgun)
├── minio/              # S3-compatible storage
├── migrations/         # 42 database migrations
├── order/              # Order management
├── provider-finance/   # Provider settlements
├── provider-pair-mapping/ # Provider-item mapping
├── rabbitmq/           # Message broker consumers
├── redis/              # Redis caching
├── shared/             # Base entities, enums, filters
├── sms/                # SMS provider (Kavenegar)
├── templates/          # Email templates, PWA icons
├── user/               # User auth, profile, KYC
├── user-discount/      # User-facing discounts
├── user-wallet/        # User wallet operations
├── wallet/             # Core wallet engine
└── websocket/          # Socket.IO market gateway
```

---

## Related Projects

| Project | Description |
|---------|-------------|
| `goldex-admin-panel` | Admin SPA (React + TypeScript) |
| `goldex-pricing-engine` | Real-time pricing & arbitrage microservice |
| `goldex-user-panel` | Customer-facing trading SPA |
