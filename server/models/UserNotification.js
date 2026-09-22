import mongoose from 'mongoose'

const userNotificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    issueId: { type: mongoose.Schema.Types.ObjectId, ref: 'Issue', required: true },
    type: { type: String, enum: ['status_update', 'validation_update'], required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
)

userNotificationSchema.index({ userId: 1, createdAt: -1 })
userNotificationSchema.index({ userId: 1, read: 1 })

export default mongoose.model('UserNotification', userNotificationSchema)
