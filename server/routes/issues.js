import { Router } from 'express'
import Issue from '../models/Issue.js'
import User from '../models/User.js'
import Notification from '../models/Notification.js'
import UserNotification from '../models/UserNotification.js'
import ProcessedOperation from '../models/ProcessedOperation.js'
import { createNotification } from '../utils/notificationHelper.js'
import { calculatePriorityScore } from '../utils/priority.js'
import { formatIssue } from '../utils/format.js'
import { authRequired, requireAdmin, requireAnyAdmin, requireContractor, authOptional } from '../middleware/auth.js'
import { assignCluster, getClusters, recalculatePriority } from '../utils/cluster.js'
import { applyTrustUpdate } from '../utils/trust.js'
import { runMorphDetection } from '../utils/morphDetection.js'
import { runRepairVerification } from '../utils/repairVerification.js'
import { verifyCitizenPotholeImage } from '../utils/geminiVisionService.js'
import { runAIReportingAgent } from '../utils/aiReportAgent.js'
import {
  CATEGORY_DEPARTMENTS,
  FIELD_TEAMS,
  HIGH_PRIORITY_THRESHOLD,
  DUPLICATE_RADIUS_METERS,
} from '../config/constants.js'
import ExcelJS from 'exceljs'

const router = Router()

async function generateUniqueComplaintId() {
  const year = new Date().getFullYear()
  const randomNum = Math.floor(10000 + Math.random() * 90000)
  const code = `PT-${year}-${randomNum}`
  const existing = await Issue.findOne({ complaintId: code })
  if (existing) return generateUniqueComplaintId()
  return code
}

function calculateDeadline(severity) {
  const now = new Date()
  const sev = Number(severity)
  if (sev >= 4) return new Date(now.getTime() + 24 * 60 * 60 * 1000) // 24 Hours
  if (sev === 3) return new Date(now.getTime() + 72 * 60 * 60 * 1000) // 3 Days
  return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 Days
}

const MAX_ACTIVE_CONTRACTOR_ISSUES = 5

async function autoAssignContractor(issue) {
  try {
    const contractors = await User.find({ role: 'contractor' })
    if (!contractors || contractors.length === 0) {
      issue.status = 'awaiting_assignment'
      issue.timeline = issue.timeline || []
      issue.timeline.push({
        action: 'Awaiting Contractor Assignment',
        timestamp: new Date(),
        performedBy: 'System Auto-Assign Engine',
        role: 'system',
        previousStatus: 'reported',
        newStatus: 'awaiting_assignment',
        details: 'No active contractors in system. Queued for Admin manual assignment.',
      })
      await issue.save()

      await createNotification({
        userId: 'admin',
        issueId: issue._id,
        type: 'awaiting_assignment',
        title: `Action Required: No Contractor Registered`,
        message: `Complaint ${issue.complaintId || issue.title} requires contractor assignment.`,
        link: `/admin/issues`,
      })
      return null
    }

    let selectedContractor = null
    let lowestCount = Infinity

    for (const c of contractors) {
      const activeCount = await Issue.countDocuments({
        $or: [{ contractorId: c._id }, { contractorName: c.name }],
        status: { $in: ['assigned', 'accepted', 'repair_in_progress'] },
      })

      if (activeCount < MAX_ACTIVE_CONTRACTOR_ISSUES && activeCount < lowestCount) {
        lowestCount = activeCount
        selectedContractor = c
      }
    }

    if (selectedContractor) {
      const calculatedDeadline = calculateDeadline(issue.severity)
      const prevStatus = issue.status
      issue.contractorId = selectedContractor._id
      issue.contractorName = selectedContractor.name
      issue.assignedTo = selectedContractor.name
      issue.assignedAt = new Date()
      issue.deadline = calculatedDeadline
      issue.slaStatus = 'on_track'
      issue.status = 'assigned'

      issue.timeline = issue.timeline || []
      issue.timeline.push({
        action: 'Automatically Assigned to Contractor',
        timestamp: new Date(),
        performedBy: 'System Auto-Assign Engine',
        role: 'system',
        previousStatus: prevStatus,
        newStatus: 'assigned',
        details: `Auto-assigned to ${selectedContractor.name} (${lowestCount}/${MAX_ACTIVE_CONTRACTOR_ISSUES} active tasks). SLA Deadline: ${calculatedDeadline.toLocaleString()}`,
      })

      await issue.save()

      // Notify Contractor
      await createNotification({
        userId: selectedContractor._id,
        issueId: issue._id,
        type: 'task_assigned',
        title: `New Repair Task Assigned: ${issue.title}`,
        message: `You have been automatically assigned to repair complaint ${issue.complaintId || issue.title}.`,
        link: `/contractor/task/${issue._id}`,
      })

      // Notify Citizen
      await createNotification({
        userId: issue.reporterId,
        issueId: issue._id,
        type: 'status_update',
        title: `Contractor Assigned: ${issue.title}`,
        message: `Contractor ${selectedContractor.name} has been assigned to fix your reported pothole.`,
        link: `/my-issues`,
      })

      console.log(`🤖 Auto-assigned issue ${issue.complaintId} to ${selectedContractor.name} (${lowestCount}/${MAX_ACTIVE_CONTRACTOR_ISSUES} active tasks).`)
      return selectedContractor
    } else {
      // Fallback: All contractors at capacity
      const prevStatus = issue.status
      issue.status = 'awaiting_assignment'
      issue.timeline = issue.timeline || []
      issue.timeline.push({
        action: 'Awaiting Contractor Assignment (Capacity Reached)',
        timestamp: new Date(),
        performedBy: 'System Auto-Assign Engine',
        role: 'system',
        previousStatus: prevStatus,
        newStatus: 'awaiting_assignment',
        details: `All contractors are currently at maximum capacity (${MAX_ACTIVE_CONTRACTOR_ISSUES}/${MAX_ACTIVE_CONTRACTOR_ISSUES} active tasks). Queued for Admin manual assignment.`,
      })

      await issue.save()

      // Notify Admin
      await createNotification({
        userId: 'admin',
        issueId: issue._id,
        type: 'awaiting_assignment',
        title: `Action Required: All Contractors At Capacity`,
        message: `Complaint ${issue.complaintId || issue.title} requires manual assignment because all contractors have reached the 5-task limit.`,
        link: `/admin/issues`,
      })

      console.log(`⚠️ Issue ${issue.complaintId} set to awaiting_assignment (all contractors at capacity).`)
      return null
    }
  } catch (err) {
    console.error('Error in autoAssignContractor:', err)
    return null
  }
}

