import axios from 'axios'

const BASE = '/api/v1'

// ─── Token storage ──────────────────────────────────────────
// Single source of truth for tokens. The interceptors read from here so
// callers never have to pass a token around manually.
export const tokens = {
  get access() { return localStorage.getItem('access_token') },
  get refresh() { return localStorage.getItem('refresh_token') },
  get deviceId() { return localStorage.getItem('device_id') },
  set({ access, refresh }) {
    if (access) localStorage.setItem('access_token', access)
    if (refresh) localStorage.setItem('refresh_token', refresh)
  },
  clear() {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('device_id')
  }
}

const http = axios.create({ baseURL: BASE })

// Attach the bearer token automatically unless the call opts out (skipAuth)
// or already carries an explicit Authorization header (e.g. registration temp
// token, password-reset token).
http.interceptors.request.use((config) => {
  config.headers = config.headers ?? {}
  config.headers['Accept-Language'] = 'en'
  const token = tokens.access
  if (token && !config.skipAuth && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// The backend's /auth/refresh requires the (expired) access token in the
// Authorization header AND the refresh token in the body. We shared a single
// in-flight refresh so concurrent 401s only trigger one refresh round-trip.
let refreshing = null

async function doRefresh() {
  const access = tokens.access
  const refresh = tokens.refresh
  if (!access || !refresh) throw new Error('NO_REFRESH_TOKEN')
  const { data } = await axios.post(
    `${BASE}/auth/refresh`,
    { refreshToken: refresh },
    { headers: { Authorization: `Bearer ${access}` } }
  )
  const next = data.data
  tokens.set({ access: next.access_token, refresh: next.refresh_token })
  return next.access_token
}

http.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    const status = error.response?.status

    if (status === 401 && original && !original._retry && !original.skipAuth) {
      original._retry = true
      try {
        refreshing = refreshing || doRefresh()
        const newToken = await refreshing
        refreshing = null
        original.headers.Authorization = `Bearer ${newToken}`
        return http(original)
      } catch (e) {
        refreshing = null
        tokens.clear()
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login'
        }
        return Promise.reject(e)
      }
    }
    return Promise.reject(error)
  }
)

export default http
