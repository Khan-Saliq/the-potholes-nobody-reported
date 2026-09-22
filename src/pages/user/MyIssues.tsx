import { useEffect, useState } from 'react'
import { Layout } from '../../components/layout/Layout'
import { AnimatedPage } from '../../components/ui/AnimatedPage'
import { useAuth } from '../../context/AuthContext'
import { getIssuesByReporter } from '../../services/issueService'
import { getCachedIssuesLocally, cacheIssuesLocally } from '../../services/offlineStorage'
import { fixImageUrl } from '../../services/api'
import type { Issue } from '../../types'

export function MyIssues() {
  const { user } = useAuth()
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)

  const loadAllIssues = async (isSilent = false) => {
    if (!user) return
    try {
      if (!isSilent) setLoading(true)
      const cached = await getCachedIssuesLocally()
      const myCached = cached.filter((i) => i.reporterId === user.id)
      const offlineDrafts = myCached.filter((i) => String(i.id).startsWith('OFF-') || i.status === 'pending_sync')

      let serverIssues: Issue[] = []
      let fetchedOnline = false
      try {
        if (navigator.onLine) {
          serverIssues = await getIssuesByReporter(user.id)
          await cacheIssuesLocally(serverIssues)
          fetchedOnline = true
        }
      } catch (e) {
        console.warn('Could not fetch online issues, using IndexedDB cache:', e)
      }

      if (fetchedOnline) {
        const map = new Map<string, any>()
        serverIssues.forEach((i) => map.set(String(i.id || i.complaintId || Math.random()), i))
        offlineDrafts.forEach((i) => map.set(String(i.id || i.complaintId || Math.random()), i))
        const merged = Array.from(map.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        setIssues(merged)
      } else {
        const merged = myCached.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        setIssues(merged)
      }
    } catch (err) {
      console.error('Error loading my issues:', err)
    } finally {
      if (!isSilent) setLoading(false)
    }
  }

  useEffect(() => {
    loadAllIssues(false)
    const handleSyncEvent = (e: Event) => {
      const customEvt = e as CustomEvent
      if (!customEvt.detail || customEvt.detail.type === 'ITEM_SYNCED') {
        loadAllIssues(true)
      }
    }
    window.addEventListener('civicsync_sync_event', handleSyncEvent)
    return () => window.removeEventListener('civicsync_sync_event', handleSyncEvent)
  }, [user])

  return (
    <Layout>
      <AnimatedPage>
        <h1 className="text-2xl font-bold text-slate-100">
          My <span className="text-gradient">Issues</span>
        </h1>
        <p className="mt-1 text-slate-400">Track status and priority of your submitted reports.</p>

        {loading ? (
          <p className="mt-8 text-slate-400">Loading your issues...</p>
        ) : issues.length === 0 ? (
          <div className="glass-card mt-8 animate-scale-in p-12 text-center">
            <p className="text-slate-400">You haven&apos;t reported any issues yet.</p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {issues.map((issue) => (
              <div key={issue.id} id={issue.id} className="glass-card p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                  <div>
                    <span className="font-mono text-xs font-bold text-cyan-400">
                      {issue.complaintId || `PT-2026-${issue.id.slice(-5).toUpperCase()}`}
                    </span>
                    <h3 className="text-lg font-bold text-slate-100">{issue.title}</h3>
                    <p className="text-xs text-slate-400">{issue.location.address}</p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${
                      (issue as any).isOffline || (issue as any).syncStatus === 'WAITING_FOR_SYNC'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                        : issue.status === 'completed' || issue.status === 'verified' || issue.status === 'resolved'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    }`}>
                      {(issue as any).isOffline || (issue as any).syncStatus === 'WAITING_FOR_SYNC'
                        ? 'SAVED OFFLINE — WAITING FOR SYNC'
                        : `STATUS: ${issue.status.replace(/_/g, ' ').toUpperCase()}`}
                    </span>
                    {issue.contractorName && (
                      <p className="text-[0.7rem] text-slate-400 mt-1">Assigned: <span className="text-amber-300 font-semibold">{issue.contractorName}</span></p>
                    )}
                  </div>
                </div>

                {/* Transparent Status Stepper */}
                <div className="py-2">
                  <span className="text-xs font-semibold text-slate-400 block mb-2">Complaint Progress Timeline:</span>
                  <div className="flex items-center justify-between text-center text-[0.7rem]">
                    <div className="flex-1 space-y-1">
                      <div className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-slate-950 font-bold">✓</div>
                      <span className="text-emerald-300 font-medium block">Reported</span>
                    </div>

                    <div className={`h-0.5 flex-1 ${issue.status !== 'reported' ? 'bg-emerald-500' : 'bg-slate-700'}`}></div>

                    <div className="flex-1 space-y-1">
                      <div className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        ['assigned', 'accepted', 'repair_in_progress', 'ai_verification', 'verified', 'completed', 'resolved'].includes(issue.status)
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {['assigned', 'accepted', 'repair_in_progress', 'ai_verification', 'verified', 'completed', 'resolved'].includes(issue.status) ? '✓' : '2'}
                      </div>
                      <span className="text-slate-300 block">Assigned</span>
                    </div>

                    <div className={`h-0.5 flex-1 ${['repair_in_progress', 'ai_verification', 'verified', 'completed', 'resolved'].includes(issue.status) ? 'bg-emerald-500' : 'bg-slate-700'}`}></div>

                    <div className="flex-1 space-y-1">
                      <div className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        ['repair_in_progress', 'ai_verification', 'verified', 'completed', 'resolved'].includes(issue.status)
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {['repair_in_progress', 'ai_verification', 'verified', 'completed', 'resolved'].includes(issue.status) ? '✓' : '3'}
                      </div>
                      <span className="text-slate-300 block">Repair</span>
                    </div>

                    <div className={`h-0.5 flex-1 ${['verified', 'completed', 'resolved'].includes(issue.status) ? 'bg-emerald-500' : 'bg-slate-700'}`}></div>

                    <div className="flex-1 space-y-1">
                      <div className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        ['completed', 'resolved', 'verified'].includes(issue.status)
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {['completed', 'resolved', 'verified'].includes(issue.status) ? '✓' : '4'}
                      </div>
                      <span className="text-slate-300 block">AI Verified</span>
                    </div>
                  </div>
                </div>

                {/* Citizen Uploaded Proof & Repair Photo Display */}
                <div className="rounded-xl bg-black/40 p-4 border border-white/10 space-y-2">
                  <span className="text-xs font-bold text-slate-300 block">Report & Repair Photo Evidence</span>
                  <div className="grid gap-3 md:grid-cols-2">
                    {issue.imageUrl ? (
                      <div>
                        <span className="text-[0.65rem] text-cyan-300 font-semibold block mb-1">Your Uploaded Report Proof</span>
                        <img src={fixImageUrl(issue.imageUrl)} alt="Citizen Reported Pothole" className="h-36 w-full object-cover rounded-lg border border-cyan-500/30 ring-1 ring-cyan-500/20" />
                      </div>
                    ) : (
                      <div className="flex h-36 flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-900/50 p-4 text-center">
                        <span className="text-xs text-slate-500">No Image Attached</span>
                      </div>
                    )}

                    {issue.afterImage ? (
                      <div>
                        <span className="text-[0.65rem] text-emerald-400 font-semibold block mb-1">Contractor Repaired Surface</span>
                        <img src={fixImageUrl(issue.afterImage)} alt="Repaired Road Surface" className="h-36 w-full object-cover rounded-lg border border-emerald-500/30 ring-1 ring-emerald-500/20" />
                      </div>
                    ) : (
                      <div className="flex h-36 flex-col items-center justify-center rounded-lg border border-dashed border-slate-700/60 bg-slate-900/30 p-4 text-center">
                        <span className="text-xs text-slate-400 font-medium">Repair In Progress</span>
                        <span className="text-[0.65rem] text-slate-500 mt-1">Contractor repair proof will appear here upon completion</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </AnimatedPage>
    </Layout>
  )
}
