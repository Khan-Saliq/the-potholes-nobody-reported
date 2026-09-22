import { Router } from 'express'
import { authRequired } from '../middleware/auth.js'
import Notification from '../models/Notification.js'
import UserNotification from '../models/UserNotification.js'

const router = Router()

// GET /api/notifications/unread-count - Lightweight endpoint for Navbar badge polling
router.get('/unread-count', authRequired, async (req, res) => {
  try {
    const [count1, count2] = await Promise.all([
      Notification.countDocuments({ userId: req.user.id, read: false }),
      UserNotification.countDocuments({ userId: req.user.id, read: false }),
    ])
    res.json({ unreadCount: count1 + count2 })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/notifications - Get all notifications for current user (Parallel DB Fetch)
router.get('/', authRequired, async (req, res) => {
  try {
    const [notifications, userNotifications] = await Promise.all([
      Notification.find({ userId: req.user.id })
        .sort({ createdAt: -1 })
        .populate('issueId', 'title status complaintId')
        .lean(),
      UserNotification.find({ userId: req.user.id })
        .sort({ createdAt: -1 })
        .populate('issueId', 'title status complaintId')
        .lean(),
    ])

    const combined = [...notifications, ...userNotifications].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )

    res.json(
      combined.map((item) => ({
        ...item,
        id: item._id.toString(),
      }))
    )
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/notifications/read-all - Mark all notifications as read
router.patch('/read-all', authRequired, async (req, res) => {
  try {
    await Promise.all([
      Notification.updateMany({ userId: req.user.id, read: false }, { read: true }),
      UserNotification.updateMany({ userId: req.user.id, read: false }, { read: true }),
    ])
    res.json({ message: 'All notifications marked as read' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/notifications/:id/read - Mark single notification as read
router.patch('/:id/read', authRequired, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { read: true },
      { new: true }
    ).lean()

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' })
    }

    res.json({
      ...notification,
      id: notification._id.toString(),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/notifications/:id - Delete notification
router.delete('/:id', authRequired, async (req, res) => {
  try {
    const result = await Notification.findOneAndDelete({ _id: req.params.id, userId: req.user.id })
    if (!result) {
      return res.status(404).json({ error: 'Notification not found' })
    }
    res.json({ message: 'Notification deleted' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
