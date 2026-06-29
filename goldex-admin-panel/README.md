# goldex-admin-panel

> **Back-office administration panel for the Goldex gold exchange platform**  
> Built with React 18 + TypeScript + Vite 5

---

## Overview

`goldex-admin-panel` is the single-page application (SPA) used by administrators to manage the entire Goldex gold exchange system. It provides a comprehensive dashboard, user management, KYC verification, financial oversight, and trading pair configuration — all wrapped in a Persian (RTL) interface with a dark-themed UI.

---

## Tech Stack

| Category | Technology |
|----------|-----------|
| **Framework** | React 18 with TypeScript |
| **Build Tool** | Vite 5 |
| **Routing** | React Router v6 |
| **State Management** | TanStack React Query v5 |
| **Charts** | Chart.js + react-chartjs-2 + date-fns |
| **HTTP Client** | Axios (JWT Bearer interceptor) |
| **Styling** | Custom CSS (Persian RTL) |

---

## Features

### Pages

| Page | Description |
|------|-------------|
| **Login** | Mobile + OTP authentication with Kavenegar SMS (dev bypass code: `12345`) |
| **Dashboard** | System profit per asset, profit-over-time chart, pending KYC counts, active providers, customer balances |
| **Compare** | Multi-provider price comparison charts for trading pairs |
| **KYC** | Document review with approve/reject workflow |
| **Wallets** | View all wallets, adjust balances, freeze/unfreeze |
| **Symbols** | Asset symbol management |
| **Pairs** | Trading pair management |
| **Mappings** | Provider-to-pair mapping management |
| **Admins** | Create, suspend, and delete admins by mobile + role |
| **Finance** | Financial overview dashboard |
| **Provider Finance** | Provider-specific finance management |

### Architecture

- Communicates exclusively with `goldex-backend` via JWT-secured REST API
- Backend proxies pricing-engine Redis data for chart views
- Auto-redirect to login on 401 responses
- Configurable backend URL via `VITE_BACKEND_URL` env var

---

## Getting Started

```bash
# Install dependencies
npm install

# Start development server (proxies /api to localhost:4040)
npm run dev

# Type check
npm run typecheck

# Production build
npm run build

# Preview production build
npm run preview
```

### Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_BACKEND_URL` | `http://localhost:4040` | Backend API base URL |

---

## Project Structure

```
src/
├── api/            # API client & types
├── auth/           # Authentication context & guards
├── components/     # Shared UI components (Layout, UI)
├── lib/            # Utilities (chart, enums, format)
├── pages/          # Route pages (10 pages)
│   ├── AdminsPage.tsx
│   ├── ComparePage.tsx
│   ├── DashboardPage.tsx
│   ├── FinancePage.tsx
│   ├── KycPage.tsx
│   ├── LoginPage.tsx
│   ├── MappingsPage.tsx
│   ├── PairsPage.tsx
│   ├── ProviderFinancePage.tsx
│   ├── SymbolsPage.tsx
│   └── WalletsPage.tsx
├── App.tsx         # Root component with routing
├── main.tsx        # Entry point
└── index.css       # Global styles
```

---

## Related Projects

| Project | Description |
|---------|-------------|
| `goldex-backend` | Core NestJS API server |
| `goldex-pricing-engine` | Real-time pricing & arbitrage microservice |
| `goldex-user-panel` | Customer-facing trading SPA |