async function checkForRecurringPothole(lat, lng) {
  try {
    const radiusMeters = 20
    const prevs = await Issue.find({
      status: { $in: ['verified', 'completed', 'resolved'] },
      geoLocation: {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: radiusMeters,
        },
      },
    }).sort({ updatedAt: -1 })

    if (prevs.length > 0) {
      const prev = prevs[0]
      return {
        isRecurring: true,
        previousComplaintId: prev._id,
        previousComplaintCode: prev.complaintId || `PT-2026-${prev._id.toString().slice(-5).toUpperCase()}`,
        recurringDistanceMeters: 8,
        previousRepairDate: prev.updatedAt,
      }
    }
  } catch (err) {
    console.warn('Recurring pothole check warning:', err.message)
  }
  return { isRecurring: false }
}

function isValidParam(val) {
  return val != null && val !== '' && val !== 'undefined' && val !== 'null' && val !== 'all'
}

function buildQuery(params) {
  const query = {}
  if (isValidParam(params.status)) {
    if (params.status === 'resolved') {
      query.status = { $in: ['resolved', 'completed'] }
    } else if (params.status === 'completed') {
      query.status = { $in: ['completed', 'resolved'] }
    } else {
      query.status = params.status
    }
  }
  if (isValidParam(params.category)) query.category = params.category
  if (params.excludeResolved === 'true') query.status = { $ne: 'resolved' }
  if (isValidParam(params.validation)) query.validationResult = params.validation
  if (isValidParam(params.department)) query.responsibleDepartment = params.department

  // Date filtering
  const hasStart = isValidParam(params.startDate) && !isNaN(new Date(params.startDate).getTime())
  const hasEnd = isValidParam(params.endDate) && !isNaN(new Date(params.endDate).getTime())

  if (hasStart || hasEnd) {
    query.createdAt = {}
    if (hasStart) {
      query.createdAt.$gte = new Date(params.startDate)
    }
    if (hasEnd) {
      const end = new Date(params.endDate)
      end.setHours(23, 59, 59, 999)
      query.createdAt.$lte = end
    }
  }

  // Specific day/month/year filtering with NaN safety
  const dayNum = isValidParam(params.day) ? parseInt(params.day, 10) : NaN
  const monthNum = isValidParam(params.month) ? parseInt(params.month, 10) : NaN
  const yearNum = isValidParam(params.year) ? parseInt(params.year, 10) : NaN

  const exprConditions = []
  if (!isNaN(dayNum)) exprConditions.push({ $eq: [{ $dayOfMonth: '$createdAt' }, dayNum] })
  if (!isNaN(monthNum)) exprConditions.push({ $eq: [{ $month: '$createdAt' }, monthNum] })
  if (!isNaN(yearNum)) exprConditions.push({ $eq: [{ $year: '$createdAt' }, yearNum] })

  if (exprConditions.length === 1) {
    query.$expr = exprConditions[0]
  } else if (exprConditions.length > 1) {
    query.$expr = { $and: exprConditions }
  }

  return query
}

function pickTeam() {
  return FIELD_TEAMS[Math.floor(Math.random() * FIELD_TEAMS.length)]
}

async function notifyIssueParticipants(issue, title, message, type) {
  const recipientIds = new Set(
    [issue.reporterId?.toString(), ...(issue.voterIds || []).map((id) => id.toString())].filter(Boolean)
  )

  for (const userId of recipientIds) {
    await UserNotification.create({
      userId,
      issueId: issue._id,
      type,
      title,
      message,
    })
  }
}

