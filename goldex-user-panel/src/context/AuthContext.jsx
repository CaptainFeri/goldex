import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authApi, profileApi } from '../services/api'
import { tokens } from '../services/http'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem('access_token'))
  const [deviceId, setDeviceId] = useState(() => localStorage.getItem('device_id'))
  const [loading, setLoading] = useState(true)

  const saveTokens = (access, refresh) => {
    setAccessToken(access)
    tokens.set({ access, refresh })
  }

  const saveDevice = (id) => {
    setDeviceId(id)
    localStorage.setItem('device_id', id)
  }

  const logout = useCallback(async () => {
    try {
      if (deviceId && accessToken) await authApi.logout(deviceId)
    } catch (_) {}
    setUser(null)
    setAccessToken(null)
    setDeviceId(null)
    tokens.clear()
  }, [deviceId, accessToken])

  // On load, fetch the profile. The http interceptor transparently refreshes an
  // expired access token (and redirects to /login if the refresh fails), so we
  // no longer need a separate token-verification call here.
  useEffect(() => {
    const init = async () => {
      if (!tokens.access) { setLoading(false); return }
      try {
        const profile = await profileApi.getProfile()
        setUser(profile)
      } catch (_) {
        setUser(null)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  const value = {
    user, setUser,
    accessToken, deviceId,
    saveTokens, saveDevice,
    logout,
    loading,
    isAuthenticated: !!user && !!accessToken
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
