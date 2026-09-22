import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, FilePlus, MapPin, TrendingUp } from 'lucide-react'
import { Layout } from '../../components/layout/Layout'
import { AnimatedPage } from '../../components/ui/AnimatedPage'
import { Chatbot } from '../../components/chat/Chatbot'
import { IssueCard } from '../../components/issues/IssueCard'
import { StatCard } from '../../components/ui/StatCard'
import { TrustScore } from '../../components/ui/TrustScore'
import { useAuth } from '../../context/AuthContext'
import { useIssues } from '../../context/IssueContext'
import { useGeolocation } from '../../hooks/useGeolocation'
import { getPriorityTop, getReporterStats } from '../../services/issueService'
import type { Issue } from '../../types'

export function UserDashboard() {
  const { user } = useAuth()
  const { issues, loading, error } = useIssues()
  const geo = useGeolocation()
  const [nearby, setNearby] = useState<Issue[]>([])
  const [myStats, setMyStats] = useState({ total: 0, reported: 0, inProgress: 0, resolved: 0 })

  useEffect(() => {
    if (user) {
      getReporterStats(user.id).then(setMyStats).catch(console.error)
    }
  }, [user, issues])

  useEffect(() => {
    if (geo.lat != null && geo.lng != null) {
      getPriorityTop(geo.lat, geo.lng, 3).then(setNearby).catch(console.error)
    } else if (!geo.loading) {
      getPriorityTop(undefined, undefined, 3).then(setNearby).catch(console.error)
    }
  }, [geo.lat, geo.lng, geo.loading, issues])

  return (
    <Layout>
      <AnimatedPage>
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">
              Welcome, <span className="text-gradient">{user?.name}</span>
            </h1>
            <p className="text-slate-400">Report issues, track progress, and explore nearby problems.</p>
          </div>
          <TrustScore score={user?.trustScore ?? 0} />
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error} — run <code className="text-red-200">npm run server</code>
          </div>
        )}

        {loading ? (
          <p className="text-slate-400">Loading from database...</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="My Reports" value={myStats.total} icon={FilePlus} delay={50} />
              <StatCard label="Active Nearby" value={nearby.length} icon={MapPin} accent="amber" delay={100} />
              <StatCard label="In Progress" value={myStats.inProgress} icon={TrendingUp} accent="blue" delay={150} />
              <StatCard label="Resolved" value={myStats.resolved} icon={AlertTriangle} accent="emerald" delay={200} />
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-100">High Priority Nearby</h2>
                  <Link to="/map" className="text-sm font-medium text-cyan-400 transition hover:text-cyan-300">
                    View on Pothole Map →
                  </Link>
                </div>
                <div className="space-y-4">
                  {nearby.length === 0 ? (
                    <p className="text-slate-500">No active issues nearby.</p>
                  ) : (
                    nearby.map((issue, i) => <IssueCard key={issue.id} issue={issue} delay={i * 80} />)
                  )}
                </div>
              </div>

              <div className="animate-fade-in-up stagger-3">
                <Chatbot />
                <Link to="/report" className="btn-primary mt-4 w-full py-3">
                  <FilePlus className="h-5 w-5" />
                  Report New Issue
                </Link>
              </div>
            </div>
          </>
        )}
      </AnimatedPage>
    </Layout>
  )
}