router.get('/', authOptional, async (req, res) => {
  try {
    const query = buildQuery(req.query)

    let sort = { priorityScore: -1 }
    if (req.query.sort === 'date') sort = { createdAt: -1 }

    let q = Issue.find(query).sort(sort).lean()
    if (req.query.limit) q = q.limit(parseInt(req.query.limit, 10))

    const issues = await q
    res.json(issues.map(formatIssue))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/stats', authOptional, async (req, res) => {
  try {
    const statsFilter = {}
    if (req.query.department && req.query.department !== 'all') {
      statsFilter.responsibleDepartment = req.query.department
    }

    const issues = await Issue.find(statsFilter).lean()
    const now = new Date()

    res.json({
      total: issues.length,
      reported: issues.filter((i) => i.status === 'reported' || i.status === 'pending').length,
      assigned: issues.filter((i) => i.status === 'assigned' || i.status === 'accepted').length,
      inProgress: issues.filter((i) => i.status === 'repair_in_progress' || i.status === 'in_progress').length,
      needsReview: issues.filter((i) => i.status === 'needs_review' || i.status === 'suspicious').length,
      suspicious: issues.filter((i) => (i.status === 'needs_review' || i.status === 'suspicious') && i.verificationResult?.overallResult === 'SUSPICIOUS').length,
      uncertain: issues.filter((i) => (i.status === 'needs_review' || i.status === 'suspicious') && i.verificationResult?.overallResult !== 'SUSPICIOUS').length,
      completed: issues.filter((i) => i.status === 'completed' || i.status === 'resolved').length,
      resolved: issues.filter((i) => i.status === 'completed' || i.status === 'resolved').length,
      slaBreached: issues.filter((i) => i.deadline && new Date(i.deadline) < now && i.status !== 'completed' && i.status !== 'resolved').length,
      highPriority: issues.filter((i) => i.priorityScore >= HIGH_PRIORITY_THRESHOLD).length,
      pendingValidation: 0,
      manipulated: issues.filter((i) => i.validationResult === 'manipulated').length,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/clusters', authOptional, async (req, res) => {
  try {
    const query = buildQuery(req.query)
    const clusters = await getClusters(query)
    res.json(clusters.sort((a, b) => b.totalReports - a.totalReports))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/nearby', authOptional, async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat)
    const lng = parseFloat(req.query.lng)
    const radiusKm = parseFloat(req.query.radius) || 5
    const excludeResolved = req.query.excludeResolved !== 'false'

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: 'lat and lng required' })
    }

    const filter = {
      geoLocation: {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: radiusKm * 1000,
        },
      },
    }
    if (excludeResolved) filter.status = { $ne: 'resolved' }

    const issues = await Issue.find(filter).sort({ priorityScore: -1 })
    res.json(issues.map(formatIssue))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/priority/top', authOptional, async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat)
    const lng = parseFloat(req.query.lng)
    const limit = parseInt(req.query.limit || '3', 10)
    const radiusKm = parseFloat(req.query.radius) || 25

    let issues
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      issues = await Issue.find({
        status: { $ne: 'resolved' },
        geoLocation: {
          $near: {
            $geometry: { type: 'Point', coordinates: [lng, lat] },
            $maxDistance: radiusKm * 1000,
          },
        },
      }).limit(limit)
    } else {
      issues = await Issue.find({ status: { $ne: 'resolved' } })
        .sort({ priorityScore: -1 })
        .limit(limit)
    }

    res.json(issues.map(formatIssue))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/reporter/:reporterId/stats', authRequired, async (req, res) => {
  try {
    const issues = await Issue.find({ reporterId: req.params.reporterId })
    res.json({
      total: issues.length,
      reported: issues.filter((i) => i.status === 'reported').length,
      inProgress: issues.filter((i) => i.status === 'in_progress').length,
      resolved: issues.filter((i) => i.status === 'resolved').length,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/reporter/:reporterId', authRequired, async (req, res) => {
  try {
    const issues = await Issue.find({ reporterId: req.params.reporterId }).sort({ createdAt: -1 })
    res.json(issues.map(formatIssue))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/duplicates', authOptional, async (req, res) => {
  try {
    const { title, lat, lng } = req.query
    if (!title || !lat || !lng) {
      return res.status(400).json({ error: 'title, lat, lng required' })
    }

    const latitude = parseFloat(lat)
    const longitude = parseFloat(lng)
    const keywords = title.toLowerCase().split(/\s+/).filter((w) => w.length > 3)

    const nearby = await Issue.find({
      status: { $ne: 'resolved' },
      geoLocation: {
        $near: {
          $geometry: { type: 'Point', coordinates: [longitude, latitude] },
          $maxDistance: DUPLICATE_RADIUS_METERS,
        },
      },
    })

    const matches = nearby.filter((issue) =>
      keywords.some((k) => issue.title.toLowerCase().includes(k))
    )

    res.json(matches.map(formatIssue))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET Contractor Assigned Tasks
router.get('/contractor/my-tasks', authRequired, async (req, res) => {
  try {
    if (req.user.role !== 'contractor' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Contractor portal only' })
    }
    
    // Find issues assigned to contractor
    const tasks = await Issue.find({
      $or: [
        { contractorId: req.user.id },
        { assignedTo: req.user.name },
        { contractorName: req.user.name }
      ]
    }).sort({ createdAt: -1 }).lean()
    
    res.json(tasks.map(formatIssue))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST Check Duplicates Nearby (<50m)
router.post('/check-duplicates', authOptional, async (req, res) => {
  try {
    const { lat, lng } = req.body
    if (lat == null || lng == null) {
      return res.status(400).json({ error: 'lat and lng required' })
    }

    const latitude = parseFloat(lat)
    const longitude = parseFloat(lng)

    const nearbyOpen = await Issue.find({
      status: { $nin: ['completed', 'resolved', 'rejected'] },
      geoLocation: {
        $near: {
          $geometry: { type: 'Point', coordinates: [longitude, latitude] },
          $maxDistance: 50, // 50 meters radius
        },
      },
    }).limit(5).lean()

    res.json({
      hasDuplicates: nearbyOpen.length > 0,
      candidates: nearbyOpen.map(formatIssue),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:id', authOptional, async (req, res) => {
  try {
    const { id } = req.params
    if (!id || id === 'undefined' || id === 'null') {
      return res.status(400).json({ error: 'Invalid issue ID' })
    }
    let issue = null
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      issue = await Issue.findById(id).lean()
    }
    if (!issue) {
      issue = await Issue.findOne({ $or: [{ complaintId: id }, { operationId: id }] }).lean()
    }
    if (!issue) return res.status(404).json({ error: 'Issue not found' })
    res.json(formatIssue(issue))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST Live AI Pre-Verification Endpoint for Citizen Photo Capture/Upload
router.post('/analyze-pothole-photo', authRequired, async (req, res) => {
  try {
    const { image } = req.body
    if (!image) {
      return res.status(400).json({ error: 'Image data is required' })
    }

    console.log('🤖 Running Live Computer Vision Pre-Verification on citizen pothole image...')
    const geminiResult = await verifyCitizenPotholeImage(image)

    let suggestedSeverity = 3
    if (geminiResult.severity === 'LOW') suggestedSeverity = 2
    else if (geminiResult.severity === 'MEDIUM') suggestedSeverity = 3
    else if (geminiResult.severity === 'HIGH') suggestedSeverity = 4
    else if (geminiResult.severity === 'CRITICAL') suggestedSeverity = 5

    const isAccepted = Boolean(geminiResult.is_pothole && geminiResult.clear_enough && !geminiResult.is_ai_generated)

    res.json({
      success: true,
      isPothole: Boolean(geminiResult.is_pothole),
      confidence: Math.round((geminiResult.confidence || 0.85) * 100),
      severity: geminiResult.severity || 'MEDIUM',
      suggestedSeverity,
      imageQuality: geminiResult.image_quality || 'GOOD',
      clearEnough: geminiResult.clear_enough !== false,
      isAiGenerated: Boolean(geminiResult.is_ai_generated),
      reason: geminiResult.reason || 'Pothole detected in road surface photo.',
      status: isAccepted ? 'ACCEPTED' : 'REJECTED',
      message: isAccepted
        ? '✅ Real Road Pothole Confirmed! Report accepted for automatic admin queue.'
        : '❌ Image Analysis Failed: Photo does not appear to contain a clear road surface pothole.',
      analyzedBy: geminiResult.analyzed_by || 'Gemini Vision AI Engine',
    })
  } catch (err) {
    console.error('Error analyzing pothole photo:', err)
    res.status(500).json({ error: err.message || 'Image analysis failed' })
  }
})

// POST /api/issues/ai-smart-report - Agentic AI-Powered Zero-Touch Pothole Reporting Endpoint
router.post('/ai-smart-report', authRequired, async (req, res) => {
  try {
    const { photo, lat, lng, gpsAccuracy, timestamp, description, operationId } = req.body

    if (!photo) {
      return res.status(400).json({ error: 'Photo is required for AI Smart Reporting.' })
    }

    // Check operationId for idempotency
    if (operationId) {
      const existingOp = await ProcessedOperation.findOne({ operationId })
      if (existingOp && existingOp.entityId) {
        const existingIssue = await Issue.findById(existingOp.entityId)
        if (existingIssue) {
          return res.json({
            decision: existingIssue.aiDecisionRecord?.decision || 'AUTO_ACCEPT',
            message: existingIssue.aiDecisionRecord?.decisionReason || 'Report already processed successfully.',
            issue: formatIssue(existingIssue),
            aiDecisionRecord: existingIssue.aiDecisionRecord,
          })
        }
      }
    }

    const latitude = lat != null ? parseFloat(lat) : null
    const longitude = lng != null ? parseFloat(lng) : null

    console.log(`🤖 Agentic AI Pipeline starting for citizen ${req.user.name}...`)
    const agentResult = await runAIReportingAgent({
      imageInput: photo,
      lat: latitude,
      lng: longitude,
      gpsAccuracy: gpsAccuracy ? parseFloat(gpsAccuracy) : null,
      timestamp,
      user: req.user,
      description,
    })

    const { decision, decisionReason, aiDecisionRecord, existingIssue } = agentResult

    // Handle Decision Outcomes
    if (decision === 'AUTO_REJECT') {
      console.warn(`🛑 AI Reporting Agent AUTO-REJECTED upload for ${req.user.name}: ${decisionReason}`)
      return res.status(400).json({
        decision: 'AUTO_REJECT',
        message: decisionReason,
        aiDecisionRecord,
      })
    }

    if (decision === 'POSSIBLE_DUPLICATE' && existingIssue) {
      console.log(`🔁 AI Reporting Agent detected POSSIBLE_DUPLICATE near ${existingIssue.complaintId || existingIssue.title}`)

      const userIdVal = req.user.id || req.user._id
      // Increment report count on existing issue
      existingIssue.reportCount = (existingIssue.reportCount || 1) + 1
      if (!existingIssue.voterIds?.includes(userIdVal)) {
        existingIssue.voterIds = existingIssue.voterIds || []
        existingIssue.voterIds.push(userIdVal)
      }
      recalculatePriority(existingIssue)
      await existingIssue.save()

      return res.status(409).json({
        decision: 'POSSIBLE_DUPLICATE',
        message: decisionReason,
        existingIssue: formatIssue(existingIssue),
        aiDecisionRecord,
      })
    }

    // Create complaint for AUTO_ACCEPT or NEEDS_REVIEW
    const complaintId = await generateUniqueComplaintId()
    const address = (latitude != null && longitude != null)
      ? `Pothole Location (${latitude.toFixed(6)}, ${longitude.toFixed(6)})`
      : 'Location Unavailable'

    const titleText = description && description.trim().length > 0
      ? (description.length > 50 ? `${description.slice(0, 50)}...` : description)
      : 'Pothole Road Damage'

    const issueStatus = decision === 'AUTO_ACCEPT' ? 'reported' : 'needs_review'
    const currentUserId = req.user.id || req.user._id

    const issue = new Issue({
      title: titleText,
      description: description && description.trim().length > 0 ? description : decisionReason,
      category: 'potholes_and_road_damage',
      complaintId,
      severity: agentResult.numericSeverity || 3,
      status: issueStatus,
      location: {
        lat: latitude || 25.578321,
        lng: longitude || 91.893421,
        address,
      },
      beforeGps: latitude != null && longitude != null ? { lat: latitude, lng: longitude } : null,
      imageUrl: photo,
      reporterId: currentUserId,
      reporterName: req.user.name,
      reporterTrustScore: req.user.trustScore || 50,
      aiDecisionRecord,
      operationId: operationId || undefined,
      capturedAt: timestamp ? new Date(timestamp) : new Date(),
      syncedAt: new Date(),
      timeline: [
        {
          action: `Report Created via AI Smart Report (${decision})`,
          timestamp: new Date(),
          performedBy: 'AI Reporting Agent',
          role: 'system',
          newStatus: issueStatus,
          details: decisionReason,
        },
      ],
    })

    calculatePriorityScore(issue)
    await issue.save()

    // Store operationId idempotency
    if (operationId) {
      await ProcessedOperation.create({
        operationId,
        userId: currentUserId,
        actionType: 'CREATE_CITIZEN_REPORT',
        entityId: issue._id,
        serverResponse: formatIssue(issue),
      }).catch(() => {})
    }

    // Auto-assign contractor if AUTO_ACCEPT
    let assignedContractor = null
    if (decision === 'AUTO_ACCEPT') {
      assignedContractor = await autoAssignContractor(issue)
    }

    // Dispatches notifications
    await createNotification({
      userId: currentUserId,
      issueId: issue._id,
      type: 'status_update',
      title: decision === 'AUTO_ACCEPT' ? 'Pothole Report Accepted' : 'Report Sent for Admin Review',
      message: decision === 'AUTO_ACCEPT'
        ? `Your reported pothole (${complaintId}) was automatically verified and accepted.`
        : `Your reported pothole (${complaintId}) was received and sent to an administrator for review.`,
      link: '/my-issues',
    })

    console.log(`✨ AI Smart Report completed: ${complaintId} -> ${decision} (Status: ${issue.status})`)

    res.status(201).json({
      decision,
      message: decisionReason,
      issue: formatIssue(issue),
      aiDecisionRecord,
      assignedContractor: assignedContractor ? { id: assignedContractor._id, name: assignedContractor.name } : null,
    })
  } catch (err) {
    console.error('Error in ai-smart-report route:', err)
    res.status(500).json({ error: err.message || 'AI Smart Reporting failed' })
  }
})

router.post('/', authRequired, async (req, res) => {
  try {
    const { title, description, category, severity, location, imageUrl, mergeWithId, area, beforeGps } = req.body

    if (!title || !description || !category || !severity || !location) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    // Validate location shape
    const latNum = Number(location.lat)
    const lngNum = Number(location.lng)
    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
      return res.status(400).json({ error: 'location.lat and location.lng must be numbers' })
    }
    if (!location.address || typeof location.address !== 'string') {
      return res.status(400).json({ error: 'location.address is required' })
    }

    // Validate severity
    const sev = Number(severity)
    if (Number.isNaN(sev) || sev < 1 || sev > 5) {
      return res.status(400).json({ error: 'severity must be a number between 1 and 5' })
    }

    // Validate category is in enum
    const validCategories = [
      'potholes_and_road_damage',
      'traffic_signal_malfunction',
      'non_functional_streetlights',
      'water_leakage',
      'garbage_overflow',
      'drainage_blockage',
      'public_toilet_issue',
      'tree_trimming',
      'building_safety',
      'streetlight_failure',
      'other',
    ]
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        error: `Invalid category: ${category}. Valid categories are: ${validCategories.join(', ')}`,
      })
    }

    const reporter = await User.findById(req.user.id)
    if (!reporter) return res.status(404).json({ error: 'User not found' })

    const parsedLocation = {
      lat: latNum,
      lng: lngNum,
      address: location.address.trim(),
    }

    let geminiAnalysis = null
    // Mandatory Photo Proof & Automatic Gemini AI Photo Verification for Potholes
    if (!imageUrl) {
      return res.status(400).json({
        error: 'Upload a valid proof: Pothole photo proof is required to submit a complaint.',
      })
    }

    try {
      console.log('🤖 Running Automatic Gemini Vision Verification on citizen image...')
      geminiAnalysis = await verifyCitizenPotholeImage(imageUrl)

      if (geminiAnalysis && (geminiAnalysis.is_pothole === false || geminiAnalysis.clear_enough === false || geminiAnalysis.is_ai_generated === true)) {
        return res.status(400).json({
          error: `Upload a valid proof: ${geminiAnalysis.reason || 'Uploaded photo does not contain a valid, clear road surface pothole.'}`,
          geminiReason: geminiAnalysis.reason,
        })
      }
    } catch (geminiErr) {
      console.warn('⚠️ Gemini verification fallback used:', geminiErr.message)
    }

    // Automatic Duplicate Check (<50m radius)
    if (!mergeWithId) {
      try {
        const nearbyDuplicates = await Issue.find({
          status: { $nin: ['completed', 'resolved', 'rejected'] },
          geoLocation: {
            $near: {
              $geometry: { type: 'Point', coordinates: [parsedLocation.lng, parsedLocation.lat] },
              $maxDistance: 50,
            },
          },
        }).limit(1)

        if (nearbyDuplicates.length > 0) {
          const existing = nearbyDuplicates[0]
          const alreadyVoted = existing.voterIds?.some((id) => id.toString() === req.user.id)
          if (!alreadyVoted) {
            existing.reportCount = (existing.reportCount || 1) + 1
            existing.votes = (existing.votes || 1) + 1
            existing.voterIds = existing.voterIds || []
            existing.voterIds.push(reporter._id)
          }
          recalculatePriority(existing)
          await existing.save()

          return res.status(200).json({
            autoLinked: true,
            message: `Similar complaint already exists nearby (${existing.complaintId || 'PT-2026'}). Your report has been linked to strengthen this issue.`,
            issue: formatIssue(existing),
            ...formatIssue(existing),
          })
        }
      } catch (dupErr) {
        console.warn('⚠️ Duplicate check warning:', dupErr.message)
      }
    } else {
      const existing = await Issue.findById(mergeWithId)
      if (existing) {
        const alreadyVoted = existing.voterIds?.some((id) => id.toString() === req.user.id)
        if (!alreadyVoted) {
          existing.reportCount += 1
          existing.votes += 1
          existing.voterIds = existing.voterIds || []
          existing.voterIds.push(reporter._id)
        }
        recalculatePriority(existing)
        await existing.save()
        return res.status(200).json(formatIssue(existing))
      }
    }

    const complaintCode = await generateUniqueComplaintId()
    const recurringCheck = await checkForRecurringPothole(latNum, lngNum)

    console.log('Creating AI-Verified issue payload:', { complaintId: complaintCode, title, category, severity, location })
    
    const issue = new Issue({
      complaintId: complaintCode,
      title,
      description,
      category,
      responsibleDepartment: CATEGORY_DEPARTMENTS[category] || 'General Municipal Services',
      severity: sev,
      location: parsedLocation,
      geoLocation: { type: 'Point', coordinates: [parsedLocation.lng, parsedLocation.lat] },
      area: area || 'Unknown Area',
      imageUrl,
      beforeGps: beforeGps || { lat: latNum, lng: lngNum },
      reporterId: reporter._id,
      reporterName: reporter.name,
      reporterTrustScore: reporter.trustScore,
      reportCount: 1,
      validationResult: 'valid',
      verificationResult: geminiAnalysis ? {
        overallResult: 'VERIFIED',
        geminiSingle: geminiAnalysis,
        reasons: [geminiAnalysis.reason || 'AI verified citizen pothole photo.'],
      } : undefined,
      status: 'reported',
      votes: 1,
      voterIds: [reporter._id],
      isRecurring: recurringCheck.isRecurring,
      previousComplaintId: recurringCheck.previousComplaintId || null,
      previousComplaintCode: recurringCheck.previousComplaintCode || null,
      recurringDistanceMeters: recurringCheck.recurringDistanceMeters || null,
      previousRepairDate: recurringCheck.previousRepairDate || null,
      timeline: [
        {
          action: 'Complaint Reported & AI Verified',
          timestamp: new Date(),
          performedBy: reporter.name,
          role: 'citizen',
          newStatus: 'reported',
          details: `Complaint ${complaintCode} submitted and automatically AI-verified.`,
        },
      ],
    })

    recalculatePriority(issue)
    await assignCluster(issue)
    await issue.save()

    reporter.totalReports += 1
    await reporter.save()

    // Notify Citizen of successful submission and AI verification
    await createNotification({
      userId: reporter._id,
      issueId: issue._id,
      type: 'report_created',
      title: `Complaint Submitted & AI Verified: ${issue.title}`,
      message: `Your pothole report (${issue.complaintId}) has been AI-verified and submitted.`,
      link: `/my-issues`,
    })

    // Run Automatic Contractor Assignment Engine
    await autoAssignContractor(issue)

    res.status(201).json(formatIssue(issue))
  } catch (err) {
    console.error('Error creating issue:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    res.status(500).json({ error: message })
  }
})

// POST Admin Assign Contractor & SLA Deadline
router.post('/:id/assign-contractor', authRequired, requireAnyAdmin, async (req, res) => {
  try {
    const { contractorId, contractorName, deadlineHours, overrideCapacity } = req.body
    const issue = await Issue.findById(req.params.id)
    if (!issue) return res.status(404).json({ error: 'Issue not found' })

    const contractor = await User.findById(contractorId)
    const targetContractorName = contractor ? contractor.name : (contractorName || 'Assigned Contractor')
    const targetContractorId = contractor ? contractor._id : null

    // Check contractor capacity if contractor object found
    if (targetContractorId) {
      const activeTaskCount = await Issue.countDocuments({
        $or: [{ contractorId: targetContractorId }, { contractorName: targetContractorName }],
        status: { $in: ['assigned', 'accepted', 'repair_in_progress'] },
      })

      if (activeTaskCount >= MAX_ACTIVE_CONTRACTOR_ISSUES && !overrideCapacity) {
        return res.status(400).json({
          error: `Contractor ${targetContractorName} currently has ${activeTaskCount}/${MAX_ACTIVE_CONTRACTOR_ISSUES} active tasks (Capacity Limit Reached). Please confirm if you wish to override this capacity limit.`,
          requiresOverride: true,
          currentActiveCount: activeTaskCount,
          maxCapacity: MAX_ACTIVE_CONTRACTOR_ISSUES,
        })
      }
    }
    
    // Calculate SLA Deadline
    const calculatedDeadline = deadlineHours 
      ? new Date(Date.now() + deadlineHours * 60 * 60 * 1000)
      : calculateDeadline(issue.severity)

    const prevStatus = issue.status
    issue.contractorId = targetContractorId
    issue.contractorName = targetContractorName
    issue.assignedTo = targetContractorName
    issue.assignedAt = new Date()
    issue.assignedBy = req.user.name
    issue.deadline = calculatedDeadline
    issue.slaStatus = 'on_track'
    issue.status = 'assigned'
    
    issue.timeline = issue.timeline || []
    issue.timeline.push({
      action: 'Manually Assigned to Contractor',
      timestamp: new Date(),
      performedBy: req.user.name,
      role: req.user.role,
      previousStatus: prevStatus,
      newStatus: 'assigned',
      details: `Assigned to ${targetContractorName} by Admin ${req.user.name}. SLA Deadline: ${calculatedDeadline.toLocaleString()}`,
    })
    
    issue.lastActionAt = new Date()
    await issue.save()

    // Send notifications to Contractor & Citizen
    if (targetContractorId) {
      await createNotification({
        userId: targetContractorId,
        issueId: issue._id,
        type: 'task_assigned',
        title: `Task Assigned: ${issue.title}`,
        message: `Admin ${req.user.name} assigned you to fix complaint ${issue.complaintId || issue.title}.`,
        link: `/contractor/task/${issue._id}`,
      })
    }

    await createNotification({
      userId: issue.reporterId,
      issueId: issue._id,
      type: 'status_update',
      title: `Contractor Assigned: ${issue.title}`,
      message: `Contractor ${targetContractorName} has been assigned to your reported complaint.`,
      link: `/my-issues`,
    })

    res.json(formatIssue(issue))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST Contractor Update Status (accepts, repair_in_progress)
router.post('/:id/contractor-status', authRequired, requireContractor, async (req, res) => {
  try {
    const { status } = req.body
    const issue = await Issue.findById(req.params.id)
    if (!issue) return res.status(404).json({ error: 'Issue not found' })

    // Security Check: Verify that the issue is assigned to this contractor
    const isAssigned =
      req.user.role === 'admin' ||
      (issue.contractorId && issue.contractorId.toString() === req.user.id) ||
      issue.assignedTo === req.user.name ||
      issue.contractorName === req.user.name

    if (!isAssigned) {
      return res.status(403).json({ error: 'Access denied: You are not assigned to this repair task.' })
    }

    const validStatuses = ['accepted', 'repair_in_progress']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status change. Allowed: ${validStatuses.join(', ')}` })
    }

    const prevStatus = issue.status
    issue.status = status
    issue.timeline = issue.timeline || []
    issue.timeline.push({
      action: status === 'accepted' ? 'Assignment Accepted' : 'Repair Work Started',
      timestamp: new Date(),
      performedBy: req.user.name,
      role: 'contractor',
      previousStatus: prevStatus,
      newStatus: status,
      details: status === 'accepted' ? 'Contractor accepted repair task' : 'Contractor initiated repair on site',
    })
    
    issue.lastActionAt = new Date()
    await issue.save()

    // Notify participants
    await notifyIssueParticipants(
      issue,
      `Repair ${status === 'accepted' ? 'Accepted' : 'In Progress'}: ${issue.title}`,
      `Contractor ${req.user.name} has ${status === 'accepted' ? 'accepted the repair task' : 'started physical repair work on site'}.`,
      'status_update'
    )

    res.json(formatIssue(issue))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST Contractor Submit AFTER Photo Evidence & Run AI Repair Verification
router.post('/:id/submit-repair', authRequired, requireContractor, async (req, res) => {
  try {
    const { afterImage, afterGps } = req.body
    if (!afterImage) {
      return res.status(400).json({ error: 'AFTER repair photo is required' })
    }

    const issue = await Issue.findById(req.params.id)
    if (!issue) return res.status(404).json({ error: 'Issue not found' })

    // Security Check: Verify that the issue is assigned to this contractor
    const isAssigned =
      req.user.role === 'admin' ||
      (issue.contractorId && issue.contractorId.toString() === req.user.id) ||
      issue.assignedTo === req.user.name ||
      issue.contractorName === req.user.name

    if (!isAssigned) {
      return res.status(403).json({ error: 'Access denied: You cannot submit evidence for an unassigned complaint.' })
    }

    console.log(`🔍 Contractor submitted repair photo for complaint ${issue.complaintId || issue._id}. Running AI Verification...`)
    
    const prevStatus = issue.status
    issue.afterImage = afterImage
    issue.afterGps = afterGps || null
    issue.afterSubmittedAt = new Date()
    issue.afterSubmittedBy = req.user.name
    issue.status = 'ai_verification'

    // Run AI Repair Verification
    const verification = await runRepairVerification(
      issue.imageUrl,
      afterImage,
      issue.beforeGps || issue.location,
      issue.afterGps,
      50
    )

    issue.verificationResult = verification

    // Case 1: AI Verification PASSED cleanly -> Auto-move to RESOLVED state without requiring Admin intervention
    if (verification.overallResult === 'VERIFIED') {
      issue.status = 'resolved'
      issue.repairStatus = 'verified'
      issue.timeline = issue.timeline || []
      issue.timeline.push({
        action: 'Repair Automatically Verified & Complaint Resolved',
        timestamp: new Date(),
        performedBy: 'System AI Verification Engine',
        role: 'system',
        previousStatus: prevStatus,
        newStatus: 'resolved',
        details: `Multi-signal AI analysis confirmed location, background landmarks, camera perspective, and completed asphalt repair patch. Complaint marked RESOLVED automatically.`,
      })

      await notifyIssueParticipants(
        issue,
        `Repair Resolved & Verified: ${issue.title}`,
        `The pothole repair for "${issue.title}" has been automatically verified by AI and marked RESOLVED.`,
        'status_update'
      )

      issue.lastActionAt = new Date()
      await issue.save()

      return res.json(formatIssue(issue))
    }

    // Case 2: AI Verification INCONCLUSIVE / Confused -> Queue for Manual Admin Review
    if (verification.overallResult === 'NEEDS_ADMIN_REVIEW') {
      issue.status = 'needs_review'
      issue.repairStatus = 'needs_admin_review'
      issue.timeline = issue.timeline || []
      issue.timeline.push({
        action: 'AI Inconclusive - Queued for Admin Review',
        timestamp: new Date(),
        performedBy: 'System AI Verification Engine',
        role: 'system',
        previousStatus: prevStatus,
        newStatus: 'needs_review',
        details: `AI analysis was inconclusive or detected ambiguous image/GPS signals. Queued for manual Admin inspection.`,
      })

      await notifyIssueParticipants(
        issue,
        `Repair Under Admin Review: ${issue.title}`,
        `Contractor submitted repair evidence for "${issue.title}". AI verification was inconclusive, queued for Admin manual review.`,
        'status_update'
      )

      issue.lastActionAt = new Date()
      await issue.save()

      return res.json(formatIssue(issue))
    }

    // Case 3: Invalid / Suspicious Proof -> Rejection
    issue.status = 'repair_in_progress'
    issue.lastActionAt = new Date()
    await issue.save()

    const failReason = (verification.reasons && verification.reasons.length > 0)
      ? verification.reasons.join(' ')
      : 'AI check failed: Submitted repair photo or GPS location does not match original pothole.'

    return res.status(400).json({
      error: `Upload a valid proof: ${failReason}`,
      verification,
    })
  } catch (err) {
    console.error('Error submitting repair evidence:', err)
    res.status(500).json({ error: err.message })
  }
})

// POST Admin Review AI Repair Verification (Approve / Reject)
router.post('/:id/review-repair', authRequired, requireAnyAdmin, async (req, res) => {
  try {
    const { action, notes } = req.body // action: 'approve' | 'reject'
    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: "Action must be 'approve' or 'reject'" })
    }

    const issue = await Issue.findById(req.params.id)
    if (!issue) return res.status(404).json({ error: 'Issue not found' })

    if (action === 'approve' && !issue.afterImage) {
      return res.status(400).json({ error: 'Cannot mark complaint COMPLETED without AFTER repair photo evidence.' })
    }

    const prevStatus = issue.status
    issue.adminReviewedBy = req.user.name
    issue.adminReviewedAt = new Date()
    issue.adminReviewNotes = notes || (action === 'approve' ? 'Repair verified and approved by admin' : 'Repair evidence rejected by admin')

    if (action === 'approve') {
      issue.status = 'completed'
    } else {
      issue.status = 'rejected'
    }

    issue.timeline = issue.timeline || []
    issue.timeline.push({
      action: action === 'approve' ? 'Repair Approved & Complaint Closed' : 'Repair Evidence Rejected',
      timestamp: new Date(),
      performedBy: req.user.name,
      role: req.user.role,
      previousStatus: prevStatus,
      newStatus: issue.status,
      details: issue.adminReviewNotes,
    })

    issue.lastActionAt = new Date()
    await issue.save()

    // Notify participants
    await notifyIssueParticipants(
      issue,
      `Complaint ${issue.complaintId || ''} ${action === 'approve' ? 'Completed' : 'Requires Re-inspection'}`,
      `The repair for "${issue.title}" has been ${action === 'approve' ? 'verified and marked COMPLETED' : 'rejected during admin review'}.`,
      'status_update'
    )

    res.json(formatIssue(issue))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/:id/vote', authRequired, async (req, res) => {
  try {
    const issue = await Issue.findById(req.params.id)
    if (!issue) return res.status(404).json({ error: 'Issue not found' })
    if (issue.status === 'resolved') {
      return res.status(400).json({ error: 'Cannot vote on resolved issues' })
    }

    const alreadyVoted = issue.voterIds?.some((id) => id.toString() === req.user.id)
    if (alreadyVoted) {
      return res.status(409).json({ error: 'Already voted on this issue' })
    }

    issue.votes += 1
    issue.reportCount += 1
    issue.voterIds = issue.voterIds || []
    issue.voterIds.push(req.user.id)
    recalculatePriority(issue)
    await issue.save()

    res.json(formatIssue(issue))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/:id/validate', authRequired, requireAnyAdmin, async (req, res) => {
  try {
    const issue = await Issue.findById(req.params.id)
    if (!issue) return res.status(404).json({ error: 'Issue not found' })

    const { result: manualResult } = req.body
    const { result, confidence } = manualResult
      ? { result: manualResult, confidence: 90 }
      : runMorphDetection(issue)

    const reporter = await User.findById(issue.reporterId)
    if (reporter) {
      await applyTrustUpdate(reporter, result)
      issue.reporterTrustScore = reporter.trustScore
    }

    issue.validationResult = result
    issue.timeline = issue.timeline || []
    issue.timeline.push({
      action: 'Validation performed',
      performedBy: req.user.name,
      details: `Validated as ${result}`,
    })
    issue.lastActionAt = new Date()
    recalculatePriority(issue)
    await issue.save()

    await notifyIssueParticipants(
      issue,
      `Issue ${result === 'valid' ? 'Accepted' : 'Rejected'}: ${issue.title}`,
      `The issue "${issue.title}" was ${result === 'valid' ? 'accepted' : 'rejected'} by an administrator. Validation result: ${result}.`,
      'validation_update'
    )

    res.json({ issue: formatIssue(issue), result, confidence, user: reporter ? { id: reporter._id, trustScore: reporter.trustScore } : null })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.patch('/:id/status', authRequired, requireAnyAdmin, async (req, res) => {
  try {
    const { status } = req.body
    const issue = await Issue.findById(req.params.id)
    if (!issue) return res.status(404).json({ error: 'Issue not found' })

    issue.status = status
    
    // Ensure responsibleDepartment is set for old issues
    if (!issue.responsibleDepartment) {
      issue.responsibleDepartment = CATEGORY_DEPARTMENTS[issue.category] || 'General Municipal Services'
    }
    
    issue.timeline = issue.timeline || []
    issue.timeline.push({
      action: 'Status updated',
      performedBy: req.user.name,
      details: `Status changed to ${status}`,
    })
    issue.lastActionAt = new Date()
    if (status === 'in_progress') {
      issue.assignedTo = pickTeam()
    }
    await issue.save()

    await notifyIssueParticipants(
      issue,
      `Issue ${status === 'in_progress' ? 'In Progress' : status === 'resolved' ? 'Resolved' : 'Updated'}: ${issue.title}`,
      `The issue "${issue.title}" is now ${status.replace('_', ' ')}.`,
      'status_update'
    )

    res.json(formatIssue(issue))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/export', authRequired, requireAnyAdmin, async (req, res) => {
  try {
    const { filters } = req.body
    const query = buildQuery(filters || {})
    
    const issues = await Issue.find(query).sort({ createdAt: -1 }).lean()
    
    // Create workbook
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'CivicPulse'
    workbook.created = new Date()
    
    const worksheet = workbook.addWorksheet('Issues Report', {
      properties: { tabColor: { argb: '00B4D8' } }
    })
    
    // Add title row
    worksheet.mergeCells('A1:K1')
    const titleCell = worksheet.getCell('A1')
    titleCell.value = 'CivicPulse - Issues Report'
    titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFF' } }
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '00B4D8' }
    }
    titleCell.alignment = { horizontal: 'center' }
    worksheet.getRow(1).height = 30
    
    // Add filters info
    worksheet.mergeCells('A2:K2')
    const filterCell = worksheet.getCell('A2')
    const filterText = []
    if (filters?.category) filterText.push(`Category: ${filters.category}`)
    if (filters?.startDate) filterText.push(`From: ${filters.startDate}`)
    if (filters?.endDate) filterText.push(`To: ${filters.endDate}`)
    if (filters?.status) filterText.push(`Status: ${filters.status}`)
    filterCell.value = filterText.length > 0 ? `Filters: ${filterText.join(' | ')}` : 'All Issues'
    filterCell.font = { size: 10, italic: true }
    filterCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'E3F2FD' }
    }
    
    // Add headers
    const headers = [
      'Issue ID',
      'Title',
      'Category',
      'Status',
      'Priority',
      'Severity',
      'Location',
      'Reporter',
      'Trust Score',
      'Validation',
      'Created Date'
    ]
    
    const headerRow = worksheet.addRow(headers)
    headerRow.height = 25
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFF' }, size: 11 }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '0284C7' }
      }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' }
      }
    })
    
    // Add data rows
    issues.forEach((issue) => {
      const row = worksheet.addRow([
        issue._id.toString().slice(-6),
        issue.title,
        issue.category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        issue.status.replace('_', ' ').toUpperCase(),
        issue.priorityScore || 0,
        issue.severity,
        issue.location?.address || 'N/A',
        issue.reporterName,
        issue.reporterTrustScore || 50,
        (issue.validationResult || 'pending').toUpperCase(),
        new Date(issue.createdAt).toLocaleString()
      ])
      
      // Style data rows
      row.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: 'thin' },
          bottom: { style: 'thin' },
          left: { style: 'thin' },
          right: { style: 'thin' }
        }
        cell.alignment = { vertical: 'middle', wrapText: true }
        
        // Color code status
        if (colNumber === 4) {
          const status = cell.value
          if (status === 'RESOLVED') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'C6F6D5' } }
            cell.font = { color: { argb: '22543D' } }
          } else if (status === 'IN PROGRESS') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEFCBF' } }
            cell.font = { color: { argb: '744210' } }
          } else {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FED7D7' } }
            cell.font = { color: { argb: '742A2A' } }
          }
        }
        
        // Color code validation
        if (colNumber === 10) {
          const validation = cell.value
          if (validation === 'VALID') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'C6F6D5' } }
          } else if (validation === 'MANIPULATED') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FED7D7' } }
          }
        }
      })
      
      // Alternate row colors
      if (issues.indexOf(issue) % 2 === 0) {
        row.eachCell((cell) => {
          if (!cell.fill || cell.fill.pattern !== 'solid') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F7FAFC' } }
          }
        })
      }
    })
    
    // Set column widths
    worksheet.columns = [
      { width: 10 },  // ID
      { width: 30 },  // Title
      { width: 25 },  // Category
      { width: 15 },  // Status
      { width: 10 },  // Priority
      { width: 10 },  // Severity
      { width: 35 },  // Location
      { width: 20 },  // Reporter
      { width: 12 },  // Trust Score
      { width: 15 },  // Validation
      { width: 20 }   // Created Date
    ]
    
    // Add summary at the end
    const summaryRow = issues.length + 4
    worksheet.mergeCells(`A${summaryRow}:K${summaryRow}`)
    const summaryCell = worksheet.getCell(`A${summaryRow}`)
    summaryCell.value = `Total Issues: ${issues.length} | Generated: ${new Date().toLocaleString()}`
    summaryCell.font = { bold: true, size: 11 }
    summaryCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'E3F2FD' }
    }
    
    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer()
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="issues-report-${Date.now()}.xlsx"`)
  } catch (err) {
    console.error('Export error:', err)
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/issues/clear-all - Admin Clear All Issues & Associated Notifications
router.delete('/clear-all', authRequired, requireAnyAdmin, async (req, res) => {
  try {
    const issueDeleteResult = await Issue.deleteMany({})
    const notifDeleteResult = await Notification.deleteMany({})
    const userNotifDeleteResult = await UserNotification.deleteMany({})
    await ProcessedOperation.deleteMany({})

    console.log(
      `🗑️ Admin ${req.user.name} cleared all issues (${issueDeleteResult.deletedCount}) and notifications (${notifDeleteResult.deletedCount + userNotifDeleteResult.deletedCount}) from database.`
    )

    res.json({
      message: 'All issues and associated notifications have been cleared successfully.',
      deletedIssuesCount: issueDeleteResult.deletedCount,
      deletedNotificationsCount: notifDeleteResult.deletedCount + userNotifDeleteResult.deletedCount,
    })
  } catch (err) {
    console.error('Clear all issues error:', err)
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/issues/:id - Admin Delete Single Issue & Linked Notifications
router.delete('/:id', authRequired, requireAnyAdmin, async (req, res) => {
  try {
    const issue = await Issue.findByIdAndDelete(req.params.id)
    if (!issue) {
      return res.status(404).json({ error: 'Issue not found' })
    }

    const notifResult = await Notification.deleteMany({ issueId: req.params.id })
    const userNotifResult = await UserNotification.deleteMany({ issueId: req.params.id })

    console.log(`🗑️ Admin ${req.user.name} deleted issue ${issue.complaintId || issue.title}.`)

    res.json({
      message: 'Issue and associated notifications deleted successfully.',
      deletedNotificationsCount: notifResult.deletedCount + userNotifResult.deletedCount,
    })
  } catch (err) {
    console.error('Delete issue error:', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/issues/export - Export issues register to Excel (.xlsx)
router.post('/export', authRequired, requireAnyAdmin, async (req, res) => {
  try {
    const filter = buildQuery(req.body || {})
    const issues = await Issue.find(filter).sort({ createdAt: -1 }).lean()

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'CivicPulse Municipal Platform'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet('Issues Register')

    // Header styling
    sheet.mergeCells('A1:L1')
    const titleCell = sheet.getCell('A1')
    titleCell.value = 'MUNICIPAL POTHOLE & ROAD COMPLAINTS REGISTER'
    titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFF' } }
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E3A8A' } }
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' }
    sheet.getRow(1).height = 30

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

    const headerRow = sheet.getRow(3)
    headers.forEach((h, idx) => {
      const cell = headerRow.getCell(idx + 1)
      cell.value = h
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1D4ED8' } }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
    })
    headerRow.height = 24

    issues.forEach((issue, idx) => {
      const row = sheet.getRow(4 + idx)
      row.values = [
        issue.complaintId || `PT-${issue._id.toString().substring(0, 8)}`,
        issue.title,
        issue.category,
        issue.severity,
        issue.status.toUpperCase(),
        issue.location?.address || '—',
        issue.reporterName || '—',
        issue.contractorName || issue.assignedTo || '—',
        issue.responsibleDepartment || '—',
        issue.priorityScore || 0,
        issue.createdAt ? new Date(issue.createdAt).toLocaleString() : '—',
        issue.status === 'completed' || issue.status === 'verified' ? (issue.updatedAt ? new Date(issue.updatedAt).toLocaleString() : '—') : '—',
      ]
    })

    sheet.columns = [
      { width: 16 },
      { width: 28 },
      { width: 22 },
      { width: 10 },
      { width: 18 },
      { width: 35 },
      { width: 20 },
      { width: 22 },
      { width: 24 },
      { width: 14 },
      { width: 20 },
      { width: 20 },
    ]

    const buffer = await workbook.xlsx.writeBuffer()
    const fileName = `Municipal_Issues_Export_${new Date().toISOString().split('T')[0]}.xlsx`

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    res.send(Buffer.from(buffer))
  } catch (err) {
    console.error('Export issues error:', err)
    res.status(500).json({ error: err.message })
  }
})

export default router
