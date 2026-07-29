import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './components/AppLayout'
import AuthPage from './pages/AuthPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import ProfilePage from './pages/ProfilePage'
import TradePage from './pages/TradePage'
import WalletPage from './pages/WalletPage'
import WarehousePage from './pages/WarehousePage'
import KycPage from './pages/KycPage'
import SessionsPage from './pages/SessionsPage'
import SettingsPage from './pages/SettingsPage'
import EliteTradePage from './pages/EliteTradePage'
import CreditPage from './pages/CreditPage'
import LevelPage from './pages/LevelPage'
import NotificationPage from './pages/NotificationPage'
import SupportPage from './pages/SupportPage'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/register" element={<AuthPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/trade" element={<TradePage />} />
          <Route path="/elite-trade" element={<EliteTradePage />} />
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="/warehouse" element={<WarehousePage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/kyc" element={<KycPage />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/credit" element={<CreditPage />} />
          <Route path="/level" element={<LevelPage />} />
          <Route path="/notifications" element={<NotificationPage />} />
          <Route path="/support" element={<SupportPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  )
}
