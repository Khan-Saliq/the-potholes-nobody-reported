import { apiFetch } from './api'
import type { AppNotification } from '../types'

export async function getNotifications(): Promise<AppNotification[]> {
  return apiFetch<AppNotification[]>('/notifications')
}

export async function getUnreadNotificationCount(): Promise<number> {
  try {
    const res = await apiFetch<{ unreadCount: number }>('/notifications/unread-count')
    return res?.unreadCount || 0
  } catch {
    const notifications = await getNotifications()
    return notifications.filter((n: AppNotification) => !n.read).length
  }
}

export async function markNotificationRead(id: string): Promise<AppNotification> {
  return apiFetch<AppNotification>(`/notifications/${id}/read`, {
    method: 'PATCH',
  })
}

export async function markAllNotificationsRead(): Promise<{ message: string }> {
  return apiFetch<{ message: string }>('/notifications/read-all', {
    method: 'PATCH',
  })
}

export async function deleteNotification(id: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/notifications/${id}`, {
    method: 'DELETE',
  })
}

// Backward compatibility helpers
export const getUserNotifications = getNotifications
export const getAdminNotifications = getNotifications
export const markUserNotificationRead = markNotificationRead
export const markAdminNotificationRead = markNotificationRead
export const deleteUserNotification = deleteNotification
export const deleteAdminNotification = deleteNotification
