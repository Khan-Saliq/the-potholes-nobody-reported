import { apiFetch, setToken } from './api'
import type { User } from '../types'

export async function login(email: string, password: string): Promise<Omit<User, 'password'>> {
  const { user, token } = await apiFetch<{ user: Omit<User, 'password'>; token: string }>(
    '/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password }) }
  )
  setToken(token)
  return user
}

export async function register(data: {
  name: string
  email: string
  password: string
}): Promise<Omit<User, 'password'>> {
  const { user, token } = await apiFetch<{ user: Omit<User, 'password'>; token: string }>(
    '/auth/register',
    { method: 'POST', body: JSON.stringify(data) }
  )
  setToken(token)
  return user
}

export async function fetchMe(): Promise<Omit<User, 'password'> | null> {
  try {
    const { user } = await apiFetch<{ user: Omit<User, 'password'> }>('/auth/me')
    return user
  } catch {
    return null
  }
}

export function logout(): void {
  setToken(null)
}

export async function validateSession(): Promise<Omit<User, 'password'> | null> {
  return fetchMe()
}

export async function applyForContractor(companyName?: string, assignedDepartment?: string): Promise<{ message: string; user: Omit<User, 'password'> }> {
  return apiFetch<{ message: string; user: Omit<User, 'password'> }>('/auth/apply-contractor', {
    method: 'POST',
    body: JSON.stringify({ companyName, assignedDepartment }),
  })
}
