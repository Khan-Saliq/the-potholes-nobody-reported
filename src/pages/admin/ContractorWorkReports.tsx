import React, { useEffect, useState } from 'react'
import { Layout } from '../../components/layout/Layout'
import { AnimatedPage } from '../../components/ui/AnimatedPage'
import { useToast } from '../../context/ToastContext'
import { getContractors, getContractorWorkReport, exportContractorWorkReport } from '../../services/issueService'
import type { User, ContractorReportResponse, ContractorComparisonItem, DetailedWorkItem } from '../../types'
import {
  Download,
  Filter,
  Calendar,
  User as UserIcon,
  FileSpreadsheet,
  RefreshCw,
  Search,
  TrendingUp,
} from 'lucide-react'

export function ContractorWorkReports() {
  const { toast } = useToast()

  // Filter States
  const [contractors, setContractors] = useState<User[]>([])
  const [selectedContractorId, setSelectedContractorId] = useState<string>('all')
  const [fromDate, setFromDate] = useState<string>(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  })
  const [toDate, setToDate] = useState<string>(() => new Date().toISOString().split('T')[0])
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Data & Loading States
  const [reportData, setReportData] = useState<ContractorReportResponse | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [exporting, setExporting] = useState<boolean>(false)

  // Image Modal Preview State
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null)

  // Load Contractor List on Mount
  useEffect(() => {
    getContractors()
      .then(setContractors)
      .catch((err) => {
        console.error('Failed to load contractors list:', err)
        toast.error('Failed to load contractors list')
      })
  }, [toast])

  // Fetch Report Data
  const fetchReport = async () => {
    if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
      toast.warning('From Date cannot be later than To Date')
      return
    }

    setLoading(true)
    try {
      const data = await getContractorWorkReport({
        contractorId: selectedContractorId,
        fromDate,
        toDate,
        status: statusFilter,
      })
      setReportData(data)
    } catch (err: any) {
      console.error('Error fetching contractor report:', err)
      toast.error(err.message || 'Failed to fetch contractor report')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchReport()
  }, [])

  const handleApplyFilters = (e: React.FormEvent) => {
    e.preventDefault()
    fetchReport()
  }

  const handleResetFilters = () => {
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    const today = now.toISOString().split('T')[0]

    setSelectedContractorId('all')
    setFromDate(firstDay)
    setToDate(today)
    setStatusFilter('all')

    getContractorWorkReport({
      contractorId: 'all',
      fromDate: firstDay,
      toDate: today,
      status: 'all',
    })
      .then(setReportData)
      .catch(console.error)
  }

  const handleExportExcel = async () => {
    setExporting(true)
    try {
      await exportContractorWorkReport({
        contractorId: selectedContractorId,
        fromDate,
        toDate,
        status: statusFilter,
      })
      toast.success('Excel work report downloaded successfully!')
    } catch (err: any) {
      console.error('Export error:', err)
      toast.error(err.message || 'Failed to export Excel report')
    } finally {
      setExporting(false)
    }
  }

  const formatDateLabel = (dStr: string | null) => {
    if (!dStr) return '—'
    const date = new Date(dStr)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'repaired':
      case 'closed':
        return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
      case 'repair_in_progress':
      case 'accepted':
        return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
      case 'needs_review':
      case 'after_photo_submitted':
        return 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20'
      case 'assigned':
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
      default:
        return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20'
    }
  }

  return (
    <Layout>
      <AnimatedPage>
        <div className="space-y-6 pb-12">
          {/* Header Section */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                  <FileSpreadsheet className="w-6 h-6" />
                </span>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Admin → Contractor Work Reports</h1>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Filter by contractor and date range, inspect verified work completion metrics, and export formatted Excel (.xlsx) workbooks.
              </p>
            </div>

            <button
              onClick={handleExportExcel}
              disabled={exporting || loading || !reportData}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium shadow-md shadow-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {exporting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Generating Excel...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Export to Excel (.xlsx)
                </>
              )}
            </button>
          </div>

          {/* Filter Controls Bar */}
          <div className="p-5 rounded-2xl bg-white/70 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800/80 backdrop-blur-xl shadow-sm">
            <form onSubmit={handleApplyFilters} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Contractor Select */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    Select Contractor
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <select
                      value={selectedContractorId}
                      onChange={(e) => setSelectedContractorId(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
                    >
                      <option value="all">All Contractors (Comparative Summary)</option>
                      {contractors.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.companyName || 'Civic Infra'})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* From Date */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    From Date
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* To Date */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    To Date
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Status Filter */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    Work Status
                  </label>
                  <div className="relative">
                    <Filter className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
                    >
                      <option value="all">All Work Statuses</option>
                      <option value="assigned">Assigned</option>
                      <option value="accepted">Accepted</option>
                      <option value="in_progress">Repair In Progress</option>
                      <option value="needs_review">Evidence Submitted (Awaiting Verification)</option>
                      <option value="completed">Completed & Closed</option>
                      <option value="overdue">Overdue / SLA Breached</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Reset Filters
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium shadow-md shadow-sky-500/20 transition-all cursor-pointer"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Apply Filters
                </button>
              </div>
            </form>
          </div>

          {/* Loading Indicator */}
          {loading && (
            <div className="p-12 text-center rounded-2xl bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
              <RefreshCw className="w-8 h-8 animate-spin text-sky-500 mx-auto mb-3" />
              <p className="text-slate-600 dark:text-slate-400 font-medium">Computing work metrics & aggregating records...</p>
            </div>
          )}

          {!loading && reportData && (
            <>
              {/* Summary Metrics KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                <div className="p-4 rounded-xl bg-white/70 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800/80 backdrop-blur-xl">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Assigned</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{reportData.summary.totalAssigned}</div>
                </div>

                <div className="p-4 rounded-xl bg-white/70 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800/80 backdrop-blur-xl">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Accepted</div>
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{reportData.summary.accepted}</div>
                </div>

                <div className="p-4 rounded-xl bg-white/70 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800/80 backdrop-blur-xl">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">In Progress</div>
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{reportData.summary.repairStarted}</div>
                </div>

                <div className="p-4 rounded-xl bg-white/70 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800/80 backdrop-blur-xl">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Submitted</div>
                  <div className="text-2xl font-bold text-sky-600 dark:text-sky-400 mt-1">{reportData.summary.repairSubmitted}</div>
                </div>

                <div className="p-4 rounded-xl bg-white/70 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800/80 backdrop-blur-xl">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">AI Verified</div>
                  <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">{reportData.summary.verified}</div>
                </div>

                <div className="p-4 rounded-xl bg-white/70 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800/80 backdrop-blur-xl">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Completed</div>
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{reportData.summary.completed}</div>
                </div>

                <div className="p-4 rounded-xl bg-white/70 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800/80 backdrop-blur-xl">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Overdue</div>
                  <div
                    className={`text-2xl font-bold mt-1 ${
                      reportData.summary.overdue > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {reportData.summary.overdue}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-gradient-to-br from-sky-500/10 to-indigo-500/10 border border-sky-500/20 backdrop-blur-xl">
                  <div className="text-xs text-sky-700 dark:text-sky-300 font-semibold">Completion %</div>
                  <div className="text-2xl font-bold text-sky-600 dark:text-sky-400 mt-1">{reportData.summary.completionRate}</div>
                </div>
              </div>

              {/* All Contractors Performance Comparison Table */}
              <div className="p-6 rounded-2xl bg-white/70 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800/80 backdrop-blur-xl shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Contractors Performance Comparison</h2>
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Showing performance for all active contractors in period
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        <th className="py-3 px-4">Contractor</th>
                        <th className="py-3 px-4">Company</th>
                        <th className="py-3 px-4 text-center">Assigned</th>
                        <th className="py-3 px-4 text-center">Accepted</th>
                        <th className="py-3 px-4 text-center">In Progress</th>
                        <th className="py-3 px-4 text-center">Submitted</th>
                        <th className="py-3 px-4 text-center">Verified</th>
                        <th className="py-3 px-4 text-center">Completed</th>
                        <th className="py-3 px-4 text-center">Overdue</th>
                        <th className="py-3 px-4 text-right">Completion %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
                      {reportData.contractorsComparison.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="py-6 text-center text-slate-500">
                            No contractors found in system.
                          </td>
                        </tr>
                      ) : (
                        reportData.contractorsComparison.map((item: ContractorComparisonItem) => (
                          <tr
                            key={item.contractorId}
                            className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors ${
                              selectedContractorId === item.contractorId ? 'bg-sky-50/50 dark:bg-sky-950/20' : ''
                            }`}
                          >
                            <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white">{item.contractorName}</td>
                            <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">{item.companyName}</td>
                            <td className="py-3.5 px-4 text-center font-medium">{item.assigned}</td>
                            <td className="py-3.5 px-4 text-center text-blue-600 dark:text-blue-400 font-medium">{item.accepted}</td>
                            <td className="py-3.5 px-4 text-center text-amber-600 dark:text-amber-400 font-medium">{item.inProgress}</td>
                            <td className="py-3.5 px-4 text-center text-sky-600 dark:text-sky-400 font-medium">{item.submitted}</td>
                            <td className="py-3.5 px-4 text-center text-indigo-600 dark:text-indigo-400 font-medium">{item.verified}</td>
                            <td className="py-3.5 px-4 text-center text-emerald-600 dark:text-emerald-400 font-bold">{item.completed}</td>
                            <td
                              className={`py-3.5 px-4 text-center font-bold ${
                                item.overdue > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'
                              }`}
                            >
                              {item.overdue}
                            </td>
                            <td className="py-3.5 px-4 text-right font-bold text-sky-600 dark:text-sky-400">{item.completionRate}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Detailed Work Records Table */}
              <div className="p-6 rounded-2xl bg-white/70 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800/80 backdrop-blur-xl shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Detailed Work Records</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Showing {reportData.detailedIssues.length} detailed complaint records matching selected scope
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
                        <th className="py-3 px-3">Complaint ID</th>
                        <th className="py-3 px-3">Title</th>
                        <th className="py-3 px-3">Location Address</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3">Contractor</th>
                        <th className="py-3 px-3">Reported</th>
                        <th className="py-3 px-3">Assigned</th>
                        <th className="py-3 px-3">Accepted</th>
                        <th className="py-3 px-3">Started</th>
                        <th className="py-3 px-3">Submitted</th>
                        <th className="py-3 px-3">Verification</th>
                        <th className="py-3 px-3">Completed</th>
                        <th className="py-3 px-3 text-center">Time (Hrs)</th>
                        <th className="py-3 px-3">Photos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
                      {reportData.detailedIssues.length === 0 ? (
                        <tr>
                          <td colSpan={14} className="py-12 text-center text-slate-500 dark:text-slate-400">
                            No work records match the selected contractor, date range, or status filter.
                          </td>
                        </tr>
                      ) : (
                        reportData.detailedIssues.map((issue: DetailedWorkItem) => (
                          <tr key={issue.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                            {/* Complaint ID */}
                            <td className="py-3 px-3 font-mono font-bold text-sky-600 dark:text-sky-400 whitespace-nowrap">
                              {issue.complaintId}
                            </td>

                            {/* Title */}
                            <td className="py-3 px-3">
                              <div className="font-semibold text-slate-900 dark:text-white line-clamp-1">{issue.title}</div>
                            </td>

                            {/* Location */}
                            <td className="py-3 px-3 text-slate-600 dark:text-slate-300 max-w-[180px] truncate" title={issue.location}>
                              {issue.location}
                            </td>

                            {/* Status Badge */}
                            <td className="py-3 px-3 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded-md border font-semibold text-[10px] ${getStatusBadgeClass(issue.status)}`}>
                                {issue.status.replace(/_/g, ' ').toUpperCase()}
                              </span>
                            </td>

                            {/* Contractor */}
                            <td className="py-3 px-3 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                              {issue.contractorName}
                            </td>

                            {/* Timestamps */}
                            <td className="py-3 px-3 text-slate-500 whitespace-nowrap">{formatDateLabel(issue.reportedDate)}</td>
                            <td className="py-3 px-3 text-slate-500 whitespace-nowrap">{formatDateLabel(issue.assignedDate)}</td>
                            <td className="py-3 px-3 text-slate-500 whitespace-nowrap">{formatDateLabel(issue.acceptedDate)}</td>
                            <td className="py-3 px-3 text-slate-500 whitespace-nowrap">{formatDateLabel(issue.repairStartedDate)}</td>
                            <td className="py-3 px-3 text-slate-500 whitespace-nowrap">{formatDateLabel(issue.repairSubmittedDate)}</td>

                            {/* Verification Status */}
                            <td className="py-3 px-3 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  issue.verificationStatus.includes('PASS') || issue.verificationStatus.includes('VERIFIED')
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                    : issue.verificationStatus.includes('FAIL') || issue.verificationStatus.includes('SUSPICIOUS')
                                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                                }`}
                              >
                                {issue.verificationStatus}
                              </span>
                            </td>

                            {/* Completed Date */}
                            <td className="py-3 px-3 text-slate-500 whitespace-nowrap">{formatDateLabel(issue.completedDate)}</td>

                            {/* Completion Time */}
                            <td className="py-3 px-3 text-center font-semibold text-slate-700 dark:text-slate-300">
                              {issue.completionTimeHours !== null ? `${issue.completionTimeHours}h` : '—'}
                            </td>

                            {/* Photos preview */}
                            <td className="py-3 px-3 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                {issue.beforePhoto ? (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewImage({ url: issue.beforePhoto!, title: `${issue.complaintId} — BEFORE Photo` })}
                                    className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-[10px] hover:bg-slate-300 transition-colors cursor-pointer"
                                  >
                                    BEFORE
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-slate-400">—</span>
                                )}

                                {issue.afterPhoto ? (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewImage({ url: issue.afterPhoto!, title: `${issue.complaintId} — AFTER Photo` })}
                                    className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 text-[10px] font-semibold hover:bg-emerald-200 transition-colors cursor-pointer"
                                  >
                                    AFTER
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-slate-400">—</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Image Lightbox Modal */}
          {previewImage && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
              <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full p-4 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                  <h3 className="font-bold text-slate-900 dark:text-white">{previewImage.title}</h3>
                  <button
                    onClick={() => setPreviewImage(null)}
                    className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                <div className="rounded-xl overflow-hidden bg-black flex items-center justify-center max-h-[60vh]">
                  <img src={previewImage.url} alt={previewImage.title} className="max-h-[60vh] object-contain w-full" />
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => setPreviewImage(null)}
                    className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium text-sm cursor-pointer"
                  >
                    Close Preview
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </AnimatedPage>
    </Layout>
  )
}
