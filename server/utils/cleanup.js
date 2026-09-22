import cron from 'node-cron'
import Issue from '../models/Issue.js'
import User from '../models/User.js'
import { createNotification } from './notificationHelper.js'

const INACTIVE_DAYS_THRESHOLD = 30
const DELETION_DAYS_THRESHOLD = 32

export function initializeCleanupJobs() {
  // Run every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    try {
      console.log('🔄 Running scheduled issue cleanup & SLA monitor...')
      await checkOverdueIssues()
      await checkInactiveIssues()
      await deleteExpiredIssues()
      await deleteResolvedOrRejected()
    } catch (err) {
      console.error('Cleanup job error:', err)
    }
  })
}

/**
 * Checks for tasks that have breached their SLA deadline
 */
export async function checkOverdueIssues() {
  try {
    const now = new Date()
    const overdueCandidates = await Issue.find({
      status: { $in: ['assigned', 'accepted', 'repair_in_progress'] },
      deadline: { $lt: now },
    })

    for (const issue of overdueCandidates) {
      const prevStatus = issue.status
      issue.status = 'overdue'
      issue.slaStatus = 'breached'
      issue.timeline = issue.timeline || []
      issue.timeline.push({
        action: 'Task Marked OVERDUE (SLA Breached)',
        timestamp: new Date(),
        performedBy: 'System Monitor',
        role: 'system',
        previousStatus: prevStatus,
        newStatus: 'overdue',
        details: `SLA deadline (${issue.deadline?.toLocaleString()}) exceeded before repair completion. Task flagged for Admin review.`,
      })
      await issue.save()

      console.log(`⚠️ Issue ${issue.complaintId || issue._id} marked OVERDUE due to SLA deadline breach.`)

      // Notify Contractor if assigned
      if (issue.contractorId) {
        await createNotification({
          userId: issue.contractorId,
          issueId: issue._id,
          type: 'overdue_task',
          title: `OVERDUE TASK: ${issue.title}`,
          message: `Your assigned task "${issue.title}" has passed its SLA deadline and is marked OVERDUE. Please take urgent action.`,
          link: `/contractor/task/${issue._id}`,
        })
      }

      // Notify Admins
      await createNotification({
        userId: 'admin',
        issueId: issue._id,
        type: 'sla_breached',
        title: `SLA BREACHED: ${issue.title}`,
        message: `Task ${issue.complaintId || ''} assigned to ${issue.contractorName || 'contractor'} has breached its SLA deadline.`,
        link: `/admin/issues`,
      })
    }
  } catch (err) {
    console.error('Error checking overdue issues:', err)
  }
}

async function checkInactiveIssues() {
  const thirtyDaysAgo = new Date(Date.now() - INACTIVE_DAYS_THRESHOLD * 24 * 60 * 60 * 1000)

  const inactiveIssues = await Issue.find({
    status: { $ne: 'resolved' },
    lastActionAt: { $lt: thirtyDaysAgo },
    inactiveNotificationSent: false,
  })

  const admins = await User.find({ role: 'admin' })

  for (const issue of inactiveIssues) {
    for (const admin of admins) {
      await createNotification({
        userId: admin._id,
        issueId: issue._id,
        type: 'inactive_30days',
        title: `Issue Inactive: ${issue.title}`,
        message: `Issue #${issue._id} has been inactive for ${INACTIVE_DAYS_THRESHOLD} days. Please take action or mark as resolved.`,
        link: `/admin/issues`,
      })
    }

    await Issue.findByIdAndUpdate(issue._id, { inactiveNotificationSent: true })
    console.log(`Notification sent for inactive issue: ${issue._id}`)
  }
}

async function deleteExpiredIssues() {
  const thirtyTwoDaysAgo = new Date(Date.now() - DELETION_DAYS_THRESHOLD * 24 * 60 * 60 * 1000)

  const expiredIssues = await Issue.find({
    status: { $ne: 'resolved' },
    lastActionAt: { $lt: thirtyTwoDaysAgo },
    inactiveNotificationSent: true,
  })

  const admins = await User.find({ role: 'admin' })

  for (const issue of expiredIssues) {
    for (const admin of admins) {
      await createNotification({
        userId: admin._id,
        issueId: issue._id,
        type: 'scheduled_deletion',
        title: `Issue Deleted: ${issue.title}`,
        message: `Issue #${issue._id} was automatically deleted due to prolonged inactivity (${DELETION_DAYS_THRESHOLD} days).`,
        link: `/admin/issues`,
      })
    }

    await Issue.findByIdAndDelete(issue._id)
    console.log(`Deleted expired issue: ${issue._id}`)
  }
}

async function deleteResolvedOrRejected() {
  const RESOLVED_RETENTION_DAYS = 30
  const cutoff = new Date(Date.now() - RESOLVED_RETENTION_DAYS * 24 * 60 * 60 * 1000)

  const toDelete = await Issue.find({
    $or: [{ status: 'resolved' }, { validationResult: 'manipulated' }],
    lastActionAt: { $lt: cutoff },
  })

  if (!toDelete.length) return

  const admins = await User.find({ role: 'admin' })

  for (const issue of toDelete) {
    for (const admin of admins) {
      await createNotification({
        userId: admin._id,
        issueId: issue._id,
        type: 'scheduled_deletion',
        title: `Issue Removed: ${issue.title}`,
        message: `Issue #${issue._id} was removed after ${RESOLVED_RETENTION_DAYS} days since resolution/rejection.`,
        link: `/admin/issues`,
      })
    }

    await Issue.findByIdAndDelete(issue._id)
    console.log(`Deleted resolved/rejected issue: ${issue._id}`)
  }
}
