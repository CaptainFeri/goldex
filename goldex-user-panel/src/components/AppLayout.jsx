import { Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Sidebar from './Sidebar'

export default function AppLayout() {
  const { user } = useAuth()
  return (
    <div className="app-shell">
      <Sidebar user={user} />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
