import Notification from '../models/Notification.js'
import User from '../models/User.js'

/**
 * Creates a notification for a specific user or all admins
 */
export async function createNotification({ userId, issueId = null, type = 'general', title, message, link = null }) {
  try {
    if (userId === 'admin' || userId === 'all_admins') {
      const admins = await User.find({ role: 'admin' }).select('_id')
      const notifications = admins.map((admin) => ({
        userId: admin._id,
        issueId,
        type,
        title,
        message,
        link: link || '/admin/issues',
      }))
      if (notifications.length > 0) {
        await Notification.insertMany(notifications)
      }
      return
    }

    if (!userId) return

    await Notification.create({
      userId,
      issueId,
      type,
      title,
      message,
      link,
    })
  } catch (err) {
    console.warn('⚠️ Error creating notification:', err.message)
  }
}
