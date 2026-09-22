import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '../../components/layout/Layout'
import { AnimatedPage } from '../../components/ui/AnimatedPage'
import { StatCard } from '../../components/ui/StatCard'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { getContractorTasks, updateContractorStatus } from '../../services/issueService'
import { getCachedIssuesLocally, cacheIssuesLocally } from '../../services/offlineStorage'
import type { Issue } from '../../types'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  HardHat,
  MapPin,
  Upload,
  Wrench,
} from 'lucide-react'

export function ContractorDashboard() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [tasks, setTasks] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const loadTasks = async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true)
      const cached = await getCachedIssuesLocally()
      if (cached && cached.length > 0) {
        setTasks(cached)
      }

      if (navigator.onLine) {
        const data = await getContractorTasks()
        setTasks(data)
        await cacheIssuesLocally(data)
      }
    } catch (err: any) {
      console.warn('Network tasks fetch failed, displaying cached tasks:', err.message)
      const cached = await getCachedIssuesLocally()
      if (!cached || cached.length === 0) {
        setError(err.message || 'Failed to load contractor tasks')
      }
    } finally {
      if (!isSilent) setLoading(false)
    }
  }

  useEffect(() => {
    loadTasks(false)
    const handleSyncEvent = (e: Event) => {
      const customEvt = e as CustomEvent
      if (!customEvt.detail || customEvt.detail.type === 'ITEM_SYNCED') {
        loadTasks(true)
      }
    }
    window.addEventListener('civicsync_sync_event', handleSyncEvent)
    return () => window.removeEventListener('civicsync_sync_event', handleSyncEvent)
  }, [])

  const handleStatusUpdate = async (id: string, newStatus: 'accepted' | 'repair_in_progress') => {
    try {
      setUpdatingId(id)
      await updateContractorStatus(id, newStatus)
      await loadTasks()
      toast.success(
        'Task Status Updated',
        newStatus === 'accepted' ? 'Order accepted! Work scheduled.' : 'Repair started and in progress.'
      )
    } catch (err: any) {
      toast.error('Update Failed', err.message || 'Failed to update task status')
    } finally {
      setUpdatingId(null)
    }
  }

  // Calculate statistics
  const assignedCount = tasks.length
  const inProgressCount = tasks.filter((t) => t.status === 'repair_in_progress' || t.status === 'accepted').length
  const awaitingVerification = tasks.filter((t) => t.status === 'ai_verification' || t.status === 'needs_review' || t.status === 'after_photo_submitted').length
  const breachedCount = tasks.filter((t) => t.deadline && new Date(t.deadline) < new Date() && t.status !== 'completed' && t.status !== 'resolved').length

  const getSlaBadge = (task: Issue) => {
    if (!task.deadline) return null
    const deadlineDate = new Date(task.deadline)
    const now = new Date()
    const diffHours = Math.round((deadlineDate.getTime() - now.getTime()) / (1000 * 3600))

    if (task.status === 'completed' || task.status === 'verified' || task.status === 'resolved') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="h-3.5 w-3.5" /> Completed
        </span>
      )
    }

    if (diffHours < 0) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-400 border border-rose-500/20">
          <AlertTriangle className="h-3.5 w-3.5" /> SLA BREACHED ({Math.abs(diffHours)}h overdue)
        </span>
      )
    }

    if (diffHours <= 12) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-400 border border-amber-500/20">
          <Clock className="h-3.5 w-3.5" /> Urgent ({diffHours}h left)
        </span>
      )
    }

    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-2.5 py-1 text-xs font-semibold text-cyan-400 border border-cyan-500/20">
        <Clock className="h-3.5 w-3.5" /> {diffHours}h remaining
      </span>
    )
  }

  return (
    <Layout>
      <AnimatedPage>
        <div className="space-y-6">
          {/* Top Header */}
          <div className="flex flex-col justify-between gap-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-purple-500/5 to-cyan-500/10 p-6 border border-amber-500/20 shadow-xl sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-400 shadow-inner">
                <HardHat className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-100">Contractor Task Portal</h1>
                <p className="text-sm text-slate-400">
                  Logged in as <span className="font-semibold text-amber-300">{user?.name}</span> ({user?.companyName || 'Municipal Contractor'})
                </p>
              </div>
            </div>
            <button
              onClick={() => loadTasks(false)}
              className="btn-ghost text-xs"
            >
              Refresh Tasks
            </button>
          </div>

          {/* Stats Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Assigned Potholes" value={assignedCount} icon={Wrench} accent="amber" />
            <StatCard label="In Progress" value={inProgressCount} icon={Clock} accent="blue" />
            <StatCard label="Awaiting AI Verification" value={awaitingVerification} icon={Upload} accent="teal" />
            <StatCard label="SLA Breaches" value={breachedCount} icon={AlertTriangle} accent="red" />
          </div>

          {/* Tasks List */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur-xl">
            <h2 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
              <Wrench className="h-5 w-5 text-amber-400" />
              Your Assigned Pothole Repair Tasks
            </h2>

            {loading ? (
              <div className="py-12 text-center text-slate-400 animate-pulse">Loading assigned tasks...</div>
            ) : error ? (
              <div className="py-8 text-center text-rose-400">{error}</div>
            ) : tasks.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                No pothole repair tasks assigned to you yet. Check back soon!
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex flex-col justify-between rounded-xl border border-white/10 bg-white/5 p-5 transition hover:border-amber-500/30 hover:bg-white/[0.07]"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-mono text-xs font-bold text-amber-400">
                            {task.complaintId || `PT-2026-${task.id.slice(-5).toUpperCase()}`}
                          </span>
                          <h3 className="text-base font-semibold text-slate-100 line-clamp-1">{task.title}</h3>
                        </div>
                        <StatusBadge status={task.status} />
                      </div>

                      <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                        <MapPin className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                        <span className="truncate">{task.location.address}</span>
                      </div>

                      <p className="mt-2 text-xs text-slate-300 line-clamp-2">{task.description}</p>

                      {/* Image Thumbnail */}
                      {task.imageUrl && (
                        <div className="mt-3 relative h-32 w-full overflow-hidden rounded-lg bg-slate-800 border border-white/10">
                          <img
                            src={task.imageUrl}
                            alt="Original Pothole"
                            className="h-full w-full object-cover"
                          />
                          <div className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[0.65rem] font-bold text-amber-300">
                            BEFORE Photo (Citizen Report)
                          </div>
                        </div>
                      )}

                      <div className="mt-3 flex items-center justify-between">
                        <div className="text-xs text-slate-400">
                          Severity: <span className="font-bold text-slate-200">{task.severity}/5</span>
                        </div>
                        {getSlaBadge(task)}
                      </div>
                    </div>

                    {/* Contractor Action Controls */}
                    <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
                      {task.status === 'assigned' && (
                        <button
                          onClick={() => handleStatusUpdate(task.id, 'accepted')}
                          disabled={updatingId === task.id}
                          className="btn-primary text-xs w-full sm:w-auto"
                        >
                          Accept Assignment
                        </button>
                      )}

                      {task.status === 'accepted' && (
                        <button
                          onClick={() => handleStatusUpdate(task.id, 'repair_in_progress')}
                          disabled={updatingId === task.id}
                          className="btn-primary text-xs w-full sm:w-auto bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
                        >
                          Start Repair Work
                        </button>
                      )}

                      {(task.status === 'repair_in_progress' || task.status === 'accepted' || task.status === 'assigned') && (
                        <Link
                          to={`/contractor/task/${task.id}`}
                          className="btn-gradient text-xs flex items-center gap-1 w-full sm:w-auto justify-center"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Upload AFTER Photo & Verify
                        </Link>
                      )}

                      {(task.status === 'ai_verification' || task.status === 'verified' || task.status === 'needs_review' || task.status === 'completed') && (
                        <Link
                          to={`/contractor/task/${task.id}`}
                          className="btn-ghost text-xs text-cyan-300 hover:text-cyan-200"
                        >
                          View Verification Status →
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </AnimatedPage>
    </Layout>
  )
}
