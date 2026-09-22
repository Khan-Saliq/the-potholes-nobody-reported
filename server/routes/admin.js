import express from 'express'
import mongoose from 'mongoose'
import Issue from '../models/Issue.js'
import User from '../models/User.js'
import { authRequired, requireAdmin } from '../middleware/auth.js'
import { formatIssue, formatUser } from '../utils/format.js'
import { runRepairVerification } from '../utils/repairVerification.js'
import ExcelJS from 'exceljs'

const router = express.Router()

// GET List all registered users for Unified User & Role Management System
router.get('/users', authRequired, requireAdmin, async (req, res) => {
  try {
    const { search, role } = req.query
    const filter = {}

    if (role && role !== 'all') {
      filter.role = role
    }

    if (search) {
      const searchRegex = new RegExp(search.trim(), 'i')
      filter.$or = [{ name: searchRegex }, { email: searchRegex }, { _id: mongoose.isValidObjectId(search) ? search : null }].filter(
        (cond) => Object.values(cond)[0] !== null
      )
    }

    const users = await User.find(filter).sort({ createdAt: -1 }).lean()
    res.json(users.map(formatUser))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT Unified Change User Role Endpoint (handles Citizen <-> Dept Admin <-> Contractor <-> Admin)
router.put('/users/:id/role', authRequired, requireAdmin, async (req, res) => {
  try {
    const { role, companyName, assignedDepartment, reason } = req.body
    const validRoles = ['citizen', 'admin', 'contractor']

    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Allowed roles: ${validRoles.join(', ')}` })
    }

    const targetUser = await User.findById(req.params.id)
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' })
    }

    const previousRole = targetUser.role

    // Record Role History Log for accountability
    if (previousRole !== role) {
      targetUser.roleHistory = targetUser.roleHistory || []
      targetUser.roleHistory.push({
        previousRole,
        newRole: role,
        changedBy: req.user.name,
        changedByEmail: req.user.email,
        reason: reason || `Role updated from ${previousRole} to ${role} by Admin`,
        timestamp: new Date(),
      })
    }

    targetUser.role = role

    if (role === 'contractor') {
      targetUser.companyName = companyName || targetUser.companyName || 'Apex Infra Repairs Ltd'
      targetUser.assignedDepartment = assignedDepartment || targetUser.assignedDepartment || 'Roads & Bridges Department'
    }

    if (targetUser.contractorApplication && targetUser.contractorApplication.status === 'pending') {
      targetUser.contractorApplication.status = role === 'contractor' ? 'approved' : 'rejected'
    }

    await targetUser.save()
    console.log(`👤 Unified Role Change: ${targetUser.email} (${previousRole} -> ${role}) by ${req.user.name}`)

    res.json({
      message: `Successfully changed ${targetUser.name}'s role to ${role}`,
      user: formatUser(targetUser),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET List all contractors
router.get('/contractors', authRequired, requireAdmin, async (req, res) => {
  try {
    const contractors = await User.find({ role: 'contractor' }).sort({ name: 1 }).lean()
    res.json(contractors.map(formatUser))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET Contractor Analytics
router.get('/contractor-analytics', authRequired, requireAdmin, async (req, res) => {
  try {
    const contractors = await User.find({ role: 'contractor' }).lean()
    const issues = await Issue.find().lean()

    const analytics = contractors.map((c) => {
      const cIssues = issues.filter(
        (i) => i.contractorId?.toString() === c._id.toString() || i.assignedTo === c.name || i.contractorName === c.name
      )
      const completed = cIssues.filter((i) => i.status === 'completed' || i.status === 'verified' || i.status === 'resolved')
      const suspicious = cIssues.filter((i) => i.status === 'suspicious' || i.verificationResult?.overallResult === 'SUSPICIOUS')
      const breached = cIssues.filter((i) => i.deadline && new Date(i.deadline) < new Date() && i.status !== 'completed' && i.status !== 'resolved')
      
      const total = cIssues.length
      const slaCompliance = total > 0 ? Math.round(((total - breached.length) / total) * 100) : 100

      return {
        contractorId: c._id.toString(),
        name: c.name,
        email: c.email,
        companyName: c.companyName || 'Civic Infra Works Ltd',
        assignedDepartment: c.assignedDepartment || 'Roads & Infrastructure',
        rating: c.contractorRating || 4.8,
        totalAssigned: total,
        completedRepairs: completed.length,
        inProgress: cIssues.filter((i) => i.status === 'repair_in_progress' || i.status === 'accepted').length,
        awaitingVerification: cIssues.filter((i) => i.status === 'ai_verification' || i.status === 'needs_review' || i.status === 'after_photo_submitted').length,
        suspiciousSubmissions: suspicious.length,
        slaBreached: breached.length,
        slaComplianceRate: slaCompliance,
        avgRepairTimeHours: 18.5,
      }
    })

    const recurringIssues = issues.filter((i) => i.isRecurring)

    res.json({
      summary: {
        totalContractors: contractors.length,
        totalAssignedTasks: issues.filter((i) => i.contractorName || i.contractorId).length,
        totalVerifiedRepairs: issues.filter((i) => i.status === 'completed' || i.status === 'verified' || i.status === 'resolved').length,
        totalSuspicious: issues.filter((i) => i.status === 'suspicious').length,
        totalRecurringPotholes: recurringIssues.length,
      },
      contractors: analytics,
      recurringPotholes: recurringIssues.map(formatIssue),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Helper to compute contractor work report metrics and detailed issue records
async function getContractorReportData({ contractorId, fromDate, toDate, statusFilter }) {
  // Parse dates: default fromDate is start of current month, default toDate is end of today
  let start
  if (fromDate) {
    start = new Date(fromDate)
    start.setHours(0, 0, 0, 0)
  } else {
    const now = new Date()
    start = new Date(now.getFullYear(), now.getMonth(), 1)
    start.setHours(0, 0, 0, 0)
  }

  let end
  if (toDate) {
    end = new Date(toDate)
    end.setHours(23, 59, 59, 999)
  } else {
    end = new Date()
    end.setHours(23, 59, 59, 999)
  }

  // 1. Get all active contractors
  const contractors = await User.find({ role: 'contractor' }).sort({ name: 1 }).lean()
  const contractorMap = new Map()
  contractors.forEach((c) => contractorMap.set(c._id.toString(), c))

  let targetContractor = null
  if (contractorId && contractorId !== 'all') {
    targetContractor = contractors.find((c) => c._id.toString() === contractorId)
  }

  // 2. Query all assigned/contractor issues
  const allIssues = await Issue.find({
    $or: [
      { contractorId: { $ne: null } },
      { contractorName: { $ne: null } },
      { assignedTo: { $ne: null } },
    ],
  }).sort({ createdAt: -1 }).lean()

  // Helper to get timeline date for an action substring
  const getTimelineDate = (issue, actionSub) => {
    if (!issue.timeline || !Array.isArray(issue.timeline)) return null
    const event = issue.timeline.find((t) => t.action && t.action.toLowerCase().includes(actionSub.toLowerCase()))
    return event ? new Date(event.timestamp) : null
  }

  // Helper to check if a date falls in [start, end] window
  const inWindow = (d) => d && !isNaN(d.getTime()) && d >= start && d <= end

  // Extract key milestone dates for an issue
  const getIssueEventDates = (issue) => {
    const reportedDate = issue.createdAt ? new Date(issue.createdAt) : null
    const assignedDate = issue.assignedAt ? new Date(issue.assignedAt) : getTimelineDate(issue, 'assigned') || reportedDate
    const acceptedDate = getTimelineDate(issue, 'accepted')
    const repairStartedDate = getTimelineDate(issue, 'started') || getTimelineDate(issue, 'in progress')
    const repairSubmittedDate = issue.afterSubmittedAt
      ? new Date(issue.afterSubmittedAt)
      : getTimelineDate(issue, 'after photo') || getTimelineDate(issue, 'submitted')
    const completedDate =
      getTimelineDate(issue, 'closed') ||
      getTimelineDate(issue, 'approved') ||
      (issue.adminReviewedAt ? new Date(issue.adminReviewedAt) : null)

    return { reportedDate, assignedDate, acceptedDate, repairStartedDate, repairSubmittedDate, completedDate }
  }

  // 3. Compute ALL CONTRACTORS comparison list (for comparison table)
  const contractorsComparison = contractors.map((c) => {
    const cIdStr = c._id.toString()
    const cIssues = allIssues.filter(
      (i) => (i.contractorId && i.contractorId.toString() === cIdStr) || i.contractorName === c.name || i.assignedTo === c.name
    )

    let assigned = 0
    let accepted = 0
    let inProgress = 0
    let submitted = 0
    let verified = 0
    let completed = 0
    let overdue = 0

    cIssues.forEach((issue) => {
      const dates = getIssueEventDates(issue)

      if (inWindow(dates.assignedDate)) assigned++
      if (inWindow(dates.acceptedDate)) accepted++
      if (inWindow(dates.repairStartedDate) || issue.status === 'repair_in_progress') inProgress++
      if (inWindow(dates.repairSubmittedDate)) submitted++
      if (inWindow(dates.completedDate) || (issue.verificationResult && issue.verificationResult.overallResult === 'PASS')) verified++

      // Completion metric MUST strictly filter by completion timestamp in date window
      if (inWindow(dates.completedDate) || ((issue.status === 'repaired' || issue.status === 'closed') && inWindow(issue.updatedAt))) {
        completed++
      }

      if (issue.deadline && new Date(issue.deadline) < new Date() && issue.status !== 'repaired' && issue.status !== 'closed') {
        overdue++
      }
    })

    const completionRate = assigned > 0 ? ((completed / assigned) * 100).toFixed(1) + '%' : '0.0%'

    return {
      contractorId: cIdStr,
      contractorName: c.name,
      companyName: c.companyName || 'Civic Infrastructure Works Ltd',
      assigned,
      accepted,
      inProgress,
      submitted,
      verified,
      completed,
      overdue,
      completionRate,
    }
  })

  // 4. Filter issues for the detailed table and summary card
  const filteredIssues = allIssues.filter((issue) => {
    // Contractor filter
    if (targetContractor) {
      const cIdStr = targetContractor._id.toString()
      const matches =
        (issue.contractorId && issue.contractorId.toString() === cIdStr) ||
        issue.contractorName === targetContractor.name ||
        issue.assignedTo === targetContractor.name
      if (!matches) return false
    }

    // Date window match (issue assigned, updated, completed, or created in window)
    const dates = getIssueEventDates(issue)
    const belongsToWindow =
      inWindow(dates.assignedDate) ||
      inWindow(dates.acceptedDate) ||
      inWindow(dates.repairSubmittedDate) ||
      inWindow(dates.completedDate) ||
      inWindow(issue.createdAt) ||
      inWindow(issue.updatedAt)

    if (!belongsToWindow) return false

    // Status filter match
    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'overdue') {
        const isOverdue = issue.deadline && new Date(issue.deadline) < new Date() && issue.status !== 'repaired' && issue.status !== 'closed'
        if (!isOverdue) return false
      } else if (statusFilter === 'assigned') {
        if (issue.status !== 'assigned') return false
      } else if (statusFilter === 'accepted') {
        if (issue.status !== 'accepted') return false
      } else if (statusFilter === 'in_progress') {
        if (issue.status !== 'repair_in_progress') return false
      } else if (statusFilter === 'needs_review' || statusFilter === 'after_photo_submitted') {
        if (issue.status !== 'needs_review' && issue.status !== 'after_photo_submitted') return false
      } else if (statusFilter === 'completed' || statusFilter === 'repaired' || statusFilter === 'closed') {
        if (issue.status !== 'repaired' && issue.status !== 'closed') return false
      } else if (issue.status !== statusFilter) {
        return false
      }
    }

    return true
  })

  // 5. Compute aggregate summary metrics for the selected filters
  let totalAssigned = 0
  let totalAccepted = 0
  let totalRepairStarted = 0
  let totalSubmitted = 0
  let totalVerified = 0
  let totalCompleted = 0
  let totalOverdue = 0

  filteredIssues.forEach((issue) => {
    const dates = getIssueEventDates(issue)
    if (inWindow(dates.assignedDate)) totalAssigned++
    if (inWindow(dates.acceptedDate)) totalAccepted++
    if (inWindow(dates.repairStartedDate) || issue.status === 'repair_in_progress') totalRepairStarted++
    if (inWindow(dates.repairSubmittedDate)) totalSubmitted++
    if (inWindow(dates.completedDate) || (issue.verificationResult && issue.verificationResult.overallResult === 'PASS')) totalVerified++
    if (inWindow(dates.completedDate) || ((issue.status === 'repaired' || issue.status === 'closed') && inWindow(issue.updatedAt))) totalCompleted++
    if (issue.deadline && new Date(issue.deadline) < new Date() && issue.status !== 'repaired' && issue.status !== 'closed') totalOverdue++
  })

  const summary = {
    contractorName: targetContractor ? targetContractor.name : 'All Contractors',
    contractorId: targetContractor ? targetContractor._id.toString() : 'all',
    totalAssigned,
    accepted: totalAccepted,
    repairStarted: totalRepairStarted,
    repairSubmitted: totalSubmitted,
    verified: totalVerified,
    completed: totalCompleted,
    overdue: totalOverdue,
    completionRate: totalAssigned > 0 ? ((totalCompleted / totalAssigned) * 100).toFixed(1) + '%' : '0.0%',
  }

  // 6. Format Detailed Issues list
  const detailedIssues = filteredIssues.map((issue) => {
    const dates = getIssueEventDates(issue)
    let completionTimeHours = null
    if (dates.assignedDate && dates.completedDate) {
      const diffMs = dates.completedDate.getTime() - dates.assignedDate.getTime()
      if (diffMs > 0) {
        completionTimeHours = Number((diffMs / (1000 * 60 * 60)).toFixed(1))
      }
    }

    let cName = issue.contractorName || issue.assignedTo || '—'
    if (issue.contractorId && contractorMap.has(issue.contractorId.toString())) {
      cName = contractorMap.get(issue.contractorId.toString()).name
    }

    let verificationStatus = 'NOT VERIFIED'
    if (issue.verificationResult) {
      verificationStatus = issue.verificationResult.overallResult || issue.verificationResult.aiAnalysisStatus || 'VERIFIED'
    } else if (issue.status === 'repaired' || issue.status === 'closed') {
      verificationStatus = 'VERIFIED & APPROVED'
    }

    return {
      id: issue._id.toString(),
      issueId: issue.complaintId || `PT-${issue._id.toString().substring(0, 8)}`,
      complaintId: issue.complaintId || `PT-${issue._id.toString().substring(0, 8)}`,
      title: issue.title || 'Pothole Complaint',
      category: issue.category || 'Pothole',
      location: issue.location?.address || issue.area || 'City Location',
      status: issue.status,
      contractorName: cName,
      reportedDate: dates.reportedDate ? dates.reportedDate.toISOString() : null,
      assignedDate: dates.assignedDate ? dates.assignedDate.toISOString() : null,
      acceptedDate: dates.acceptedDate ? dates.acceptedDate.toISOString() : null,
      repairStartedDate: dates.repairStartedDate ? dates.repairStartedDate.toISOString() : null,
      repairSubmittedDate: dates.repairSubmittedDate ? dates.repairSubmittedDate.toISOString() : null,
      verificationStatus,
      completedDate: dates.completedDate ? dates.completedDate.toISOString() : null,
      deadline: issue.deadline ? new Date(issue.deadline).toISOString() : null,
      completionTimeHours,
      beforePhoto: issue.imageUrl || null,
      afterPhoto: issue.afterImage || null,
      lat: issue.location?.lat || issue.beforeGps?.lat || null,
      lng: issue.location?.lng || issue.beforeGps?.lng || null,
    }
  })

  return {
    summary,
    contractorsComparison,
    detailedIssues,
    filters: {
      contractorId: contractorId || 'all',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      status: statusFilter || 'all',
    },
  }
}

// GET Admin → Contractor Work Reports Data
router.get('/contractor-reports', authRequired, requireAdmin, async (req, res) => {
  try {
    const { contractorId, fromDate, toDate, status } = req.query
    const reportData = await getContractorReportData({ contractorId, fromDate, toDate, statusFilter: status })
    res.json(reportData)
  } catch (err) {
    console.error('Error fetching contractor report data:', err)
    res.status(500).json({ error: err.message })
  }
})

// POST Admin → Contractor Work Reports Export to Excel (.xlsx)
router.post('/contractor-reports/export', authRequired, requireAdmin, async (req, res) => {
  try {
    const { contractorId, fromDate, toDate, status } = req.body
    const reportData = await getContractorReportData({ contractorId, fromDate, toDate, statusFilter: status })

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'CivicPulse Municipal Platform'
    workbook.lastModifiedBy = req.user.name || 'Admin'
    workbook.created = new Date()

    // -------------------------------------------------------------
    // Sheet 1: Summary Report
    // -------------------------------------------------------------
    const summarySheet = workbook.addWorksheet('Summary Report')

    const primaryHeaderFill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '0284C7' }, // Sky Blue #0284C7
    }

    // Title Row
    summarySheet.mergeCells('A1:J1')
    const titleCell = summarySheet.getCell('A1')
    titleCell.value = 'MUNICIPAL CONTRACTOR WORK & REPAIR PERFORMANCE REPORT'
    titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFF' } }
    titleCell.fill = primaryHeaderFill
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' }
    summarySheet.getRow(1).height = 35

    // Subtitle Metadata
    summarySheet.mergeCells('A2:J2')
    const subTitle = summarySheet.getCell('A2')
    const fromStr = new Date(reportData.filters.startDate).toLocaleDateString('en-US', { dateStyle: 'medium' })
    const toStr = new Date(reportData.filters.endDate).toLocaleDateString('en-US', { dateStyle: 'medium' })
    subTitle.value = `Contractor: ${reportData.summary.contractorName} | Date Window: ${fromStr} to ${toStr} | Generated: ${new Date().toLocaleString()}`
    subTitle.font = { name: 'Calibri', size: 11, italic: true, color: { argb: '475569' } }
    subTitle.alignment = { vertical: 'middle', horizontal: 'center' }
    summarySheet.getRow(2).height = 25

    summarySheet.getRow(3).height = 12

    // Summary Metric Header
    summarySheet.mergeCells('A4:B4')
    const metricsHeader = summarySheet.getCell('A4')
    metricsHeader.value = 'EXECUTIVE SUMMARY & KEY PERFORMANCE INDICATORS'
    metricsHeader.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFF' } }
    metricsHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F172A' } }
    metricsHeader.alignment = { vertical: 'middle', horizontal: 'left' }
    summarySheet.getRow(4).height = 25

    summarySheet.getCell('A5').value = 'Metric Name'
    summarySheet.getCell('B5').value = 'Count / Value'
    summarySheet.getCell('A5').font = { bold: true }
    summarySheet.getCell('B5').font = { bold: true }

    const metricsList = [
      ['Target Contractor / Scope', reportData.summary.contractorName],
      ['Total Assigned Complaints', reportData.summary.totalAssigned],
      ['Accepted Complaints', reportData.summary.accepted],
      ['Repairs Started / In Progress', reportData.summary.repairStarted],
      ['Repair Evidence Submitted', reportData.summary.repairSubmitted],
      ['AI & Admin Verified Repairs', reportData.summary.verified],
      ['Fully Completed & Closed', reportData.summary.completed],
      ['Overdue / SLA Breached', reportData.summary.overdue],
      ['Overall Completion Rate', reportData.summary.completionRate],
    ]

    metricsList.forEach((m, idx) => {
      const rIdx = 6 + idx
      const row = summarySheet.getRow(rIdx)
      row.getCell(1).value = m[0]
      row.getCell(2).value = m[1]
      row.getCell(1).font = { bold: idx === metricsList.length - 1 }
      row.getCell(2).font = {
        bold: true,
        color: m[0].includes('Overdue') && Number(m[1]) > 0 ? { argb: 'DC2626' } : { argb: '0F172A' },
      }
    })

    const compStartRow = 6 + metricsList.length + 2
    summarySheet.mergeCells(`A${compStartRow}:J${compStartRow}`)
    const compHeader = summarySheet.getCell(`A${compStartRow}`)
    compHeader.value = 'ALL CONTRACTORS PERFORMANCE COMPARISON TABLE'
    compHeader.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFF' } }
    compHeader.fill = primaryHeaderFill
    compHeader.alignment = { vertical: 'middle', horizontal: 'left' }
    summarySheet.getRow(compStartRow).height = 25

    const compHeadersRow = summarySheet.getRow(compStartRow + 1)
    const compCols = [
      'Contractor Name',
      'Company Name',
      'Assigned',
      'Accepted',
      'In Progress',
      'Submitted',
      'Verified',
      'Completed',
      'Overdue',
      'Completion Rate',
    ]
    compCols.forEach((colTitle, colIdx) => {
      const cell = compHeadersRow.getCell(colIdx + 1)
      cell.value = colTitle
      cell.font = { bold: true, color: { argb: 'FFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '334155' } }
      cell.alignment = { horizontal: 'center' }
    })

    reportData.contractorsComparison.forEach((item, itemIdx) => {
      const row = summarySheet.getRow(compStartRow + 2 + itemIdx)
      row.values = [
        item.contractorName,
        item.companyName,
        item.assigned,
        item.accepted,
        item.inProgress,
        item.submitted,
        item.verified,
        item.completed,
        item.overdue,
        item.completionRate,
      ]

      if (item.overdue > 0) {
        row.getCell(9).font = { color: { argb: 'DC2626' }, bold: true }
      }
      row.getCell(10).font = { bold: true }
    })

    summarySheet.columns = [
      { width: 32 },
      { width: 30 },
      { width: 12 },
      { width: 12 },
      { width: 14 },
      { width: 14 },
      { width: 12 },
      { width: 14 },
      { width: 12 },
      { width: 18 },
    ]

    // -------------------------------------------------------------
    // Sheet 2: Detailed Work Records
    // -------------------------------------------------------------
    const detailSheet = workbook.addWorksheet('Detailed Work Records')

    detailSheet.mergeCells('A1:O1')
    const detailTitle = detailSheet.getCell('A1')
    detailTitle.value = `DETAILED REPAIR WORK RECORDS (${reportData.detailedIssues.length} Complaints)`
    detailTitle.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFF' } }
    detailTitle.fill = primaryHeaderFill
    detailTitle.alignment = { vertical: 'middle', horizontal: 'center' }
    detailSheet.getRow(1).height = 30

    const detailHeaders = [
      'Complaint ID',
      'Title',
      'Category',
      'Location Address',
      'Status',
      'Assigned Contractor',
      'Reported Date',
      'Assigned Date',
      'Accepted Date',
      'Repair Started Date',
      'Repair Submitted Date',
      'AI/Admin Verification Status',
      'Completed Date',
      'Completion Time (Hrs)',
      'SLA Deadline',
    ]

    const headerRow = detailSheet.getRow(3)
    detailHeaders.forEach((headerText, i) => {
      const cell = headerRow.getCell(i + 1)
      cell.value = headerText
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFF' } }
      cell.fill = primaryHeaderFill
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
    })
    headerRow.height = 25

    reportData.detailedIssues.forEach((issue, idx) => {
      const rowNum = 4 + idx
      const row = detailSheet.getRow(rowNum)

      const fmtDate = (dStr) => (dStr ? new Date(dStr).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' }) : '—')

      row.values = [
        issue.complaintId,
        issue.title,
        issue.category,
        issue.location,
        issue.status.toUpperCase(),
        issue.contractorName,
        fmtDate(issue.reportedDate),
        fmtDate(issue.assignedDate),
        fmtDate(issue.acceptedDate),
        fmtDate(issue.repairStartedDate),
        fmtDate(issue.repairSubmittedDate),
        issue.verificationStatus,
        fmtDate(issue.completedDate),
        issue.completionTimeHours !== null ? issue.completionTimeHours : '—',
        fmtDate(issue.deadline),
      ]

      const statusCell = row.getCell(5)
      if (issue.status === 'repaired' || issue.status === 'closed') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DCFCE7' } }
        statusCell.font = { color: { argb: '166534' }, bold: true }
      } else if (issue.status === 'repair_in_progress' || issue.status === 'accepted') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEF9C3' } }
        statusCell.font = { color: { argb: '854D0E' }, bold: true }
      } else if (issue.status === 'needs_review' || issue.status === 'after_photo_submitted') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E0F2FE' } }
        statusCell.font = { color: { argb: '075985' }, bold: true }
      }

      if (idx % 2 === 1) {
        row.eachCell((cell, colNum) => {
          if (colNum !== 5) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8FAFC' } }
          }
        })
      }
    })

    detailSheet.autoFilter = {
      from: { row: 3, column: 1 },
      to: { row: 3, column: 15 },
    }

    detailSheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 3 }]

    detailSheet.columns = [
      { width: 16 },
      { width: 28 },
      { width: 16 },
      { width: 35 },
      { width: 16 },
      { width: 24 },
      { width: 18 },
      { width: 18 },
      { width: 18 },
      { width: 18 },
      { width: 18 },
      { width: 22 },
      { width: 18 },
      { width: 18 },
      { width: 18 },
    ]

    const buffer = await workbook.xlsx.writeBuffer()
    const fileName = `Contractor_Work_Report_${new Date().toISOString().split('T')[0]}.xlsx`

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    res.send(Buffer.from(buffer))
  } catch (err) {
    console.error('Error exporting contractor report:', err)
    res.status(500).json({ error: err.message })
  }
})

// POST Seed Demo Scenarios (Complaints A-E)
router.post('/seed-demo-scenarios', authRequired, requireAdmin, async (req, res) => {
  try {
    console.log('🌱 Seeding 5 Demo Pothole Scenarios (Complaints A to E)...')

    // Find or create default citizen & contractor users
    let citizen = await User.findOne({ email: 'citizen@civicpulse.org' })
    if (!citizen) {
      citizen = await User.create({
        name: 'Aarav Sharma (Citizen)',
        email: 'citizen@civicpulse.org',
        password: '$2a$10$wT0vR2U3/7t3/8f/9x4qZe1z9y.6v.9', // password123
        role: 'citizen',
        trustScore: 88,
      })
    }

    let contractor = await User.findOne({ email: 'contractor@civicpulse.org' })
    if (!contractor) {
      contractor = await User.create({
        name: 'Apex Infra Repairs (Contractor)',
        email: 'contractor@civicpulse.org',
        password: '$2a$10$wT0vR2U3/7t3/8f/9x4qZe1z9y.6v.9',
        role: 'contractor',
        companyName: 'Apex Infra Repairs Ltd',
        assignedDepartment: 'Roads & Bridges Department',
        contractorRating: 4.9,
      })
    }

    // Standard Pothole & Repaired Image URLs (high-quality public road samples)
    const potholeImgA = 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?q=80&w=800&auto=format&fit=crop'
    const repairedImgA = 'https://images.unsplash.com/photo-1584467735871-8e85353a8413?q=80&w=800&auto=format&fit=crop'
    const potholeImgB = 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?q=80&w=800&auto=format&fit=crop'
    const wrongLocationImgB = 'https://images.unsplash.com/photo-1596785236245-485c2b8744b7?q=80&w=800&auto=format&fit=crop'

    // Clean old demo complaints if re-seeding
    await Issue.deleteMany({ complaintId: { $in: ['PT-2026-00101', 'PT-2026-00102', 'PT-2026-00103', 'PT-2026-00104', 'PT-2026-00105'] } })

    // 1. Test 1: Genuine Repair -> VERIFIED
    const demoA = new Issue({
      complaintId: 'PT-2026-00101',
      title: 'Deep Pothole on MG Road near Metro Pillar 42',
      description: 'Dangerous 15cm deep pothole causing vehicle damage and traffic slowdowns.',
      category: 'potholes_and_road_damage',
      severity: 5,
      status: 'completed',
      location: { lat: 19.076, lng: 72.8777, address: 'MG Road, Metro Pillar 42, Andheri East, Mumbai' },
      geoLocation: { type: 'Point', coordinates: [72.8777, 19.076] },
      area: 'Andheri East',
      imageUrl: potholeImgA,
      beforeGps: { lat: 19.076, lng: 72.8777 },
      reporterId: citizen._id,
      reporterName: citizen.name,
      reporterTrustScore: 88,
      contractorId: contractor._id,
      contractorName: contractor.name,
      assignedTo: contractor.name,
      assignedAt: new Date(Date.now() - 48 * 3600 * 1000),
      deadline: new Date(Date.now() + 24 * 3600 * 1000),
      slaStatus: 'on_track',
      responsibleDepartment: 'Roads & Bridges Department',
      afterImage: repairedImgA,
      afterGps: { lat: 19.07601, lng: 72.87771 },
      afterSubmittedAt: new Date(Date.now() - 6 * 3600 * 1000),
      afterSubmittedBy: contractor.name,
      verificationResult: {
        locationStatus: 'MATCH',
        locationDistanceMeters: 1.4,
        surroundingsStatus: 'MATCH',
        cameraViewStatus: 'MATCH',
        potholeRepairStatus: 'CONFIRMED',
        aiAnalysisStatus: 'VALID',
        gpsDistanceMeters: 1.4,
        gpsMatchScore: 98,
        gpsResult: 'PASS',
        backgroundScore: 91,
        backgroundResult: 'HIGH',
        perspectiveScore: 87,
        perspectiveResult: 'HIGH',
        visualSimilarityScore: 89,
        repairEvidenceResult: 'REPAIRED',
        overallResult: 'VERIFIED',
        featurePoints: [
          { x1: 20, y1: 30, x2: 21, y2: 31 },
          { x1: 45, y1: 22, x2: 46, y2: 23 },
          { x1: 70, y1: 35, x2: 69, y2: 34 },
          { x1: 35, y1: 48, x2: 36, y2: 50 },
        ],
        reasons: [
          '📍 Location Match: Perfect GPS alignment (1.4m distance)',
          '🏢 Surroundings Match: Strong landmark alignment detected',
          '📐 Camera Angle Match: Highly consistent perspective and road direction',
          '🛠️ Repair Evidence: Smooth asphalt patch over previous pothole region',
          '✅ REPAIR VERIFIED: Confirmed same physical location and successful repair.',
        ],
        analysisMethod: 'gemini-vision-multi-signal',
      },
      adminReviewedBy: 'System Admin',
      adminReviewedAt: new Date(Date.now() - 2 * 3600 * 1000),
      adminReviewNotes: 'Verified and approved by admin after AI landmark verification',
      timeline: [
        { action: 'Reported', timestamp: new Date(Date.now() - 48 * 3600 * 1000), performedBy: citizen.name, role: 'citizen', newStatus: 'reported' },
        { action: 'Assigned to Contractor', timestamp: new Date(Date.now() - 40 * 3600 * 1000), performedBy: 'Admin', role: 'admin', newStatus: 'assigned' },
        { action: 'AFTER Photo Submitted', timestamp: new Date(Date.now() - 6 * 3600 * 1000), performedBy: contractor.name, role: 'contractor', newStatus: 'ai_verification' },
        { action: 'Repair Verified', timestamp: new Date(Date.now() - 2 * 3600 * 1000), performedBy: 'System Admin', role: 'admin', newStatus: 'completed' },
      ],
    })
    await demoA.save()

    // 2. Test 2: Anti-Gaming Mismatch (Contractor uploaded photo of DIFFERENT road) -> SUSPICIOUS
    const demoB = new Issue({
      complaintId: 'PT-2026-00102',
      title: 'Large Pothole near Central Mall Entrance',
      description: 'Severe road crater causing traffic bottleneck at mall main gate.',
      category: 'potholes_and_road_damage',
      severity: 4,
      status: 'suspicious',
      location: { lat: 19.0821, lng: 72.889, address: 'Central Mall Main Gate, Kurla West, Mumbai' },
      geoLocation: { type: 'Point', coordinates: [72.889, 19.0821] },
      area: 'Kurla West',
      imageUrl: potholeImgB,
      beforeGps: { lat: 19.0821, lng: 72.889 },
      reporterId: citizen._id,
      reporterName: citizen.name,
      reporterTrustScore: 88,
      contractorId: contractor._id,
      contractorName: contractor.name,
      assignedTo: contractor.name,
      assignedAt: new Date(Date.now() - 24 * 3600 * 1000),
      deadline: new Date(Date.now() + 12 * 3600 * 1000),
      slaStatus: 'on_track',
      responsibleDepartment: 'Roads & Bridges Department',
      afterImage: wrongLocationImgB,
      afterGps: { lat: 19.0845, lng: 72.8912 }, // 284.5 meters away!
      afterSubmittedAt: new Date(Date.now() - 1 * 3600 * 1000),
      afterSubmittedBy: contractor.name,
      verificationResult: {
        locationStatus: 'MISMATCH',
        locationDistanceMeters: 284.5,
        surroundingsStatus: 'MISMATCH',
        cameraViewStatus: 'MISMATCH',
        potholeRepairStatus: 'NOT CONFIRMED',
        aiAnalysisStatus: 'INVALID',
        gpsDistanceMeters: 284.5,
        gpsMatchScore: 0,
        gpsResult: 'FAIL',
        backgroundScore: 18,
        backgroundResult: 'LOW',
        perspectiveScore: 22,
        perspectiveResult: 'LOW',
        visualSimilarityScore: 20,
        repairEvidenceResult: 'INCONCLUSIVE',
        overallResult: 'SUSPICIOUS',
        featurePoints: [],
        reasons: [
          '🚨 Location Mismatch: Submitted photo is 284.5m away from reported pothole (Max allowed: 50m).',
          '⚠️ Surroundings Mismatch: Background buildings and landmarks do not match original location.',
          '🔴 SUSPICIOUS REPAIR SUBMISSION: Location mismatch (284.5m apart) and surrounding landmarks do not match.',
        ],
        analysisMethod: 'gemini-vision-multi-signal',
      },
      timeline: [
        { action: 'Reported', timestamp: new Date(Date.now() - 24 * 3600 * 1000), performedBy: citizen.name, role: 'citizen', newStatus: 'reported' },
        { action: 'Assigned to Contractor', timestamp: new Date(Date.now() - 20 * 3600 * 1000), performedBy: 'Admin', role: 'admin', newStatus: 'assigned' },
        { action: 'AFTER Photo Submitted', timestamp: new Date(Date.now() - 1 * 3600 * 1000), performedBy: contractor.name, role: 'contractor', newStatus: 'suspicious' },
      ],
    })
    await demoB.save()

    // 3. Test 3: Same Location, Camera View Shift -> NEEDS_ADMIN_REVIEW
    const demoC = new Issue({
      complaintId: 'PT-2026-00103',
      title: 'Pothole at Shivaji Chowk Intersection',
      description: 'Pothole near traffic signal causing motorcycle skidding risks.',
      category: 'potholes_and_road_damage',
      severity: 3,
      status: 'needs_review',
      location: { lat: 19.069, lng: 72.865, address: 'Shivaji Chowk Signal, Dadar West, Mumbai' },
      geoLocation: { type: 'Point', coordinates: [72.865, 19.069] },
      area: 'Dadar West',
      imageUrl: potholeImgA,
      beforeGps: { lat: 19.069, lng: 72.865 },
      reporterId: citizen._id,
      reporterName: citizen.name,
      reporterTrustScore: 88,
      contractorId: contractor._id,
      contractorName: contractor.name,
      assignedTo: contractor.name,
      assignedAt: new Date(Date.now() - 18 * 3600 * 1000),
      deadline: new Date(Date.now() + 54 * 3600 * 1000),
      slaStatus: 'on_track',
      responsibleDepartment: 'Roads & Bridges Department',
      afterImage: repairedImgA,
      afterGps: { lat: 19.06902, lng: 72.86501 },
      afterSubmittedAt: new Date(Date.now() - 3 * 3600 * 1000),
      afterSubmittedBy: contractor.name,
      verificationResult: {
        locationStatus: 'MATCH',
        locationDistanceMeters: 2.2,
        surroundingsStatus: 'PARTIAL MATCH',
        cameraViewStatus: 'PARTIAL MATCH',
        potholeRepairStatus: 'CONFIRMED',
        aiAnalysisStatus: 'NEEDS REVIEW',
        gpsDistanceMeters: 2.2,
        gpsMatchScore: 96,
        gpsResult: 'PASS',
        backgroundScore: 52,
        backgroundResult: 'MEDIUM',
        perspectiveScore: 35,
        perspectiveResult: 'LOW',
        visualSimilarityScore: 43,
        repairEvidenceResult: 'REPAIRED',
        overallResult: 'NEEDS_ADMIN_REVIEW',
        featurePoints: [
          { x1: 25, y1: 35, x2: 60, y2: 38 },
          { x1: 40, y1: 40, x2: 75, y2: 42 },
        ],
        reasons: [
          '📍 Location Match: GPS coordinates match (2.2m distance)',
          '📐 Camera Angle Shift: Camera angle shifted substantially between photos',
          '🟡 NEEDS ADMIN REVIEW: Camera angle or perspective shifted significantly between photos. Admin verification required.',
        ],
        analysisMethod: 'gemini-vision-multi-signal',
      },
      timeline: [
        { action: 'Reported', timestamp: new Date(Date.now() - 18 * 3600 * 1000), performedBy: citizen.name, role: 'citizen', newStatus: 'reported' },
        { action: 'Assigned to Contractor', timestamp: new Date(Date.now() - 12 * 3600 * 1000), performedBy: 'Admin', role: 'admin', newStatus: 'assigned' },
        { action: 'AFTER Photo Submitted', timestamp: new Date(Date.now() - 3 * 3600 * 1000), performedBy: contractor.name, role: 'contractor', newStatus: 'needs_review' },
      ],
    })
    await demoC.save()

    // 4. Test 4: Unrepaired Pothole (Pothole Still Visible) -> SUSPICIOUS
    const demoD = new Issue({
      complaintId: 'PT-2026-00104',
      title: 'Pothole on Link Road near Industrial Area',
      description: 'Contractor submitted photo where damaged pothole is still open and unrepaired.',
      category: 'potholes_and_road_damage',
      severity: 4,
      status: 'suspicious',
      location: { lat: 19.07605, lng: 72.87772, address: 'Link Road, Industrial Area, Andheri West, Mumbai' },
      geoLocation: { type: 'Point', coordinates: [72.87772, 19.07605] },
      area: 'Andheri West',
      imageUrl: potholeImgA,
      beforeGps: { lat: 19.07605, lng: 72.87772 },
      reporterId: citizen._id,
      reporterName: citizen.name,
      reporterTrustScore: 88,
      contractorId: contractor._id,
      contractorName: contractor.name,
      assignedTo: contractor.name,
      assignedAt: new Date(Date.now() - 36 * 3600 * 1000),
      deadline: new Date(Date.now() + 12 * 3600 * 1000),
      slaStatus: 'on_track',
      responsibleDepartment: 'Roads & Bridges Department',
      afterImage: potholeImgA, // Unrepaired pothole submitted as AFTER image
      afterGps: { lat: 19.07606, lng: 72.87773 },
      afterSubmittedAt: new Date(Date.now() - 2 * 3600 * 1000),
      afterSubmittedBy: contractor.name,
      verificationResult: {
        locationStatus: 'MATCH',
        locationDistanceMeters: 1.8,
        surroundingsStatus: 'MATCH',
        cameraViewStatus: 'MATCH',
        potholeRepairStatus: 'NOT CONFIRMED',
        aiAnalysisStatus: 'INVALID',
        gpsDistanceMeters: 1.8,
        gpsMatchScore: 98,
        gpsResult: 'PASS',
        backgroundScore: 90,
        backgroundResult: 'HIGH',
        perspectiveScore: 85,
        perspectiveResult: 'HIGH',
        visualSimilarityScore: 88,
        repairEvidenceResult: 'NOT_REPAIRED',
        overallResult: 'SUSPICIOUS',
        featurePoints: [],
        reasons: [
          '📍 Location Match: GPS coordinates match (1.8m distance)',
          '🔴 Pothole Still Visible: Gemini Vision detected that the road pothole remains unrepaired in AFTER photo.',
          '🔴 SUSPICIOUS REPAIR SUBMISSION: Pothole edges still visible in the submitted AFTER photo; repair incomplete.',
        ],
        analysisMethod: 'gemini-vision-multi-signal',
      },
      timeline: [
        { action: 'Reported', timestamp: new Date(Date.now() - 36 * 3600 * 1000), performedBy: citizen.name, role: 'citizen', newStatus: 'reported' },
        { action: 'Assigned to Contractor', timestamp: new Date(Date.now() - 24 * 3600 * 1000), performedBy: 'Admin', role: 'admin', newStatus: 'assigned' },
        { action: 'AFTER Photo Submitted', timestamp: new Date(Date.now() - 2 * 3600 * 1000), performedBy: contractor.name, role: 'contractor', newStatus: 'suspicious' },
      ],
    })
    await demoD.save()

    // 5. Test 5: Poor Image Quality -> NEEDS_ADMIN_REVIEW
    const demoE = new Issue({
      complaintId: 'PT-2026-00105',
      title: 'Road Damage near City Hospital Bus Stop',
      description: 'Submitted photo is low resolution and blurry, requiring manual admin review.',
      category: 'potholes_and_road_damage',
      severity: 3,
      status: 'needs_review',
      location: { lat: 19.07602, lng: 72.87771, address: 'City Hospital Bus Stop, MG Road, Andheri East, Mumbai' },
      geoLocation: { type: 'Point', coordinates: [72.87771, 19.07602] },
      area: 'Andheri East',
      imageUrl: potholeImgB,
      beforeGps: { lat: 19.07602, lng: 72.87771 },
      reporterId: citizen._id,
      reporterName: citizen.name,
      reporterTrustScore: 88,
      contractorId: contractor._id,
      contractorName: contractor.name,
      assignedTo: contractor.name,
      assignedAt: new Date(Date.now() - 12 * 3600 * 1000),
      deadline: new Date(Date.now() + 60 * 3600 * 1000),
      slaStatus: 'on_track',
      responsibleDepartment: 'Roads & Bridges Department',
      afterImage: potholeImgB,
      afterGps: { lat: 19.07603, lng: 72.87772 },
      afterSubmittedAt: new Date(Date.now() - 1 * 3600 * 1000),
      afterSubmittedBy: contractor.name,
      verificationResult: {
        locationStatus: 'MATCH',
        locationDistanceMeters: 2.0,
        surroundingsStatus: 'UNAVAILABLE',
        cameraViewStatus: 'UNAVAILABLE',
        potholeRepairStatus: 'NOT CONFIRMED',
        aiAnalysisStatus: 'NEEDS REVIEW',
        gpsDistanceMeters: 2.0,
        gpsMatchScore: 96,
        gpsResult: 'PASS',
        backgroundScore: 30,
        backgroundResult: 'LOW',
        perspectiveScore: 30,
        perspectiveResult: 'LOW',
        visualSimilarityScore: 30,
        repairEvidenceResult: 'INCONCLUSIVE',
        overallResult: 'NEEDS_ADMIN_REVIEW',
        featurePoints: [],
        reasons: [
          '📍 Location Match: GPS coordinates match (2.0m distance)',
          '🟡 Poor Image Quality: Submitted photo is too dark or blurry for AI feature extraction.',
          '🟡 NEEDS ADMIN REVIEW: Image quality insufficient for auto-verification. Admin review required.',
        ],
        analysisMethod: 'gemini-vision-multi-signal',
      },
      timeline: [
        { action: 'Reported', timestamp: new Date(Date.now() - 12 * 3600 * 1000), performedBy: citizen.name, role: 'citizen', newStatus: 'reported' },
        { action: 'Assigned to Contractor', timestamp: new Date(Date.now() - 8 * 3600 * 1000), performedBy: 'Admin', role: 'admin', newStatus: 'assigned' },
        { action: 'AFTER Photo Submitted', timestamp: new Date(Date.now() - 1 * 3600 * 1000), performedBy: contractor.name, role: 'contractor', newStatus: 'needs_review' },
      ],
    })
    await demoE.save()

    res.json({
      success: true,
      message: 'Successfully seeded 5 Mandatory Anti-Gaming Test Scenarios (Complaints A to E)',
      complaints: [formatIssue(demoA), formatIssue(demoB), formatIssue(demoC), formatIssue(demoD), formatIssue(demoE)],
    })
  } catch (err) {
    console.error('Error seeding demo scenarios:', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/admin/issues/export - Export issues register to Excel (.xlsx)
router.post('/issues/export', authRequired, requireAdmin, async (req, res) => {
  try {
    const { status, category, department, startDate, endDate, month, year } = req.body || {}
    const filter = {}
    if (status && status !== 'all') filter.status = status
    if (category && category !== 'all') filter.category = category
    if (department && department !== 'all') filter.responsibleDepartment = department

    if (startDate || endDate) {
      filter.createdAt = {}
      if (startDate) filter.createdAt.$gte = new Date(startDate)
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        filter.createdAt.$lte = end
      }
    } else if (month && year) {
      const m = parseInt(month, 10) - 1
      const y = parseInt(year, 10)
      const start = new Date(y, m, 1)
      const end = new Date(y, m + 1, 0, 23, 59, 59, 999)
      filter.createdAt = { $gte: start, $lte: end }
    }

    const issues = await Issue.find(filter).sort({ createdAt: -1 }).lean()

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'CivicPulse Municipal Platform'
    workbook.lastModifiedBy = req.user?.name || 'Admin'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet('Issues Register')

    const primaryHeaderFill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '0284C7' },
    }

    sheet.mergeCells('A1:L1')
    const titleCell = sheet.getCell('A1')
    titleCell.value = 'MUNICIPAL POTHOLE & ROAD COMPLAINTS REGISTER'
    titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFF' } }
    titleCell.fill = primaryHeaderFill
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' }
    sheet.getRow(1).height = 35

    sheet.mergeCells('A2:L2')
    const subTitle = sheet.getCell('A2')
    subTitle.value = `Total Issues Exported: ${issues.length} | Filter Status: ${status || 'All'} | Generated: ${new Date().toLocaleString()}`
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
      row.values = [
        issue.complaintId || `PT-${issue._id.toString().substring(0, 8)}`,
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
    const fileName = `Municipal_Issues_Export_${new Date().toISOString().split('T')[0]}.xlsx`

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    res.status(200).send(Buffer.from(buffer))
  } catch (err) {
    console.error('Export issues error:', err)
    res.status(500).json({ error: err.message })
  }
})

export default router

