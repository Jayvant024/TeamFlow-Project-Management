const API_URL = import.meta.env.VITE_API_URL || ''

export async function api(path, options = {}) {
  if (path === '/auth/google' || path === '/auth/google/link') {
    const apiOrigin = new URL(API_URL || window.location.origin, window.location.href)
    const localHosts = ['localhost', '127.0.0.1', '::1']
    const localDevelopment = localHosts.includes(window.location.hostname) && localHosts.includes(apiOrigin.hostname)
    if (apiOrigin.protocol !== 'https:' && !localDevelopment) {
      throw new Error('Google Sign-In requires a secure HTTPS connection.')
    }
  }
  const token = localStorage.getItem('teamflow-token')
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  const response = await fetch(`${API_URL}/api${path}`, {
    ...options,
    headers: {
      ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong. Please try again.')
    error.status = response.status
    throw error
  }
  return data
}

export async function apiFile(path, options = {}) {
  const token = localStorage.getItem('teamflow-token')
  const response = await fetch(`${API_URL}/api${path}`, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || 'The file request could not be completed.')
  }
  return response.blob()
}
