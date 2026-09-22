import { useEffect, useState } from 'react'
import { Layout } from '../../components/layout/Layout'
import { AnimatedPage } from '../../components/ui/AnimatedPage'
import { StatCard } from '../../components/ui/StatCard'
import { getContractorAnalytics } from '../../services/issueService'
import type { Issue } from '../../types'
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  HardHat,
  RefreshCw,
  Star,
  Wrench,
} from 'lucide-react'

export function ContractorAnalytics() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = async () => {
    try {
      setLoading(true)
      const res = await getContractorAnalytics()
      setData(res)
    } catch (err: any) {
      setError(err.message || 'Failed to load contractor analytics')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  return (
    <Layout>
      <AnimatedPage>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col justify-between gap-4 rounded-2xl bg-gradient-to-r from-purple-500/10 via-amber-500/10 to-cyan-500/10 p-6 border border-purple-500/20 shadow-xl sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-500/20 text-purple-400 shadow-inner">
                <HardHat className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-100">Contractor Performance Analytics</h1>
                <p className="text-sm text-slate-400">
                  Monitor contractor SLA compliance, repair verification records, and recurring pothole flags.
                </p>
              </div>
            </div>
            <button onClick={loadData} className="btn-ghost text-xs flex items-center gap-1">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh Analytics
            </button>
          </div>

          {loading ? (
            <div className="py-16 text-center text-slate-400 animate-pulse">Loading contractor analytics...</div>
          ) : error ? (
            <div className="py-12 text-center text-rose-400">{error}</div>
          ) : (
            <>
              {/* Stats Overview */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Total Contractors" value={data?.summary?.totalContractors || 0} icon={HardHat} accent="teal" />
                <StatCard label="Assigned Repairs" value={data?.summary?.totalAssignedTasks || 0} icon={Wrench} accent="amber" />
                <StatCard label="Verified Completed" value={data?.summary?.totalVerifiedRepairs || 0} icon={CheckCircle2} accent="emerald" />
                <StatCard label="Recurring Pothole Flags" value={data?.summary?.totalRecurringPotholes || 0} icon={AlertTriangle} accent="red" />
              </div>

              {/* Contractor Performance Table */}
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur-xl space-y-4">
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <Award className="h-5 w-5 text-amber-400" />
                  Contractor Performance Scorecards
                </h2>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-white/5 text-slate-400 uppercase font-semibold">
                      <tr>
                        <th className="p-3">Contractor / Company</th>
                        <th className="p-3">Rating</th>
                        <th className="p-3 text-center">Assigned</th>
                        <th className="p-3 text-center">Completed</th>
                        <th className="p-3 text-center">Awaiting Verification</th>
                        <th className="p-3 text-center">Suspicious Mismatches</th>
                        <th className="p-3 text-center">SLA Compliance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {data?.contractors?.map((c: any) => (
                        <tr key={c.contractorId} className="hover:bg-white/[0.03] transition">
                          <td className="p-3">
                            <span className="font-bold text-slate-100 block">{c.name}</span>
                            <span className="text-[0.7rem] text-slate-400">{c.companyName} • {c.assignedDepartment}</span>
                          </td>
                          <td className="p-3">
                            <span className="inline-flex items-center gap-1 font-bold text-amber-400">
                              <Star className="h-3.5 w-3.5 fill-amber-400" /> {c.rating}
                            </span>
                          </td>
                          <td className="p-3 text-center font-bold text-slate-200">{c.totalAssigned}</td>
                          <td className="p-3 text-center font-bold text-emerald-400">{c.completedRepairs}</td>
                          <td className="p-3 text-center font-bold text-purple-400">{c.awaitingVerification}</td>
                          <td className="p-3 text-center">
                            <span className={`font-bold ${c.suspiciousSubmissions > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                              {c.suspiciousSubmissions}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`rounded-full px-2.5 py-1 text-[0.7rem] font-bold ${
                              c.slaComplianceRate >= 90 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                            }`}>
                              {c.slaComplianceRate}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recurring Potholes Section */}
              {data?.recurringPotholes?.length > 0 && (
                <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-6 backdrop-blur-xl space-y-4">
                  <h2 className="text-lg font-bold text-rose-300 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-rose-400" />
                    ⚠️ Recurring Potholes Alert (Reappeared at Same Location)
                  </h2>
                  <p className="text-xs text-slate-400">
                    The following potholes reopened within 20 meters of a recently completed repair. This indicates sub-standard asphalt quality or drainage issues requiring deeper audit.
                  </p>

                  <div className="grid gap-4 md:grid-cols-2">
                    {data.recurringPotholes.map((issue: Issue) => (
                      <div key={issue.id} className="rounded-xl border border-rose-500/20 bg-black/40 p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-rose-400">
                            {issue.complaintId || `PT-2026-${issue.id.slice(-5).toUpperCase()}`}
                          </span>
                          <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[0.65rem] font-bold text-rose-300 border border-rose-500/30">
                            ⚠️ RECURRING POTHOLE
                          </span>
                        </div>
                        <h3 className="text-sm font-semibold text-slate-100">{issue.title}</h3>
                        <p className="text-xs text-slate-400">{issue.location.address}</p>
                        <div className="text-[0.7rem] text-slate-400 pt-2 border-t border-white/5 flex items-center justify-between">
                          <span>Previous Complaint: <strong className="text-slate-200">{issue.previousComplaintCode || 'PT-2026-00101'}</strong></span>
                          <span>Reappeared within <strong className="text-rose-300">{issue.recurringDistanceMeters || 8} meters</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </AnimatedPage>
    </Layout>
  )
}
