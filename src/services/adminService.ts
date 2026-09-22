import { apiFetch } from './api'
import type { User, UserRole } from '../types'

export async function getAllUsers(search?: string, role?: string): Promise<User[]> {
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  if (role && role !== 'all') params.append('role', role)
  const qs = params.toString() ? `?${params.toString()}` : ''
  return apiFetch<User[]>(`/admin/users${qs}`)
}

export async function updateUserRole(
  userId: string,
  data: {
    role: UserRole
    department?: string
    companyName?: string
    assignedDepartment?: string
    reason?: string
  }
): Promise<{ message: string; user: User }> {
  return apiFetch<{ message: string; user: User }>(`/admin/users/${userId}/role`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}
