import { Router } from 'express'
import Issue from '../models/Issue.js'
import User from '../models/User.js'
import ProcessedOperation from '../models/ProcessedOperation.js'
import { authRequired, requireContractor } from '../middleware/auth.js'
import { createNotification } from '../utils/notificationHelper.js'
import { formatIssue } from '../utils/format.js'
import { assignCluster, getClusters, recalculatePriority } from '../utils/cluster.js'
import { runRepairVerification } from '../utils/repairVerification.js'
import { verifyCitizenPotholeImage } from '../utils/geminiVisionService.js'
import { runAIReportingAgent } from '../utils/aiReportAgent.js'
import { CATEGORY_DEPARTMENTS } from '../config/constants.js'

const MAX_ACTIVE_CONTRACTOR_ISSUES = 5

const router = Router()

async function generateUniqueComplaintId() {
  const year = new Date().getFullYear()
  const randomNum = Math.floor(10000 + Math.random() * 90000)
  const code = `PT-${year}-${randomNum}`
  const existing = await Issue.findOne({ complaintId: code })
  if (existing) return generateUniqueComplaintId()
  return code
}

async function autoAssignContractor(issue) {
  try {
    const contractors = await User.find({ role: 'contractor' })
    if (!contractors || contractors.length === 0) {
      issue.status = 'awaiting_assignment'
      await issue.save()
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
      const calculatedDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000)
      issue.contractorId = selectedContractor._id
      issue.contractorName = selectedContractor.name
      issue.assignedTo = selectedContractor.name
      issue.assignedAt = new Date()
      issue.deadline = calculatedDeadline
      issue.slaStatus = 'on_track'
      issue.status = 'assigned'
      await issue.save()
      return selectedContractor
    } else {
      issue.status = 'awaiting_assignment'
      await issue.save()
      return null
    }
  } catch (err) {
    console.error('Error in autoAssignContractor during sync:', err)
    return null
  }
}

// POST /api/sync/report — Synchronize citizen offline pothole complaint
router.post('/report', authRequired, async (req, res) => {
  try {
    const {
      operationId,
      capturedAt,
      title,
      description,
      category = 'potholes_and_road_damage',
      severity = 3,
      location,
      imageUrl,
      beforeGps,
    } = req.body

    if (!operationId) {
      return res.status(400).json({ error: 'operationId (idempotency key) is required for sync' })
    }

    // Check Idempotency: Has this operation already been processed?
    const existingOp = await ProcessedOperation.findOne({ operationId })
    if (existingOp) {
      console.log(`⚡ Idempotent sync request: Operation ${operationId} was already processed. Returning existing record.`)
      return res.status(200).json(existingOp.responseData)
    }

    const existingIssueByOp = await Issue.findOne({ operationId })
    if (existingIssueByOp) {
      return res.status(200).json(formatIssue(existingIssueByOp))
    }

    if (!title || !description || !location || !imageUrl) {
      return res.status(400).json({ error: 'Missing required sync fields (title, description, location, imageUrl)' })
    }

    const reporter = await User.findById(req.user.id)
    if (!reporter) return res.status(404).json({ error: 'User not found' })

    const latNum = Number(location.lat)
    const lngNum = Number(location.lng)
    const parsedLocation = {
      lat: latNum,
      lng: lngNum,
      address: (location.address || 'Captured Location').trim(),
    }

    // Run 6-Agent AI Reporting Evaluation upon sync
    let agentResult = null
    try {
      agentResult = await runAIReportingAgent({
        imageInput: imageUrl,
        lat: parsedLocation.lat,
        lng: parsedLocation.lng,
        gpsAccuracy: location.accuracy ? Number(location.accuracy) : null,
        timestamp: capturedAt,
        user: reporter,
        description,
      })
    } catch (gErr) {
      console.warn('AI Agent sync verification fallback:', gErr.message)
    }

    if (agentResult) {
      const { decision, decisionReason, aiDecisionRecord, existingIssue } = agentResult

      if (decision === 'AUTO_REJECT') {
        return res.status(400).json({
          error: `Offline report rejected by AI: ${decisionReason}`,
        })
      }

      if (decision === 'POSSIBLE_DUPLICATE' && existingIssue) {
        existingIssue.reportCount = (existingIssue.reportCount || 1) + 1
        if (!existingIssue.voterIds?.includes(reporter._id)) {
          existingIssue.voterIds = existingIssue.voterIds || []
          existingIssue.voterIds.push(reporter._id)
        }
        recalculatePriority(existingIssue)
        await existingIssue.save()

        const dupResponsePayload = formatIssue(existingIssue)
        await ProcessedOperation.create({
          operationId,
          userId: reporter._id,
          actionType: 'CREATE_CITIZEN_REPORT',
          entityId: existingIssue._id.toString(),
          responseData: dupResponsePayload,
        }).catch(() => {})

        return res.status(200).json(dupResponsePayload)
      }
    }

    const complaintCode = await generateUniqueComplaintId()
    const deviceCaptureTime = capturedAt ? new Date(capturedAt) : new Date()

    const issue = new Issue({
      operationId,
      capturedAt: deviceCaptureTime,
      syncedAt: new Date(),
      complaintId: complaintCode,
      title,
      description,
      category,
      responsibleDepartment: CATEGORY_DEPARTMENTS[category] || 'General Municipal Services',
      severity: agentResult?.numericSeverity || Number(severity),
      location: parsedLocation,
      geoLocation: { type: 'Point', coordinates: [parsedLocation.lng, parsedLocation.lat] },
      area: parsedLocation.address,
      imageUrl,
      beforeGps: beforeGps || { lat: latNum, lng: lngNum },
      reporterId: reporter._id,
      reporterName: reporter.name,
      reporterTrustScore: reporter.trustScore,
      aiDecisionRecord: agentResult?.aiDecisionRecord || undefined,
      reportCount: 1,
      validationResult: 'valid',
      verificationResult: agentResult?.visionResult
        ? {
            overallResult: 'VERIFIED',
            geminiSingle: agentResult.visionResult,
            reasons: [agentResult.visionResult.reason || 'AI verified citizen offline pothole photo.'],
          }
        : undefined,
      status: agentResult?.decision === 'NEEDS_REVIEW' ? 'needs_review' : 'reported',
      votes: 1,
      voterIds: [reporter._id],
      timeline: [
        {
          action: 'Complaint Captured Offline & Synchronized',
          timestamp: deviceCaptureTime,
          performedBy: reporter.name,
          role: 'citizen',
          newStatus: agentResult?.decision === 'NEEDS_REVIEW' ? 'needs_review' : 'reported',
          details: `Captured offline on ${deviceCaptureTime.toLocaleString()}. Synchronized to server on ${new Date().toLocaleString()}. AI Decision: ${agentResult?.decision || 'ACCEPTED'}`,
        },
      ],
    })

    recalculatePriority(issue)
    await assignCluster(issue)
    await issue.save()

    reporter.totalReports += 1
    await reporter.save()

    await autoAssignContractor(issue)

    const responsePayload = formatIssue(issue)

    // Save ProcessedOperation for idempotency safety
    await ProcessedOperation.create({
      operationId,
      userId: reporter._id,
      actionType: 'CREATE_CITIZEN_REPORT',
      entityId: issue._id.toString(),
      responseData: responsePayload,
    })

    res.status(201).json(responsePayload)
  } catch (err) {
    console.error('Error in POST /api/sync/report:', err)
    res.status(500).json({ error: err.message || 'Offline report sync failed' })
  }
})

