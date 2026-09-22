import { API_URL, apiFetch, fixImageUrl } from './api'
import type { Issue, IssueCategory, IssueStatus, ValidationResult, User, ContractorReportResponse } from '../types'

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  window.URL.revokeObjectURL(url)
  document.body.removeChild(a)
}

export async function exportIssues(filters: Record<string, any>): Promise<void> {
  const token = localStorage.getItem('civicpulse_token')

  // 1. Try fast backend export with 4s timeout
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 4000)

    const response = await fetch(`${API_URL}/issues/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(filters),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (response.ok) {
      const blob = await response.blob()
      downloadBlob(blob, `Municipal_Issues_Export_${new Date().toISOString().split('T')[0]}.xlsx`)
      return
    }
  } catch (err) {
    console.warn('Backend Excel export endpoint unavailable or timed out, generating client-side report:', err)
  }

  // 2. Client-Side Fallback Generation via ExcelJS (Guaranteed Instant Download)
  const ExcelJS = (await import('exceljs')).default
  const issues = await getAllIssues(filters)

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'CivicPulse Municipal Platform'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Issues Register')

  sheet.mergeCells('A1:L1')
  const titleCell = sheet.getCell('A1')
  titleCell.value = 'MUNICIPAL POTHOLE & ROAD COMPLAINTS REGISTER'
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFF' } }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0284C7' } }
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' }
  sheet.getRow(1).height = 35

  sheet.mergeCells('A2:L2')
  const subTitle = sheet.getCell('A2')
  subTitle.value = `Total Issues Exported: ${issues.length} | Generated: ${new Date().toLocaleString()}`
  subTitle.font = { name: 'Calibri', size: 11, italic: true, color: { argb: '475569' } }
  subTitle.alignment = { vertical: 'middle', horizontal: 'center' }
  sheet.getRow(2).height = 25

  sheet.getRow(3).height = 12

  const headers = [
    'Complaint ID',
    'Title',
    'Category',
    'Severity',
    'Status',
    'Location Address',
    'Reporter',
    'Contractor',
    'Department',
    'Priority Score',
    'Reported Date',
    'Completed Date',
  ]

  const headerRow = sheet.getRow(4)
  headers.forEach((h, idx) => {
    const cell = headerRow.getCell(idx + 1)
    cell.value = h
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F172A' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })
  headerRow.height = 25

  issues.forEach((issue, idx) => {
    const row = sheet.getRow(5 + idx)
    const issueId = issue.id || (issue as any)._id || ''
    row.values = [
      issue.complaintId || `PT-${String(issueId).slice(-8)}`,
      issue.title,
      issue.category || 'Potholes & Road Damage',
      issue.severity,
      (issue.status || 'reported').replace(/_/g, ' ').toUpperCase(),
      issue.location?.address || '—',
      issue.reporterName || '—',
      issue.contractorName || issue.assignedTo || '—',
      issue.responsibleDepartment || 'Roads & Infrastructure',
      issue.priorityScore || 0,
      issue.createdAt ? new Date(issue.createdAt).toLocaleString() : '—',
      issue.status === 'completed' || issue.status === 'resolved' ? (issue.updatedAt ? new Date(issue.updatedAt).toLocaleString() : '—') : '—',
    ]
  })

  sheet.columns = [
    { width: 18 },
    { width: 30 },
    { width: 24 },
    { width: 10 },
    { width: 22 },
    { width: 38 },
    { width: 22 },
    { width: 24 },
    { width: 26 },
    { width: 14 },
    { width: 22 },
    { width: 22 },
  ]

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  downloadBlob(blob, `Municipal_Issues_Export_${new Date().toISOString().split('T')[0]}.xlsx`)
}

export async function getAllIssues(params?: Record<string, string>): Promise<Issue[]> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  const issues = await apiFetch<Issue[]>(`/issues${qs}`)
  // Fix image URLs for all issues
  return issues.map(issue => ({
    ...issue,
    imageUrl: issue.imageUrl ? fixImageUrl(issue.imageUrl) : undefined
  }))
}

export async function getIssueById(id: string): Promise<Issue | undefined> {
  try {
    const issue = await apiFetch<Issue>(`/issues/${id}`)
    // Fix image URL
    if (issue.imageUrl) {
      issue.imageUrl = fixImageUrl(issue.imageUrl)
    }
    return issue
  } catch {
    return undefined
  }
}

export async function getIssuesByReporter(reporterId: string): Promise<Issue[]> {
  const issues = await apiFetch<Issue[]>(`/issues/reporter/${reporterId}`)
  // Fix image URLs
  return issues.map(issue => ({
    ...issue,
    imageUrl: issue.imageUrl ? fixImageUrl(issue.imageUrl) : undefined
  }))
}

export async function getReporterStats(reporterId: string) {
  return apiFetch<{
    total: number
    reported: number
    inProgress: number
    resolved: number
  }>(`/issues/reporter/${reporterId}/stats`)
}

export async function getNearbyIssues(
  lat: number,
  lng: number,
  radiusKm = 5,
  excludeResolved = true
): Promise<Issue[]> {
  const issues = await apiFetch<Issue[]>(
    `/issues/nearby?lat=${lat}&lng=${lng}&radius=${radiusKm}&excludeResolved=${excludeResolved}`
  )
  // Fix image URLs
  return issues.map(issue => ({
    ...issue,
    imageUrl: issue.imageUrl ? fixImageUrl(issue.imageUrl) : undefined
  }))
}

export async function getPriorityTop(lat?: number, lng?: number, limit = 3): Promise<Issue[]> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (lat != null && lng != null) {
    params.set('lat', String(lat))
    params.set('lng', String(lng))
  }
  const issues = await apiFetch<Issue[]>(`/issues/priority/top?${params}`)
  // Fix image URLs
  return issues.map(issue => ({
    ...issue,
    imageUrl: issue.imageUrl ? fixImageUrl(issue.imageUrl) : undefined
  }))
}

export async function getClusters(category?: string) {
  const qs = category && category !== 'all' ? `?category=${category}` : ''
  return apiFetch<
    {
      id: string
      area: string
      issueCount: number
      totalReports: number
      maxPriority: number
      categories: string[]
    }[]
  >(`/issues/clusters${qs}`)
}

export async function findDuplicateCandidates(
  title: string,
  lat: number,
  lng: number
): Promise<Issue[]> {
  const issues = await apiFetch<Issue[]>(
    `/issues/duplicates?title=${encodeURIComponent(title)}&lat=${lat}&lng=${lng}`
  )
  // Fix image URLs
  return issues.map(issue => ({
    ...issue,
    imageUrl: issue.imageUrl ? fixImageUrl(issue.imageUrl) : undefined
  }))
}

export async function checkDuplicatesNearby(lat: number, lng: number): Promise<{ hasDuplicates: boolean; candidates: Issue[] }> {
  const result = await apiFetch<{ hasDuplicates: boolean; candidates: Issue[] }>('/issues/check-duplicates', {
    method: 'POST',
    body: JSON.stringify({ lat, lng }),
  })
  return {
    hasDuplicates: result.hasDuplicates,
    candidates: result.candidates.map(issue => ({
      ...issue,
      imageUrl: issue.imageUrl ? fixImageUrl(issue.imageUrl) : undefined
    }))
  }
}

export async function createIssue(data: {
  title: string
  description: string
  category: IssueCategory
  severity: number
  location: Issue['location']
  area?: string
  imageUrl?: string
  mergeWithId?: string
  beforeGps?: { lat: number; lng: number }
}): Promise<Issue> {
  const issue = await apiFetch<Issue>('/issues', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  // Fix image URL
  if (issue.imageUrl) {
    issue.imageUrl = fixImageUrl(issue.imageUrl)
  }
  return issue
}

export async function voteIssue(id: string): Promise<Issue> {
  return apiFetch<Issue>(`/issues/${id}/vote`, { method: 'POST' })
}

export async function updateIssueStatus(id: string, status: IssueStatus): Promise<Issue> {
  return apiFetch<Issue>(`/issues/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export async function assignContractor(
  id: string,
  contractorId: string,
  contractorName: string,
  deadlineHours?: number,
  overrideCapacity?: boolean
): Promise<Issue> {
  return apiFetch<Issue>(`/issues/${id}/assign-contractor`, {
    method: 'POST',
    body: JSON.stringify({ contractorId, contractorName, deadlineHours, overrideCapacity }),
  })
}

export async function updateContractorStatus(id: string, status: 'accepted' | 'repair_in_progress'): Promise<Issue> {
  return apiFetch<Issue>(`/issues/${id}/contractor-status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  })
}

export async function submitRepairEvidence(
  id: string,
  afterImage: string,
  afterGps?: { lat: number; lng: number }
): Promise<Issue> {
  return apiFetch<Issue>(`/issues/${id}/submit-repair`, {
    method: 'POST',
    body: JSON.stringify({ afterImage, afterGps }),
  })
}

export async function reviewRepairVerification(
  id: string,
  action: 'approve' | 'reject',
  notes?: string
): Promise<Issue> {
  return apiFetch<Issue>(`/issues/${id}/review-repair`, {
    method: 'POST',
    body: JSON.stringify({ action, notes }),
  })
}

export async function getContractorTasks(): Promise<Issue[]> {
  const issues = await apiFetch<Issue[]>('/issues/contractor/my-tasks')
  return issues.map(issue => ({
    ...issue,
    imageUrl: issue.imageUrl ? fixImageUrl(issue.imageUrl) : undefined,
    afterImage: issue.afterImage ? fixImageUrl(issue.afterImage) : undefined,
  }))
}

export async function getContractors() {
  return apiFetch<User[]>('/admin/contractors')
}

export async function getContractorAnalytics() {
  return apiFetch<{
    summary: {
      totalContractors: number
      totalAssignedTasks: number
      totalVerifiedRepairs: number
      totalSuspicious: number
      totalRecurringPotholes: number
    }
    contractors: Array<{
      contractorId: string
      name: string
      email: string
      companyName: string
      assignedDepartment: string
      rating: number
      totalAssigned: number
      completedRepairs: number
      inProgress: number
      awaitingVerification: number
      suspiciousSubmissions: number
      slaBreached: number
      slaComplianceRate: number
      avgRepairTimeHours: number
    }>
    recurringPotholes: Issue[]
  }>('/admin/contractor-analytics')
}

export async function seedDemoScenarios() {
  return apiFetch<{ success: boolean; message: string; complaints: Issue[] }>('/admin/seed-demo-scenarios', {
    method: 'POST',
  })
}

export async function validateIssue(id: string, result?: ValidationResult) {
  return apiFetch<{
    issue: Issue
    result: ValidationResult
    confidence: number
    user: { id: string; trustScore: number } | null
  }>(`/issues/${id}/validate`, {
    method: 'POST',
    body: JSON.stringify(result ? { result } : {}),
  })
}

export async function getContractorWorkReport(params?: {
  contractorId?: string
  fromDate?: string
  toDate?: string
  status?: string
}): Promise<ContractorReportResponse> {
  const cleanParams: Record<string, string> = {}
  if (params?.contractorId) cleanParams.contractorId = params.contractorId
  if (params?.fromDate) cleanParams.fromDate = params.fromDate
  if (params?.toDate) cleanParams.toDate = params.toDate
  if (params?.status) cleanParams.status = params.status

  const qs = new URLSearchParams(cleanParams).toString()
  return apiFetch<ContractorReportResponse>(`/admin/contractor-reports${qs ? `?${qs}` : ''}`)
}

export async function exportContractorWorkReport(filters: {
  contractorId?: string
  fromDate?: string
  toDate?: string
  status?: string
}): Promise<void> {
  const token = localStorage.getItem('civicpulse_token')
  const response = await fetch(`${API_URL}/admin/contractor-reports/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(filters),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Export failed' }))
    throw new Error(errorData.error || 'Failed to export contractor work report')
  }

  const blob = await response.blob()
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Contractor_Work_Report_${new Date().toISOString().split('T')[0]}.xlsx`
  document.body.appendChild(a)
  a.click()
  window.URL.revokeObjectURL(url)
  document.body.removeChild(a)
}

export interface PotholeAnalysisResult {
  success: boolean
  isPothole: boolean
  confidence: number
  severity: string
  suggestedSeverity: number
  imageQuality: string
  clearEnough: boolean
  isAiGenerated: boolean
  reason: string
  status: 'ACCEPTED' | 'REJECTED'
  message: string
  analyzedBy: string
}

export async function analyzePotholePhoto(image: string): Promise<PotholeAnalysisResult> {
  return apiFetch<PotholeAnalysisResult>('/issues/analyze-pothole-photo', {
    method: 'POST',
    body: JSON.stringify({ image }),
  })
}

export interface AISmartReportPayload {
  photo: string
  lat?: number | null
  lng?: number | null
  gpsAccuracy?: number | null
  timestamp?: string
  description?: string
  operationId?: string
}

export interface AISmartReportResult {
  decision: 'AUTO_ACCEPT' | 'AUTO_REJECT' | 'NEEDS_REVIEW' | 'POSSIBLE_DUPLICATE'
  message: string
  issue?: Issue
  existingIssue?: Issue
  aiDecisionRecord?: any
}

export async function submitAISmartReport(payload: AISmartReportPayload): Promise<AISmartReportResult> {
  return apiFetch<AISmartReportResult>('/issues/ai-smart-report', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function getStats(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  return apiFetch<{
    total: number
    reported: number
    inProgress: number
    resolved: number
    highPriority: number
    pendingValidation: number
    manipulated: number
  }>(`/issues/stats${qs}`)
}

export async function clearAllIssues(): Promise<{ message: string }> {
  return apiFetch<{ message: string }>('/issues/clear-all', {
    method: 'DELETE',
  })
}

export async function deleteIssue(id: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/issues/${id}`, {
    method: 'DELETE',
  })
}



