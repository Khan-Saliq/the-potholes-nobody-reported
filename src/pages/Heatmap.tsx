import { useEffect, useState } from 'react'
import { Layout } from '../components/layout/Layout'
import { AnimatedPage } from '../components/ui/AnimatedPage'
import { IssueMap } from '../components/map/IssueMap'
import { useIssues } from '../context/IssueContext'
import { getClusters } from '../services/issueService'

interface Cluster {
  id: string
  area: string
  issueCount: number
  totalReports: number
  maxPriority: number
}

export function Heatmap() {
  const { issues, loading } = useIssues()
  const [clusters, setClusters] = useState<Cluster[]>([])

  useEffect(() => {
    getClusters()
      .then(setClusters)
      .catch(console.error)
  }, [issues])

  return (
    <Layout>
      <AnimatedPage>
        <h1 className="text-2xl font-bold text-slate-100">
          Issue <span className="text-gradient">Heatmap</span>
        </h1>
        <p className="mt-1 text-slate-400">Geographic intensity and clustered problem zones.</p>

        <div className="mt-6 flex flex-wrap items-center gap-3 animate-fade-in-up stagger-1">
          <span className="px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold flex items-center gap-2">
            <span>🛣️ Clustered Pothole Hotspots</span>
          </span>
        </div>

        {loading ? (
          <p className="mt-4 text-slate-400">Loading map data...</p>
        ) : (
          <div className="mt-4">
            <IssueMap issues={issues} showHeatmap height="500px" />
          </div>
        )}

        <div className="mt-8 animate-fade-in-up stagger-2">
          <h2 className="text-lg font-semibold text-slate-100">Clustered Issues</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {clusters.map((c, i) => (
              <div key={c.id} className={`glass-card p-4 animate-fade-in-up stagger-${(i % 6) + 1}`}>
                <p className="font-medium text-slate-100">{c.area}</p>
                <p className="mt-1 text-sm text-slate-500">{c.issueCount} linked issues</p>
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-slate-400">{c.totalReports} total reports</span>
                  <span className="font-semibold text-red-400">Priority {c.maxPriority}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </AnimatedPage>
    </Layout>
  )
}
