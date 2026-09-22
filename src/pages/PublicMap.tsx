import { useEffect, useState } from 'react'
import { Layout } from '../components/layout/Layout'
import { AnimatedPage } from '../components/ui/AnimatedPage'
import { IssueMap } from '../components/map/IssueMap'
import { getAllIssues } from '../services/issueService'
import type { Issue } from '../types'
import { MapPin, ShieldCheck } from 'lucide-react'

export function PublicMap() {
  const [issues, setIssues] = useState<Issue[]>([])
  const [filter, setFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const data = await getAllIssues()
        setIssues(data)
      } catch (err) {
        console.error('Failed to load public map issues:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filteredIssues = issues.filter((i) => {
    if (filter === 'completed') return i.status === 'completed' || i.status === 'verified' || i.status === 'resolved'
    if (filter === 'in_progress') return i.status === 'repair_in_progress' || i.status === 'accepted' || i.status === 'assigned'
    if (filter === 'reported') return i.status === 'reported' || i.status === 'under_review'
    return true
  })

  return (
    <Layout>
      <AnimatedPage>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col justify-between gap-4 rounded-2xl bg-gradient-to-r from-cyan-500/10 via-purple-500/10 to-emerald-500/10 p-6 border border-cyan-500/20 shadow-xl sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/20 text-cyan-400 shadow-inner">
                <MapPin className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-100">Public Pothole Transparency Map</h1>
                <p className="text-sm text-slate-400">
                  Track municipal pothole complaints from report to verified repair completion.
                </p>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilter('all')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  filter === 'all' ? 'bg-cyan-500 text-slate-950 font-bold' : 'bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                All ({issues.length})
              </button>
              <button
                onClick={() => setFilter('reported')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  filter === 'reported' ? 'bg-rose-500 text-white font-bold' : 'bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                Reported
              </button>
              <button
                onClick={() => setFilter('in_progress')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  filter === 'in_progress' ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                In Progress
              </button>
              <button
                onClick={() => setFilter('completed')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  filter === 'completed' ? 'bg-emerald-500 text-slate-950 font-bold' : 'bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                Verified Repairs
              </button>
            </div>
          </div>

          {/* Interactive Map */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-xl space-y-4">
            <div className="h-[450px] w-full overflow-hidden rounded-xl border border-white/10 shadow-inner">
              {loading ? (
                <div className="flex h-full items-center justify-center text-slate-400">Loading map...</div>
              ) : (
                <IssueMap
                  issues={filteredIssues}
                  onSelectIssue={(issue) => setSelectedIssue(issue)}
                />
              )}
            </div>

            {/* Selected Pothole Detail Drawer */}
            {selectedIssue && (
              <div className="rounded-xl border border-cyan-500/30 bg-black/50 p-5 space-y-4 animate-fade-in">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono text-xs font-bold text-cyan-400">
                      {selectedIssue.complaintId || `PT-2026-${selectedIssue.id.slice(-5).toUpperCase()}`}
                    </span>
                    <h3 className="text-lg font-bold text-slate-100">{selectedIssue.title}</h3>
                    <p className="text-xs text-slate-400">{selectedIssue.location.address}</p>
                  </div>
                  <button onClick={() => setSelectedIssue(null)} className="text-slate-400 hover:text-white text-xs">
                    ✕ Close
                  </button>
                </div>

                {/* Side-by-side Photo Comparison if completed */}
                {selectedIssue.afterImage ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <span className="text-[0.7rem] font-bold text-amber-400 block mb-1">BEFORE (Reported Pothole)</span>
                      <img src={selectedIssue.imageUrl} alt="Before" className="h-40 w-full object-cover rounded-lg border border-white/10" />
                    </div>
                    <div>
                      <span className="text-[0.7rem] font-bold text-emerald-400 block mb-1">AFTER (AI Verified Repair)</span>
                      <img src={selectedIssue.afterImage} alt="After" className="h-40 w-full object-cover rounded-lg border border-emerald-500/30" />
                    </div>
                  </div>
                ) : (
                  selectedIssue.imageUrl && (
                    <img src={selectedIssue.imageUrl} alt="Pothole" className="h-44 w-full object-cover rounded-lg border border-white/10" />
                  )
                )}

                {selectedIssue.verificationResult && (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-xs text-emerald-300 border border-emerald-500/20">
                    <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
                    <div>
                      <span className="font-bold block">AI Repair Verification Result: {selectedIssue.verificationResult.overallResult}</span>
                      <span className="text-[0.7rem] text-slate-400">
                        GPS Match: {selectedIssue.verificationResult.gpsMatchScore}% • Landmark Surroundings Match: {selectedIssue.verificationResult.backgroundScore}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </AnimatedPage>
    </Layout>
  )
}
