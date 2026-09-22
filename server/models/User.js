import mongoose from 'mongoose'

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['citizen', 'admin', 'contractor'], default: 'citizen' },
    department: { type: String, default: null },
    companyName: { type: String, default: null },
    assignedDepartment: { type: String, default: null },
    contractorRating: { type: Number, default: 5.0 },
    trustScore: { type: Number, default: 50 },
    verifiedReports: { type: Number, default: 0 },
    totalReports: { type: Number, default: 0 },
    roleHistory: [
      {
        previousRole: { type: String, required: true },
        newRole: { type: String, required: true },
        changedBy: { type: String, required: true },
        changedByEmail: { type: String, default: null },
        reason: { type: String, default: null },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    contractorApplication: {
      status: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
      requestedAt: { type: Date, default: null },
      companyName: { type: String, default: null },
      assignedDepartment: { type: String, default: null },
      notes: { type: String, default: null },
    },
  },
  { timestamps: true }
)

export default mongoose.model('User', userSchema)
