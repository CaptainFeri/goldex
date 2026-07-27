import http from './http'

// Public calls (no/ignored auth) pass { skipAuth: true } so a stale token is
// never attached.
const PUBLIC = { skipAuth: true }

const unwrap = (res) => res.data.data

export const authApi = {
  sendOtp: async (phone) =>
    unwrap(await http.post('/auth/send-otp', { phone }, PUBLIC)),

  verifyOtp: async (phone, otp) =>
    unwrap(await http.post('/auth/verify-otp', { phone, otp }, PUBLIC)),

  completeRegistration: async (payload, tempToken) =>
    unwrap(await http.post('/auth/complete-registration', payload, {
      headers: { Authorization: `Bearer ${tempToken}` }
    })),

  login: async (phone, password) =>
    unwrap(await http.post('/auth/login', { phone, password }, PUBLIC)),

  logout: async (deviceId) =>
    unwrap(await http.post('/auth/logout', { deviceId })),

  forgetPassword: async (email) =>
    unwrap(await http.post('/auth/forget-password', { email }, PUBLIC)),

  // The reset token arrives via the email link and is used as a bearer token.
  resetPassword: async (resetToken, newPassword) =>
    unwrap(await http.post('/auth/reset-password', { newPassword }, {
      headers: { Authorization: `Bearer ${resetToken}` }, skipAuth: true
    }))
}

export const profileApi = {
  getProfile: async () =>
    unwrap(await http.get('/profile/profile')),

  updateProfile: async (payload) =>
    unwrap(await http.patch('/profile/profile', payload)),

  updatePassword: async (currentPassword, newPassword) =>
    unwrap(await http.patch('/profile/password', { currentPassword, newPassword })),

  getLoginHistory: async (pageNumber = 1, pageSize = 100) =>
    unwrap(await http.get(`/profile/login?pageNumber=${pageNumber}&pageSize=${pageSize}`)),

  getSettings: async () =>
    unwrap(await http.get('/profile/settings')),

  updateSettings: async (payload) =>
    unwrap(await http.patch('/profile/settings', payload)),

  uploadAvatar: async (file) => {
    const form = new FormData()
    form.append('avatar', file)
    return unwrap(await http.patch('/profile/avatar', form))
  },

  deleteAvatar: async () =>
    unwrap(await http.delete('/profile/avatar'))
}

export const kycApi = {
  // Overall KYC record: { level: 'NONE'|'LEVEL_1'|…, status: 'PENDING'|'APPROVED'|'REJECTED', nationalId, birthDate, … } or null
  getKyc: async () =>
    unwrap(await http.get('/kyc')),

  getStats: async () =>
    unwrap(await http.get('/kyc/stats')),

  getDocuments: async () =>
    unwrap(await http.get('/kyc/documents')),

  verifyLevel1: async (nationalId) =>
    unwrap(await http.post('/kyc/level-1', { nationalId })),

  // payload: { iban, birthDate, bank, depositNumber }
  verifyLevel2: async (payload) =>
    unwrap(await http.post('/kyc/level-2', payload)),

  uploadDocument: async ({ file, fileTarget, description }) => {
    const form = new FormData()
    form.append('file', file)
    form.append('fileTarget', fileTarget)
    if (description) form.append('description', description)
    return unwrap(await http.post('/kyc/upload', form))
  },

  deleteDocument: async (documentId) =>
    unwrap(await http.delete(`/kyc/documents/${documentId}`))
}

export const walletApi = {
  // List of wallets with balances: [{ id, symbol, freeBalance, lockedBalance, totalBalance, availableBalance, status }]
  getWallets: async () =>
    unwrap(await http.get('/user-wallet')),

  // { transactions, total }
  getTransactions: async (params = {}) =>
    unwrap(await http.get('/user-wallet/transactions', { params }))
}

export const marketApi = {
  // Valid trading pairs with base/quote symbols and current prices
  getPairs: async () =>
    unwrap(await http.get('/market/pairs'))
}

export const orderBookApi = {
  // Order book depth for a pair: { bids, asks }
  getDepth: async (pairId) =>
    unwrap(await http.get(`/orders/book/${pairId}`))
}