// POST /api/sync/repair-proof — Synchronize contractor offline repair evidence
router.post('/repair-proof', authRequired, requireContractor, async (req, res) => {
  try {
    const { operationId, issueId, capturedAt, afterImage, afterGps } = req.body

    if (!operationId || !issueId || !afterImage) {
      return res.status(400).json({ error: 'operationId, issueId, and afterImage are required for sync' })
    }

    // Idempotency check
    const existingOp = await ProcessedOperation.findOne({ operationId })
    if (existingOp) {
      console.log(`⚡ Idempotent repair sync request: Operation ${operationId} already processed.`)
      return res.status(200).json(existingOp.responseData)
    }

    const issue = await Issue.findById(issueId)
    if (!issue) {
      return res.status(404).json({ error: 'Target complaint issue not found on server' })
    }

    const deviceCaptureTime = capturedAt ? new Date(capturedAt) : new Date()

    issue.afterImage = afterImage
    issue.afterGps = afterGps || null
    issue.afterSubmittedAt = deviceCaptureTime
    issue.afterSubmittedBy = req.user.name
    issue.status = 'ai_verification'

    // Run Multi-Signal Repair AI Verification
    const verification = await runRepairVerification(
      issue.imageUrl,
      afterImage,
      issue.beforeGps,
      issue.afterGps
    )

    issue.verificationResult = verification

    if (verification.overallResult === 'VERIFIED') {
      issue.status = 'completed'
      issue.timeline.push({
        action: 'Offline Repair Proof Synchronized & AI Verified',
        timestamp: deviceCaptureTime,
        performedBy: req.user.name,
        role: 'contractor',
        previousStatus: 'repair_in_progress',
        newStatus: 'completed',
        details: 'Multi-signal AI verified repair location, landmarks, and surface completion.',
      })
    } else {
      issue.status = 'needs_review'
      issue.timeline.push({
        action: 'Offline Repair Proof Flagged for Admin Review',
        timestamp: deviceCaptureTime,
        performedBy: req.user.name,
        role: 'contractor',
        previousStatus: 'repair_in_progress',
        newStatus: 'needs_review',
        details: `Verification result: ${verification.overallResult}. Queued for Admin review.`,
      })
    }

    issue.lastActionAt = new Date()
    await issue.save()

    const responsePayload = formatIssue(issue)

    await ProcessedOperation.create({
      operationId,
      userId: req.user.id,
      actionType: 'SUBMIT_CONTRACTOR_PROOF',
      entityId: issue._id.toString(),
      responseData: responsePayload,
    })

    res.json(responsePayload)
  } catch (err) {
    console.error('Error in POST /api/sync/repair-proof:', err)
    res.status(500).json({ error: err.message || 'Offline repair proof sync failed' })
  }
})

export default router
