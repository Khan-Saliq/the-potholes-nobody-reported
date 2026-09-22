import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle, Clock, FileWarning, ShieldAlert, Wrench, HardHat, ArrowRight } from 'lucide-react'
import { Layout } from '../../components/layout/Layout'
import { AnimatedPage } from '../../components/ui/AnimatedPage'
import { IssueCard } from '../../components/issues/IssueCard'
import { StatCard } from '../../components/ui/StatCard'
import { useIssues } from '../../context/IssueContext'
import { useConfig } from '../../context/ConfigContext'
import { getAllIssues, getStats } from '../../services/issueService'
import { clearAllUploadsAndIssues } from '../../services/uploadService'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useConfirm } from '../../context/ConfirmContext'
import type { Issue } from '../../types'

type DashboardTab = 'new_issues' | 'in_progress' | 'exceptions' | 'completed'

export function AdminDashboard() {
  const { stats, loading, error, refreshIssues } = useIssues()
  const { user } = useAuth()
  const { config } = useConfig()
  const { toast } = useToast()
  const { confirmAction } = useConfirm()
  const [issuesList, setIssuesList] = useState<Issue[]>([])
  const [activeTab, setActiveTab] = useState<DashboardTab>('new_issues')
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all')
  const [departmentStats, setDepartmentStats] = useState<any>(stats)
  const [clearing, setClearing] = useState(false)
  const [clearMessage, setClearMessage] = useState<string | null>(null)
  const [clearError, setClearError] = useState<string | null>(null)

  const handleSeedDemo = () => {
    confirmAction({
      title: 'Seed Hackathon Demo Scenarios',
      description: 'Seed 5 pre-packaged Demo Pothole Complaints (A to E) with photos and GPS coordinates for testing?',
      confirmText: 'Seed Demo Data',
      variant: 'primary',
      onConfirm: async () => {
        try {
          const { seedDemoScenarios } = await import('../../services/issueService')
          const res = await seedDemoScenarios()
          await refreshIssues()
          toast.success('Demo Data Seeded', res.message)
          window.location.reload()
        } catch (err: any) {
          toast.error('Failed to Seed Data', err.message || 'Failed to seed demo scenarios')
        }
      },
    })
  }

  const handleClearAll = () => {
    setClearMessage(null)
    setClearError(null)
    confirmAction({
      title: 'Purge All Database Records',
      description: 'Delete all issues, upload records, and related DB info? This action cannot be undone.',
      confirmText: 'Delete Everything',
      variant: 'danger',
      onConfirm: async () => {
        setClearing(true)
        try {
          await clearAllUploadsAndIssues()
          await refreshIssues()
          setClearMessage('All issues and uploads were cleared successfully.')
          toast.success('Database Cleared', 'All issues and uploads were cleared successfully.')
        } catch (err: any) {
          setClearError(err.message)
          toast.error('Clear Failed', err.message)
        } finally {
          setClearing(false)
        }
      },
    })
  }

  const departments = useMemo(() => {
    const items = config?.categories.map((category) => category.department ?? '') ?? []
    return Array.from(new Set(items.filter(Boolean)))
  }, [config])



  useEffect(() => {
    const fetchIssues = async () => {
      try {
        const params: Record<string, string> = {}
        if (selectedDepartment && selectedDepartment !== 'all') {
          params.department = selectedDepartment
        }
        const list = await getAllIssues(params)
        setIssuesList(list)
      } catch (err) {
        console.error('Failed to fetch issues:', err)
      }
    }
    fetchIssues()
  }, [stats, selectedDepartment])

  useEffect(() => {
    const loadStats = async () => {
      try {
        const params: Record<string, string> = {}
        if (selectedDepartment && selectedDepartment !== 'all') {
          params.department = selectedDepartment
        }
        const statsData = await getStats(params)
        setDepartmentStats(statsData)
      } catch (err) {
        console.error(err)
      }
    }

    loadStats()
  }, [user, selectedDepartment])

  // Filter issues based on selected Tab
  const newActionableIssues = useMemo(() => {
    return issuesList.filter(i => i.status === 'reported' || i.status === 'under_review')
  }, [issuesList])

  const inProgressIssues = useMemo(() => {
    return issuesList.filter(i => i.status === 'assigned' || i.status === 'accepted' || i.status === 'repair_in_progress')
  }, [issuesList])

  const exceptionIssues = useMemo(() => {
    return issuesList.filter(i => i.status === 'needs_review' || i.status === 'suspicious')
  }, [issuesList])

  const completedIssues = useMemo(() => {
    return issuesList.filter(i => i.status === 'completed' || i.status === 'resolved')
  }, [issuesList])

  const displayedIssues = useMemo(() => {
    switch (activeTab) {
      case 'new_issues': return newActionableIssues
      case 'in_progress': return inProgressIssues
      case 'exceptions': return exceptionIssues
      case 'completed': return completedIssues
      default: return newActionableIssues
    }
  }, [activeTab, newActionableIssues, inProgressIssues, exceptionIssues, completedIssues])

  return (
    <Layout>
      <AnimatedPage>
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">
              Municipal Admin <span className="text-gradient">Dashboard</span>
            </h1>
            <p className="text-slate-400">Automatic AI evidence verification is active. Focus on actionable issues and exception reviews.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleSeedDemo}
              className="btn-gradient rounded-xl px-4 py-2 text-sm font-bold shadow-lg"
            >
              🌱 Seed Hackathon Demo Scenarios (Complaints A–E)
            </button>
            <button
              onClick={handleClearAll}
              disabled={clearing}
              className="btn-ghost rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
            >
              {clearing ? 'Clearing...' : 'Clear All Issues'}
            </button>
          </div>
        </div>

        {error && <div className="mb-4 text-red-300">{error}</div>}
        {clearError && <div className="mb-4 text-red-300">{clearError}</div>}
        {clearMessage && <div className="mb-4 text-emerald-300">{clearMessage}</div>}

        {loading ? (
          <p className="text-slate-400">Loading dashboard...</p>
        ) : (
          <>
            {/* Department Filter & Action Required Cards */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-slate-300">Department View:</span>
                {user?.role === 'admin' ? (
                  <select
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    className="input-dark w-auto text-sm"
                  >
                    <option value="all">All Municipal Departments</option>
                    {departments.map((dept) => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                ) : (
                  <span className="rounded-full bg-cyan-500/10 border border-cyan-500/30 px-3 py-1 text-sm text-cyan-300 font-semibold">
                    {user?.department || 'Unknown Department'}
                  </span>
                )}
              </div>
            </div>

            {/* Top Metrics Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
              <StatCard label="Actionable Complaints" value={departmentStats.reported || newActionableIssues.length} icon={FileWarning} accent="teal" delay={50} />
              <StatCard label="Active Work Orders" value={(departmentStats.assigned || 0) + (departmentStats.inProgress || 0)} icon={Wrench} accent="blue" delay={100} />
              <StatCard label="Awaiting Exception Review" value={departmentStats.needsReview || exceptionIssues.length} icon={ShieldAlert} accent="red" delay={150} />
              <StatCard label="Auto-Verified Repairs" value={departmentStats.completed || completedIssues.length} icon={CheckCircle} accent="emerald" delay={200} />
            </div>

            {/* Action Required / Exception Alert Bar */}
            {((departmentStats.suspicious || 0) > 0 || (departmentStats.uncertain || 0) > 0 || (departmentStats.slaBreached || 0) > 0) && (
              <div className="mb-8 p-5 rounded-2xl bg-slate-900/90 border border-rose-500/30 shadow-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-rose-400" />
                    Exceptions Requiring Admin Attention
                  </h3>
                  <button
                    onClick={() => setActiveTab('exceptions')}
                    className="text-xs font-semibold text-rose-300 hover:underline flex items-center gap-1"
                  >
                    View Exceptions Queue <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 flex items-center justify-between">
                    <span className="text-xs text-rose-200">🔴 Suspicious Repair Submissions</span>
                    <span className="font-mono text-lg font-bold text-rose-400">{departmentStats.suspicious || 0}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 flex items-center justify-between">
                    <span className="text-xs text-amber-200">🟡 Camera Angle / Perspective Shifts</span>
                    <span className="font-mono text-lg font-bold text-amber-400">{departmentStats.uncertain || 0}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-violet-950/40 border border-violet-500/30 flex items-center justify-between">
                    <span className="text-xs text-violet-200">🔴 SLA Overdue Work Orders</span>
                    <span className="font-mono text-lg font-bold text-violet-400">{departmentStats.slaBreached || 0}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Dashboard Categorized Tabs */}
            <div className="mt-8">
              <div className="flex border-b border-slate-800 gap-2 mb-6 overflow-x-auto">
                <button
                  onClick={() => setActiveTab('new_issues')}
                  className={`pb-3 px-4 text-sm font-semibold transition-all relative flex items-center gap-2 ${
                    activeTab === 'new_issues'
                      ? 'text-cyan-400 border-b-2 border-cyan-400'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FileWarning className="h-4 w-4" />
                  New Actionable Complaints
                  <span className="ml-1 rounded-full bg-cyan-500/20 px-2 py-0.5 text-xs text-cyan-300 border border-cyan-500/30">
                    {newActionableIssues.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('in_progress')}
                  className={`pb-3 px-4 text-sm font-semibold transition-all relative flex items-center gap-2 ${
                    activeTab === 'in_progress'
                      ? 'text-blue-400 border-b-2 border-blue-400'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <HardHat className="h-4 w-4" />
                  Assigned & In Progress
                  <span className="ml-1 rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-300 border border-blue-500/30">
                    {inProgressIssues.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('exceptions')}
                  className={`pb-3 px-4 text-sm font-semibold transition-all relative flex items-center gap-2 ${
                    activeTab === 'exceptions'
                      ? 'text-rose-400 border-b-2 border-rose-400'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ShieldAlert className="h-4 w-4" />
                  Awaiting Exception Review
                  <span className="ml-1 rounded-full bg-rose-500/20 px-2 py-0.5 text-xs text-rose-300 border border-rose-500/30">
                    {exceptionIssues.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('completed')}
                  className={`pb-3 px-4 text-sm font-semibold transition-all relative flex items-center gap-2 ${
                    activeTab === 'completed'
                      ? 'text-emerald-400 border-b-2 border-emerald-400'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <CheckCircle className="h-4 w-4" />
                  Completed & Auto-Verified
                  <span className="ml-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300 border border-emerald-500/30">
                    {completedIssues.length}
                  </span>
                </button>
              </div>

              {/* Tab Content Rendering */}
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-4">
                  {displayedIssues.length === 0 ? (
                    <div className="glass-card p-8 text-center text-slate-400">
                      No issues found in this category.
                    </div>
                  ) : (
                    displayedIssues.map((issue, i) => (
                      <IssueCard key={issue.id} issue={issue} adminLink delay={i * 60} />
                    ))
                  )}
                </div>

                <div className="space-y-4">
                  <div className="glass-card p-5">
                    <h3 className="font-semibold text-slate-100 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-cyan-400" />
                      Automatic Workflow Active
                    </h3>
                    <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                      Citizen uploads are automatically AI-verified for pothole validity. Verified repairs by contractors automatically close complaints.
                    </p>
                  </div>

                  <div className="glass-card p-5 border-cyan-500/30">
                    <h3 className="font-semibold text-slate-100">User Role Management</h3>
                    <p className="mt-1 text-xs text-slate-400">Manage Citizen, Admin, and Contractor authorizations.</p>
                    <Link to="/admin/users" className="btn-primary mt-3 block text-center text-xs font-bold py-2">
                      Open Role Manager →
                    </Link>
                  </div>

                  <Link to="/admin/issues" className="btn-ghost block w-full py-3 text-center text-cyan-400 text-sm">
                    View All Issues Database →
                  </Link>
                </div>
              </div>
            </div>
          </>
        )}
      </AnimatedPage>
    </Layout>
  )
}