export const orderApi = {
  // payload: { pricePairId, side, orderType, quantity, price?, commission?, notes? }
  create: async (payload) =>
    unwrap(await http.post('/orders', payload)),

  // returns { orders, total }
  list: async (params = {}) =>
    unwrap(await http.get('/orders', { params })),

  get: async (id) =>
    unwrap(await http.get(`/orders/${id}`)),

  cancel: async (id) =>
    unwrap(await http.delete(`/orders/${id}/cancel`))
}

export const warehouseApi = {
  getWarehouses: async () =>
    unwrap(await http.get('/warehouse')),

  createDeposit: async (payload) =>
    unwrap(await http.post('/warehouse/deposit', payload)),

  createWithdraw: async (payload) =>
    unwrap(await http.post('/warehouse/withdraw', payload)),

  getRequests: async (params = {}) =>
    unwrap(await http.get('/warehouse/requests', { params })),

  cancelRequest: async (id) =>
    unwrap(await http.post(`/warehouse/requests/${id}/cancel`)),

  getPackets: async (params = {}) =>
    unwrap(await http.get('/warehouse/packets', { params })),

  getPacket: async (id) =>
    unwrap(await http.get(`/warehouse/packets/${id}`)),
}

export const creditApi = {
  getActiveCredit: async () =>
    unwrap(await http.get('/credits/active')),

  getCredits: async () =>
    unwrap(await http.get('/credits')),

  getNotifications: async () =>
    unwrap(await http.get('/credits/notifications')),

  markAsRead: async (id) =>
    unwrap(await http.patch(`/credits/notifications/${id}/read`)),
}

export const baseInfoApi = {
  getCountries: async (searchKey = '') =>
    unwrap(await http.get('/base-info/countries', {
      params: { pageNumber: 1, pageSize: 100, searchKey: searchKey || undefined }
    })),

  getLanguages: async (searchKey = '') =>
    unwrap(await http.get('/base-info/languages', {
      params: { pageNumber: 1, pageSize: 100, searchKey: searchKey || undefined }
    }))
}

export const depositApi = {
  create: async (payload) =>
    unwrap(await http.post('/deposit', payload)),

  list: async (params = {}) =>
    unwrap(await http.get('/deposit', { params })),

  get: async (id) =>
    unwrap(await http.get(`/deposit/${id}`)),

  cancel: async (id) =>
    unwrap(await http.post(`/deposit/${id}/cancel`)),

  uploadPicture: async (file) => {
    const form = new FormData()
    form.append('file', file)
    return unwrap(await http.post('/deposit/upload-picture', form))
  },

  uploadAndOcr: async (file) => {
    const form = new FormData()
    form.append('file', file)
    return unwrap(await http.post('/deposit/upload-and-ocr', form))
  },

  sendOcrFeedback: async (imageBase64, originalTexts, correctedTexts) =>
    unwrap(await http.post('/deposit/ocr-feedback', {
      image_base64: imageBase64,
      original_texts: originalTexts,
      corrected_texts: correctedTexts,
    })),
}

export const withdrawApi = {
  create: async (payload) =>
    unwrap(await http.post('/withdraw', payload)),

  list: async (params = {}) =>
    unwrap(await http.get('/withdraw', { params })),

  get: async (id) =>
    unwrap(await http.get(`/withdraw/${id}`)),

  cancel: async (id) =>
    unwrap(await http.post(`/withdraw/${id}/cancel`)),

  uploadPicture: async (file) => {
    const form = new FormData()
    form.append('file', file)
    return unwrap(await http.post('/withdraw/upload-picture', form))
  },

  uploadAndOcr: async (file) => {
    const form = new FormData()
    form.append('file', file)
    return unwrap(await http.post('/withdraw/upload-and-ocr', form))
  },

  sendOcrFeedback: async (imageBase64, originalTexts, correctedTexts) =>
    unwrap(await http.post('/withdraw/ocr-feedback', {
      image_base64: imageBase64,
      original_texts: originalTexts,
      corrected_texts: correctedTexts,
    })),
}

export const levelApi = {
  getMyLevel: async () =>
    unwrap(await http.get('/user-level/me')),

  getMyFeatures: async () =>
    unwrap(await http.get('/user-level/me/features')),
}
