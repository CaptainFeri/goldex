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
import UsersPage from "./pages/UsersPage";
import WarehousePage from "./pages/WarehousePage";
import OrdersPage from "./pages/OrdersPage";
import OrderBookPage from "./pages/OrderBookPage";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { token } = useAuth();
  return token ? children : <Navigate to="/login" replace />;
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
        <Route path="/users" element={<UsersPage />} />
        <Route path="/kyc" element={<KycPage />} />
        <Route path="/wallets" element={<WalletsPage />} />
        <Route path="/symbols" element={<SymbolsPage />} />
        <Route path="/pairs" element={<PairsPage />} />
        <Route path="/mappings" element={<MappingsPage />} />
        <Route path="/finance" element={<FinancePage />} />
        <Route path="/provider-finance" element={<ProviderFinancePage />} />
        <Route path="/admins" element={<AdminsPage />} />
        <Route path="/warehouse" element={<WarehousePage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/order-book" element={<OrderBookPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
