import { Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'

export default function AppLayout() {
  const { user } = useAuth()
  return (
    <div className="app-shell">
      <Sidebar user={user} />
      <main className="main-content">
        <Outlet />
      </main>
      <BottomNav user={user} />
    </div>
  )
}
