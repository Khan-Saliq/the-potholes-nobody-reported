export const API_URL = import.meta.env.VITE_API_URL || '/api'
const TOKEN_KEY = 'civicpulse_token'

// Helper to convert localhost URLs to deployed backend URLs
export function fixImageUrl(url: string): string {
  if (!url) return url
  // Replace localhost:5000 with deployed backend URL
  if (url.includes('localhost:5000')) {
    const baseUrl = API_URL.replace('/api', '')
    return url.replace('http://localhost:5000', baseUrl)
  }
  return url
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_URL}${path}`, { ...options, headers })
  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    // Clear token on 401 to avoid repeated unauthorized requests
    if (res.status === 401) {
      setToken(null)
    }
    throw new ApiError(data.error || 'Request failed', res.status)
  }

  return data as T
}
