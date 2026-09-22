import mongoose from 'mongoose'

const processedOperationSchema = new mongoose.Schema(
  {
    operationId: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    actionType: { type: String, required: true },
    entityId: String,
    responseData: mongoose.Schema.Types.Mixed,
    processedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

export default mongoose.model('ProcessedOperation', processedOperationSchema)
