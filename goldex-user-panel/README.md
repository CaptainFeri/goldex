# goldex-user-panel

> **Customer-facing gold trading platform**  
> Built with React 18 + Vite 5 + JavaScript (JSX)

---

## Overview

`goldex-user-panel` is the single-page application that end users interact with to trade gold, manage their wallets, complete identity verification (KYC), and configure their profile. Designed with a premium gold/obsidian luxury theme in Persian (RTL).

---

## Tech Stack

| Category | Technology |
|----------|-----------|
| **Framework** | React 18 (JavaScript) |
| **Build Tool** | Vite 5 |
| **Routing** | React Router v6 |
| **HTTP Client** | Axios with JWT auto-refresh |
| **Real-time** | Socket.IO Client |
| **Styling** | Custom CSS (dark luxury theme) |

---

## Features

### Pages

| Page | Description |
|------|-------------|
| **Auth** | Login / register with mobile OTP |
| **Trade** | Real-time gold trading interface with live prices |
| **Wallet** | View balances, deposits, withdrawals |
| **KYC** | Identity verification (document upload, face match) |
| **Profile** | User profile management |
| **Settings** | Account settings and preferences |
| **Sessions** | Active session management |
| **Reset Password** | Password recovery flow |
| **Forgot Password** | Password reset request |

### Architecture

- Communicates with `goldex-backend` via REST API and Socket.IO for real-time prices
- JWT-based authentication with automatic token refresh
- Protected routes with auth guards
- Vite dev server proxies `/api`, `/socket.io`, and `/uploads` to backend at `http://localhost:4040`

---

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

---

## Project Structure

```
src/
├── components/     # Shared UI (AppLayout, Sidebar, AuthBrand, ProtectedRoute)
├── context/        # Auth, Theme, Toast contexts
├── hooks/          # Custom hooks (useMarketPrices)
├── pages/          # Route pages
│   ├── AuthPage.jsx
│   ├── ForgotPasswordPage.jsx
│   ├── KycPage.jsx
│   ├── ProfilePage.jsx
│   ├── ResetPasswordPage.jsx
│   ├── SessionsPage.jsx
│   ├── SettingsPage.jsx
│   ├── TradePage.jsx
│   └── WalletPage.jsx
├── services/       # API client, HTTP helpers, Socket.IO
├── App.jsx         # Root component
├── main.jsx        # Entry point
└── index.css       # Global styles
```

---

## Related Projects

| Project | Description |
|---------|-------------|
| `goldex-backend` | Core NestJS API server |
| `goldex-pricing-engine` | Real-time pricing & arbitrage microservice |
| `goldex-admin-panel` | Admin back-office SPA |
