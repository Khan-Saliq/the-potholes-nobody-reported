import { useEffect, useMemo, useState } from 'react'
import { Layout } from '../../components/layout/Layout'
import { AnimatedPage } from '../../components/ui/AnimatedPage'
import { IssueCard } from '../../components/issues/IssueCard'
import { useConfig } from '../../context/ConfigContext'
import { useAuth } from '../../context/AuthContext'
import { getAllIssues, exportIssues, clearAllIssues } from '../../services/issueService'
import { clearCachedIssuesLocally } from '../../services/offlineStorage'
import type { Issue, IssueStatus } from '../../types'
import { Download, Filter, Calendar, Trash2 } from 'lucide-react'
import { useToast } from '../../context/ToastContext'
import { useConfirm } from '../../context/ConfirmContext'

export function AdminIssues() {
  const { config } = useConfig()
  const { user } = useAuth()
  const { toast } = useToast()
  const { confirmAction } = useConfirm()
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<IssueStatus | 'all'>('all')
  const [sortBy, setSortBy] = useState<'priority' | 'date'>('priority')
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all')
  const [clearing, setClearing] = useState(false)
  
  // Advanced filters
  const [showFilters, setShowFilters] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [filterMonth, setFilterMonth] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [exporting, setExporting] = useState(false)

  const handleClearAllIssues = () => {
    confirmAction({
      title: 'Clear All System Issues & Notifications',
      description: (
        <div className="space-y-2 text-xs">
          <p className="font-bold text-rose-300">Are you sure you want to clear ALL issues from the database?</p>
          <p className="text-slate-300">
            This action will permanently delete all pothole complaints, citizen report timelines, contractor task assignments, and clear all user/contractor notifications across the platform.
          </p>
        </div>
      ),
      variant: 'danger',
      confirmText: 'Yes, Clear All Issues',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          setClearing(true)
          const res = await clearAllIssues()
          await clearCachedIssuesLocally()
          window.dispatchEvent(new Event('civicsync_sync_event'))
          toast.success('System Reset Successful', res.message || 'All issues and notifications cleared.')
          setIssues([])
        } catch (err: any) {
          console.error('Failed to clear issues:', err)
          toast.error('Clear Failed', err?.message || 'Failed to clear issues from database')
        } finally {
          setClearing(false)
        }
      },
    })
  }

  const departments = useMemo(
    () => Array.from(new Set((config?.categories ?? []).map((category) => category.department ?? '').filter(Boolean))),
    [config]
  )

  useEffect(() => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (statusFilter !== 'all') params.status = statusFilter
    if (startDate) params.startDate = startDate
    if (endDate) params.endDate = endDate
    if (filterMonth) params.month = filterMonth
    if (filterYear) params.year = filterYear
    if (sortBy === 'date') params.sort = 'date'
    if (selectedDepartment !== 'all') {
      params.department = selectedDepartment
    }
    getAllIssues(params)
      .then(setIssues)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [statusFilter, startDate, endDate, filterMonth, filterYear, sortBy, selectedDepartment])

  const handleExport = async () => {
    setExporting(true)
    try {
      const filters = {
        status: statusFilter !== 'all' ? statusFilter : undefined,
        department: selectedDepartment !== 'all' ? selectedDepartment : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        month: filterMonth || undefined,
        year: filterYear || undefined,
      }
      await exportIssues(filters)
      toast.success('Issues Exported', 'Issues report downloaded successfully.')
    } catch (error: any) {
      console.error('Export failed:', error)
      toast.error('Export Failed', error?.message || 'Failed to export issues')
    } finally {
      setExporting(false)
    }
  }

  const clearFilters = () => {
    setStartDate('')
    setEndDate('')
    setFilterMonth('')
    setFilterYear('')
  }

  const hasActiveFilters = Boolean(startDate || endDate || filterMonth || filterYear)

  return (
    <Layout>
      <AnimatedPage>
        <h1 className="text-2xl font-bold text-slate-100">
          Issue <span className="text-gradient">Management</span>
        </h1>
        <p className="mt-1 text-slate-400">Review, assign, and update civic issues by priority.</p>

        <div className="mt-6 flex flex-wrap gap-3">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as IssueStatus | 'all')} className="input-dark w-auto text-sm">
            <option value="all">All Statuses</option>
            {(config?.statuses ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'priority' | 'date')} className="input-dark w-auto text-sm">
            <option value="priority">Sort by Priority</option>
            <option value="date">Sort by Date</option>
          </select>
          
          {/* Advanced Filters Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-all ${
              hasActiveFilters || showFilters
                ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                : 'border-white/10 bg-white/5 text-slate-300 hover:border-violet-500/30'
            }`}
          >
            <Filter className="h-4 w-4" />
            Advanced Filters
            {hasActiveFilters && (
              <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500 text-xs text-white">
                {[startDate, endDate, filterMonth, filterYear].filter(Boolean).length}
              </span>
            )}
          </button>
          
          {/* Export Button */}
          <button
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-2 text-sm font-medium text-white transition-all hover:shadow-lg hover:shadow-emerald-500/30 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {exporting ? 'Exporting...' : 'Export Excel'}
          </button>

          {/* Clear All Issues Button (Admin Only) */}
          {user?.role === 'admin' && (
            <button
              onClick={handleClearAllIssues}
              disabled={clearing || issues.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-700 px-3 py-2 text-sm font-medium text-white transition-all hover:shadow-lg hover:shadow-rose-500/30 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {clearing ? 'Clearing...' : 'Clear All Issues'}
            </button>
          )}
          
          {user?.role === 'admin' && (
            <select value={selectedDepartment} onChange={(e) => setSelectedDepartment(e.target.value)} className="input-dark w-auto text-sm">
              <option value="all">All Departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          )}

        </div>

        {/* Advanced Filters Panel */}
        {showFilters && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <Calendar className="h-4 w-4 text-cyan-400" />
                Filter Issues
              </h3>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-cyan-400 hover:text-cyan-300"
                >
                  Clear All Filters
                </button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              
              {/* Start Date */}
              <div>
                <label className="mb-1 block text-xs text-slate-400">From Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="input-dark w-full text-sm"
                />
              </div>
              
              {/* End Date */}
              <div>
                <label className="mb-1 block text-xs text-slate-400">To Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="input-dark w-full text-sm"
                />
              </div>
              
              {/* Month Filter */}
              <div>
                <label className="mb-1 block text-xs text-slate-400">Month</label>
                <select
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                  className="input-dark w-full text-sm"
                >
                  <option value="">All Months</option>
                  <option value="1">January</option>
                  <option value="2">February</option>
                  <option value="3">March</option>
                  <option value="4">April</option>
                  <option value="5">May</option>
                  <option value="6">June</option>
                  <option value="7">July</option>
                  <option value="8">August</option>
                  <option value="9">September</option>
                  <option value="10">October</option>
                  <option value="11">November</option>
                  <option value="12">December</option>
                </select>
              </div>
              
              {/* Year Filter */}
              <div>
                <label className="mb-1 block text-xs text-slate-400">Year</label>
                <select
                  value={filterYear}
                  onChange={(e) => setFilterYear(e.target.value)}
                  className="input-dark w-full text-sm"
                >
                  <option value="">All Years</option>
                  <option value="2026">2026</option>
                  <option value="2025">2025</option>
                  <option value="2024">2024</option>
                  <option value="2023">2023</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <p className="mt-6 text-slate-400">Loading issues...</p>
        ) : (
          <div className="mt-6 space-y-4">
            {issues.map((issue, i) => (
              <IssueCard key={issue.id} issue={issue} adminLink delay={i * 50} />
            ))}
          </div>
        )}
      </AnimatedPage>
    </Layout>
  )
}
