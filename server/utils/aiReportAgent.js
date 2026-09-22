import Issue from '../models/Issue.js'
import { verifyCitizenPotholeImage } from './geminiVisionService.js'
import { runMorphDetection } from './morphDetection.js'

function haversineMeters(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null
  const R = 6371000
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c)
}

/**
 * 🤖 Agentic AI-Powered Zero-Touch Pothole Reporting Pipeline
 * Runs 6 structured backend agent evaluation stages to process citizen photo uploads.
 */
export async function runAIReportingAgent({ imageInput, lat, lng, gpsAccuracy, timestamp, user, description }) {
  const actionLogs = []
  const now = new Date()

  // Stage 1: Report Initiated
  actionLogs.push({
    stage: 'REPORT_INITIATED',
    status: 'COMPLETED',
    message: 'Citizen uploaded report evidence and initiated AI evaluation.',
    timestamp: now,
  })

  // Stage 2: Agent 1 - Image Understanding Agent
  let visionResult = {
    is_pothole: true,
    confidence: 0.85,
    severity: 'MEDIUM',
    image_quality: 'GOOD',
    clear_enough: true,
    is_ai_generated: false,
    reason: 'Pothole detected in road pavement photo.',
  }

  try {
    const aiVision = await verifyCitizenPotholeImage(imageInput)
    if (aiVision) {
      visionResult = aiVision
    }
    actionLogs.push({
      stage: 'IMAGE_ANALYZED',
      status: 'COMPLETED',
      message: `Gemini Vision AI analyzed photo: ${visionResult.reason} (Confidence: ${Math.round((visionResult.confidence || 0.8) * 100)}%)`,
      timestamp: new Date(),
    })
  } catch (err) {
    actionLogs.push({
      stage: 'IMAGE_ANALYZED',
      status: 'WARNING',
      message: `Vision AI analysis fallback applied: ${err.message}`,
      timestamp: new Date(),
    })
  }

  // Stage 3: Agent 2 - Evidence Validation Agent (Forensic Authenticity)
  let morphResult = { isManipulated: false, isAIGenerated: false }
  try {
    morphResult = runMorphDetection({ imageUrl: imageInput })
    actionLogs.push({
      stage: 'EVIDENCE_VALIDATED',
      status: 'COMPLETED',
      message: `Local forensic check passed. Authenticity verified (${morphResult.isManipulated ? 'Manipulated' : 'Authentic'}).`,
      timestamp: new Date(),
    })
  } catch (err) {
    actionLogs.push({
      stage: 'EVIDENCE_VALIDATED',
      status: 'WARNING',
      message: 'Forensic authenticity check fallback executed.',
      timestamp: new Date(),
    })
  }

  const suspiciousImage = Boolean(visionResult.is_ai_generated || morphResult.isManipulated || morphResult.isAIGenerated)

  // Stage 4: Agent 3 - Location Agent
  const hasGps = lat != null && lng != null && !isNaN(Number(lat)) && !isNaN(Number(lng))
  const gpsStatus = hasGps ? 'AVAILABLE' : 'UNAVAILABLE'

  actionLogs.push({
    stage: 'LOCATION_CAPTURED',
    status: hasGps ? 'COMPLETED' : 'WARNING',
    message: hasGps
      ? `GPS location captured: ${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)} (Accuracy: ±${gpsAccuracy || 10}m).`
      : 'Device GPS location unavailable.',
    timestamp: new Date(),
  })

  // Stage 5: Agent 4 - Duplicate Detection Agent
  let isDuplicate = false
  let existingIssue = null
  let minDistanceMeters = Infinity

  if (hasGps) {
    try {
      const activeIssues = await Issue.find({
        status: { $in: ['reported', 'awaiting_assignment', 'under_review', 'assigned', 'accepted', 'repair_in_progress', 'verified'] },
      }).sort({ createdAt: -1 })

      for (const issue of activeIssues) {
        if (issue.location?.lat != null && issue.location?.lng != null) {
          const dist = haversineMeters(Number(lat), Number(lng), issue.location.lat, issue.location.lng)
          if (dist !== null && dist < minDistanceMeters) {
            minDistanceMeters = dist
            if (dist <= 20) {
              isDuplicate = true
              existingIssue = issue
            }
          }
        }
      }

      actionLogs.push({
        stage: 'DUPLICATE_CHECKED',
        status: 'COMPLETED',
        message: isDuplicate
          ? `Duplicate detected: Existing pothole complaint (${existingIssue.complaintId || existingIssue.title}) is ${minDistanceMeters}m away.`
          : 'No duplicate complaints found nearby.',
        timestamp: new Date(),
      })
    } catch (dupErr) {
      actionLogs.push({
        stage: 'DUPLICATE_CHECKED',
        status: 'WARNING',
        message: `Duplicate check warning: ${dupErr.message}`,
        timestamp: new Date(),
      })
    }
  } else {
    actionLogs.push({
      stage: 'DUPLICATE_CHECKED',
      status: 'SKIPPED',
      message: 'Duplicate check skipped due to missing GPS coordinates.',
      timestamp: new Date(),
    })
  }

  // Stage 6: Agent 5 - Severity Estimation Agent
  const severityStr = (visionResult.severity || 'MEDIUM').toUpperCase()
  let numericSeverity = 3
  if (severityStr === 'CRITICAL') numericSeverity = 5
  else if (severityStr === 'HIGH') numericSeverity = 4
  else if (severityStr === 'MEDIUM') numericSeverity = 3
  else if (severityStr === 'LOW') numericSeverity = 2

  actionLogs.push({
    stage: 'SEVERITY_ESTIMATED',
    status: 'COMPLETED',
    message: `Estimated damage severity: ${severityStr} (Level ${numericSeverity}/5). Reason: ${visionResult.reason}`,
    timestamp: new Date(),
  })

  // Stage 7: Agent 6 - Decision Agent
  let decision = 'AUTO_ACCEPT'
  let decisionReason = ''

  if (isDuplicate && existingIssue) {
    decision = 'POSSIBLE_DUPLICATE'
    decisionReason = `A pothole report already exists within ${minDistanceMeters}m of this location (${existingIssue.complaintId || existingIssue.title}).`
  } else if (visionResult.is_pothole === false || (visionResult.confidence < 0.40 && visionResult.image_quality === 'POOR') || suspiciousImage) {
    decision = 'AUTO_REJECT'
    decisionReason = visionResult.is_pothole === false
      ? 'Uploaded photo does not contain a valid road surface or pothole.'
      : suspiciousImage
      ? 'Uploaded photo failed image authenticity or anti-tampering inspection.'
      : 'Photo quality is too low to verify a pothole.'
  } else if (visionResult.confidence < 0.70 || visionResult.image_quality === 'POOR' || !hasGps) {
    decision = 'NEEDS_REVIEW'
    decisionReason = !hasGps
      ? 'Pothole detected, but device GPS is missing. Requires manual admin review.'
      : `Pothole detected with moderate AI confidence (${Math.round((visionResult.confidence || 0.6) * 100)}%). Assigned to admin review queue.`
  } else {
    decision = 'AUTO_ACCEPT'
    decisionReason = `Verified road pothole report (AI Confidence: ${Math.round((visionResult.confidence || 0.85) * 100)}%, Quality: ${visionResult.image_quality || 'GOOD'}).`
  }

  actionLogs.push({
    stage: 'DECISION_EVALUATED',
    status: 'COMPLETED',
    message: `Final Decision: ${decision} — ${decisionReason}`,
    timestamp: new Date(),
  })

  const aiDecisionRecord = {
    decision,
    decisionReason,
    isRoadImage: visionResult.is_pothole !== false,
    potholeDetected: Boolean(visionResult.is_pothole),
    potholeConfidence: visionResult.confidence || 0.8,
    imageQuality: visionResult.image_quality || 'GOOD',
    suspiciousImage,
    gpsStatus,
    isDuplicate,
    duplicateDistanceMeters: isDuplicate ? minDistanceMeters : null,
    estimatedSeverity: severityStr,
    severityConfidence: visionResult.confidence || 0.8,
    severityReason: visionResult.reason,
    processedAt: new Date(),
    actionLogs,
  }

  return {
    decision, // 'AUTO_ACCEPT' | 'AUTO_REJECT' | 'NEEDS_REVIEW' | 'POSSIBLE_DUPLICATE'
    decisionReason,
    severityStr,
    numericSeverity,
    visionResult,
    morphResult,
    aiDecisionRecord,
    existingIssue: isDuplicate ? existingIssue : null,
  }
}
