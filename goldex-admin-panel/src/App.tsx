import { useState, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/auth";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ComparePage from "./pages/ComparePage";
import KycPage from "./pages/KycPage";
import WalletsPage from "./pages/WalletsPage";
import SymbolsPage from "./pages/SymbolsPage";
import PairsPage from "./pages/PairsPage";
import MappingsPage from "./pages/MappingsPage";
import AdminsPage from "./pages/AdminsPage";
import FinancePage from "./pages/FinancePage";
import ProviderFinancePage from "./pages/ProviderFinancePage";
import CbpPage from "./pages/CbpPage";
import UsersPage from "./pages/UsersPage";
import WarehousePage from "./pages/WarehousePage";
import OrdersPage from "./pages/OrdersPage";
import OrderBookPage from "./pages/OrderBookPage";
import DiscountsPage from "./pages/DiscountsPage";
import CreditsPage from "./pages/CreditsPage";
import FinanceLogsPage from "./pages/FinanceLogsPage";
import ReportsPage from "./pages/ReportsPage";
import AccountingPage from "./pages/AccountingPage";
import AccountingVouchersPage from "./pages/AccountingVouchersPage";
import LevelsPage from "./pages/LevelsPage";
import DepositsPage from "./pages/DepositsPage";
import WithdrawsPage from "./pages/WithdrawsPage";
import OcrAdminPage from "./pages/OcrAdminPage";
import TelegramMarketPage from "./pages/TelegramMarketPage";
import NotificationsPage from "./pages/NotificationsPage";
import CrmDashboardPage from "./pages/crm/CrmDashboardPage";
import CrmTicketsPage from "./pages/crm/CrmTicketsPage";
import CrmTicketDetailPage from "./pages/crm/CrmTicketDetailPage";
import CrmTagsPage from "./pages/crm/CrmTagsPage";
import CrmSegmentsPage from "./pages/crm/CrmSegmentsPage";
import CrmUsersPage from "./pages/crm/CrmUsersPage";
import CrmUser360Page from "./pages/crm/CrmUser360Page";
import ProvidersPage from "./pages/ProvidersPage";
import MarketStatusPage from "./pages/MarketStatusPage";
import ArbitragePage from "./pages/ArbitragePage";
import BankAccountsPage from "./pages/BankAccountsPage";
import P2pEscalationsPage from "./pages/P2pEscalationsPage";
import P2pSettingsPage from "./pages/P2pSettingsPage";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { token, checkSession } = useAuth();
  const [valid, setValid] = useState<boolean | null>(null);
  useEffect(() => {
    if (token) {
      checkSession().then(setValid);
    }
  }, [token]);
  if (!token) return <Navigate to="/login" replace />;
  if (valid === null) return null;
  if (!valid) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="/compare" element={<ComparePage />} />
        <Route path="/providers" element={<ProvidersPage />} />
        <Route path="/market-status" element={<MarketStatusPage />} />
        <Route path="/arbitrage" element={<ArbitragePage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/kyc" element={<KycPage />} />
        <Route path="/wallets" element={<WalletsPage />} />
        <Route path="/symbols" element={<SymbolsPage />} />
        <Route path="/pairs" element={<PairsPage />} />
        <Route path="/mappings" element={<MappingsPage />} />
        <Route path="/finance" element={<FinancePage />} />
        <Route path="/provider-finance" element={<ProviderFinancePage />} />
        <Route path="/cbp" element={<CbpPage />} />
        <Route path="/admins" element={<AdminsPage />} />
        <Route path="/warehouse" element={<WarehousePage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/order-book" element={<OrderBookPage />} />
        <Route path="/discounts" element={<DiscountsPage />} />
        <Route path="/credits" element={<CreditsPage />} />
        <Route path="/finance-logs" element={<FinanceLogsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/accounting" element={<AccountingPage />} />
        <Route path="/accounting/vouchers" element={<AccountingVouchersPage />} />
        <Route path="/user-levels" element={<LevelsPage />} />
        <Route path="/deposits" element={<DepositsPage />} />
        <Route path="/withdraws" element={<WithdrawsPage />} />
        <Route path="/bank-accounts" element={<BankAccountsPage />} />
        <Route path="/p2p" element={<P2pEscalationsPage />} />
        <Route path="/p2p/settings" element={<P2pSettingsPage />} />
        <Route path="/ocr" element={<OcrAdminPage />} />
        <Route path="/telegram-market" element={<TelegramMarketPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/crm" element={<CrmDashboardPage />} />
        <Route path="/crm/users" element={<CrmUsersPage />} />
        <Route path="/crm/users/:userId" element={<CrmUser360Page />} />
        <Route path="/crm/tickets" element={<CrmTicketsPage />} />
        <Route path="/crm/tickets/:id" element={<CrmTicketDetailPage />} />
        <Route path="/crm/tags" element={<CrmTagsPage />} />
        <Route path="/crm/segments" element={<CrmSegmentsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
