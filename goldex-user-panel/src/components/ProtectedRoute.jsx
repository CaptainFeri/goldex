import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Spinner } from './UI'

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <Spinner light />
    </div>
  )

  return isAuthenticated ? children : <Navigate to="/login" replace />
}
