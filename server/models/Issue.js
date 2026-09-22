import mongoose from 'mongoose'

const locationSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    address: { type: String, required: true },
  },
  { _id: false }
)

const issueSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: {
      type: String,
      enum: [
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
      ],
      required: true,
    },
    complaintId: { type: String, unique: true, sparse: true },
    severity: { type: Number, min: 1, max: 5, required: true },
    status: {
      type: String,
      enum: [
        'reported',
        'awaiting_assignment',
        'under_review',
        'assigned',
        'accepted',
        'repair_in_progress',
        'after_photo_submitted',
        'ai_verification',
        'verified',
        'needs_review',
        'completed',
        'resolved',
        'suspicious',
        'rejected',
        'overdue',
      ],
      default: 'reported',
    },
    location: { type: locationSchema, required: true },
    geoLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    area: { type: String, default: 'Unknown Area' },
    imageUrl: String,
    beforeGps: {
      lat: Number,
      lng: Number,
    },
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reporterName: { type: String, required: true },
    reporterTrustScore: { type: Number, default: 50 },
    reportCount: { type: Number, default: 1 },
    clusterId: String,
    priorityScore: { type: Number, default: 0 },
    validationResult: {
      type: String,
      enum: ['valid', 'suspicious', 'manipulated', 'pending'],
      default: 'pending',
    },
    assignedTo: String,
    contractorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    contractorName: { type: String, default: null },
    assignedAt: { type: Date, default: null },
    assignedBy: { type: String, default: null },
    deadline: { type: Date, default: null },
    slaStatus: {
      type: String,
      enum: ['on_track', 'approaching', 'breached'],
      default: 'on_track',
    },
    responsibleDepartment: { type: String, default: 'General Municipal Services' },
    
    // Contractor repair evidence & AI verification
    afterImage: { type: String, default: null },
    afterGps: {
      lat: Number,
      lng: Number,
    },
    afterSubmittedAt: { type: Date, default: null },
    afterSubmittedBy: { type: String, default: null },
    verificationResult: {
      gpsDistanceMeters: { type: Number, default: null },
      gpsMatchScore: { type: Number, default: null },
      gpsResult: { type: String, enum: ['PASS', 'FAIL', 'UNAVAILABLE', null], default: null },
      backgroundScore: { type: Number, default: null },
      backgroundResult: { type: String, enum: ['HIGH', 'MEDIUM', 'LOW', null], default: null },
      perspectiveScore: { type: Number, default: null },
      perspectiveResult: { type: String, enum: ['HIGH', 'MEDIUM', 'LOW', null], default: null },
      visualSimilarityScore: { type: Number, default: null },
      repairEvidenceResult: { type: String, enum: ['REPAIRED', 'NOT_REPAIRED', 'INCONCLUSIVE', null], default: null },
      overallResult: { type: String, enum: ['VERIFIED', 'NEEDS_ADMIN_REVIEW', 'SUSPICIOUS', null], default: null },
      featurePoints: [
        {
          x1: Number,
          y1: Number,
          x2: Number,
          y2: Number,
        },
      ],
      reasons: [String],
      analysisMethod: { type: String, default: 'opencv-feature-match' },
    },
    adminReviewedBy: { type: String, default: null },
    adminReviewedAt: { type: Date, default: null },
    adminReviewNotes: { type: String, default: null },

    // Offline Sync & Idempotency Metadata
    operationId: { type: String, unique: true, sparse: true },
    capturedAt: { type: Date, default: null },
    syncedAt: { type: Date, default: null },

    // Recurring pothole detection
    isRecurring: { type: Boolean, default: false },
    previousComplaintId: { type: mongoose.Schema.Types.ObjectId, ref: 'Issue', default: null },
    previousComplaintCode: { type: String, default: null },
    recurringDistanceMeters: { type: Number, default: null },
    previousRepairDate: { type: Date, default: null },

    votes: { type: Number, default: 1 },
    voterIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    timeline: [
      {
        action: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        performedBy: String,
        role: String,
        previousStatus: String,
        newStatus: String,
        details: String,
      },
    ],
    // AI Smart Report Agent Decision Record
    aiDecisionRecord: {
      decision: { type: String, enum: ['AUTO_ACCEPT', 'AUTO_REJECT', 'NEEDS_REVIEW', 'POSSIBLE_DUPLICATE', null], default: null },
      decisionReason: { type: String, default: null },
      isRoadImage: { type: Boolean, default: true },
      potholeDetected: { type: Boolean, default: true },
      potholeConfidence: { type: Number, default: 0.8 },
      imageQuality: { type: String, default: 'GOOD' },
      suspiciousImage: { type: Boolean, default: false },
      gpsStatus: { type: String, default: 'AVAILABLE' },
      isDuplicate: { type: Boolean, default: false },
      duplicateDistanceMeters: { type: Number, default: null },
      estimatedSeverity: { type: String, default: 'MEDIUM' },
      severityConfidence: { type: Number, default: 0.8 },
      severityReason: { type: String, default: null },
      processedAt: { type: Date, default: Date.now },
      actionLogs: [
        {
          stage: String,
          status: String,
          message: String,
          timestamp: { type: Date, default: Date.now },
        },
      ],
    },
    inactiveNotificationSent: { type: Boolean, default: false },
    scheduledForDeletion: { type: Boolean, default: false },
  },
  { timestamps: true }
)

issueSchema.index({ geoLocation: '2dsphere' })
issueSchema.index({ priorityScore: -1 })
issueSchema.index({ status: 1, contractorId: 1 })
issueSchema.index({ reporterId: 1, createdAt: -1 })
issueSchema.index({ status: 1, priorityScore: -1 })
issueSchema.index({ status: 1, createdAt: -1 })
issueSchema.index({ deadline: 1 })

issueSchema.pre('validate', function setGeo(next) {
  if (this.location?.lat != null && this.location?.lng != null) {
    this.geoLocation = {
      type: 'Point',
      coordinates: [this.location.lng, this.location.lat],
    }
  }
  next()
})

export default mongoose.model('Issue', issueSchema)
