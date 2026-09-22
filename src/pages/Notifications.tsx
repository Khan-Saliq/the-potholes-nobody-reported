import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '../components/layout/Layout'
import { AnimatedPage } from '../components/ui/AnimatedPage'
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../services/notificationService'
import { useAuth } from '../context/AuthContext'
import type { AppNotification } from '../types'
import { Bell, CheckCheck, ExternalLink, Inbox } from 'lucide-react'

export function Notifications() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  const loadNotifications = async () => {
    try {
      setLoading(true)
      const items = await getNotifications()
      setNotifications(items)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) loadNotifications()
  }, [user])

  const handleMarkRead = async (id: string) => {
    try {
      const updated = await markNotificationRead(id)
      setNotifications((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleNotificationClick = (n: AppNotification) => {
    if (!n.read) handleMarkRead(n.id)
    if (n.link) {
      navigate(n.link)
    } else if (user?.role === 'admin') {
      navigate('/admin/issues')
    } else if (user?.role === 'contractor') {
      navigate('/contractor/dashboard')
    } else {
      navigate('/my-issues')
    }
  }

  const filteredNotifications = notifications.filter((n) => {
    if (filter === 'unread') return !n.read
    return true
  })

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <Layout>
      <AnimatedPage>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
                <Bell className="h-6 w-6 text-cyan-400" /> Notifications
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                Real-time tracking updates, assignment alerts, and AI verification results.
              </p>
            </div>

            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="btn-ghost text-xs flex items-center gap-1.5 py-2 px-3 text-cyan-300 border border-cyan-500/20"
              >
                <CheckCheck className="h-4 w-4" /> Mark All as Read
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-2 bg-black/40 p-1 rounded-xl border border-white/5 w-fit text-xs">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-1.5 rounded-lg font-semibold transition ${
                filter === 'all'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-4 py-1.5 rounded-lg font-semibold transition ${
                filter === 'unread'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-200">
              {error}
            </div>
          )}

          {loading ? (
            <div className="glass-card p-8 text-center text-xs text-slate-400">Loading notifications...</div>
          ) : filteredNotifications.length === 0 ? (
            <div className="glass-card p-12 text-center text-slate-400 space-y-2">
              <Inbox className="h-10 w-10 text-slate-500 mx-auto" />
              <p className="text-sm font-semibold text-slate-300">No notifications found</p>
              <p className="text-xs text-slate-500">You are all caught up with your civic activity alerts!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredNotifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`glass-card p-4 transition duration-200 cursor-pointer border hover:border-cyan-500/30 ${
                    n.read ? 'opacity-70 border-white/5' : 'border-cyan-500/40 bg-cyan-950/20 shadow-[0_0_20px_rgba(34,211,238,0.1)]'
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-100">{n.title}</span>
                        {!n.read && (
                          <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse"></span>
                        )}
                      </div>
                      <p className="text-xs text-slate-300">{n.message}</p>
                      <div className="flex items-center gap-3 pt-1 text-[0.68rem] text-slate-400 font-mono">
                        <span>{new Date(n.createdAt).toLocaleString()}</span>
                        {n.link && (
                          <span className="text-cyan-400 inline-flex items-center gap-1 font-sans">
                            View details <ExternalLink className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    </div>

                    {!n.read && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleMarkRead(n.id)
                        }}
                        className="btn-ghost rounded-lg px-3 py-1.5 text-xs text-cyan-300 self-start"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </AnimatedPage>
    </Layout>
  )
}
