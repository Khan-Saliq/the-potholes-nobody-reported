export type UserRole = 'citizen' | 'admin' | 'contractor'

export type IssueCategory =
  | 'potholes_and_road_damage'
  | 'traffic_signal_malfunction'
  | 'non_functional_streetlights'
  | 'water_leakage'
  | 'garbage_overflow'
  | 'drainage_blockage'
  | 'public_toilet_issue'
  | 'tree_trimming'
  | 'building_safety'
  | 'streetlight_failure'
  | 'other'

export type IssueStatus =
  | 'reported'
  | 'awaiting_assignment'
  | 'under_review'
  | 'assigned'
  | 'accepted'
  | 'repair_in_progress'
  | 'after_photo_submitted'
  | 'ai_verification'
  | 'verified'
  | 'needs_review'
  | 'completed'
  | 'resolved'
  | 'suspicious'
  | 'rejected'
  | 'overdue'

export type ValidationResult = 'valid' | 'suspicious' | 'manipulated' | 'pending'

export interface RoleHistoryEntry {
  previousRole: UserRole
  newRole: UserRole
  changedBy: string
  changedByEmail?: string | null
  reason?: string | null
  timestamp: string
}

export interface ContractorApplication {
  status: 'none' | 'pending' | 'approved' | 'rejected'
  requestedAt?: string | null
  companyName?: string | null
  assignedDepartment?: string | null
  notes?: string | null
}

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  department?: string | null
  companyName?: string | null
  assignedDepartment?: string | null
  contractorRating?: number
  trustScore: number
  verifiedReports: number
  totalReports: number
  createdAt?: string | null
  roleHistory?: RoleHistoryEntry[]
  contractorApplication?: ContractorApplication | null
}

export interface Location {
  lat: number
  lng: number
  address: string
}

export interface FeaturePoint {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface RepairVerificationResult {
  locationStatus?: 'MATCH' | 'MISMATCH' | 'UNAVAILABLE' | null
  locationDistanceMeters?: number | null
  surroundingsStatus?: 'MATCH' | 'PARTIAL MATCH' | 'MISMATCH' | null
  cameraViewStatus?: 'MATCH' | 'PARTIAL MATCH' | 'MISMATCH' | null
  potholeRepairStatus?: 'CONFIRMED' | 'NOT CONFIRMED' | null
  aiAnalysisStatus?: 'VALID' | 'INVALID' | 'NEEDS REVIEW' | null
  gpsDistanceMeters?: number | null
  gpsMatchScore?: number | null
  gpsResult?: 'PASS' | 'FAIL' | 'UNAVAILABLE' | null
  backgroundScore?: number | null
  backgroundResult?: 'HIGH' | 'MEDIUM' | 'LOW' | null
  perspectiveScore?: number | null
  perspectiveResult?: 'HIGH' | 'MEDIUM' | 'LOW' | null
  visualSimilarityScore?: number | null
  overallConfidence?: number | null
  repairEvidenceResult?: 'REPAIRED' | 'NOT_REPAIRED' | 'INCONCLUSIVE' | null
  overallResult?: 'VERIFIED' | 'NEEDS_ADMIN_REVIEW' | 'SUSPICIOUS' | null
  featurePoints?: FeaturePoint[]
  reasons?: string[]
  analysisMethod?: string
}

export interface Issue {
  id: string
  complaintId?: string
  title: string
  description: string
  category: IssueCategory
  severity: number
  status: IssueStatus
  location: Location
  area?: string
  imageUrl?: string
  beforeGps?: { lat: number; lng: number }
  reporterId: string
  reporterName: string
  reporterTrustScore: number
  reportCount: number
  clusterId?: string
  priorityScore: number
  validationResult: ValidationResult
  assignedTo?: string
  contractorId?: string | null
  contractorName?: string | null
  assignedAt?: string | null
  assignedBy?: string | null
  deadline?: string | null
  slaStatus?: 'on_track' | 'approaching' | 'breached'
  responsibleDepartment: string
  
  // Repair evidence & verification
  afterImage?: string | null
  afterGps?: { lat: number; lng: number } | null
  afterSubmittedAt?: string | null
  afterSubmittedBy?: string | null
  verificationResult?: RepairVerificationResult | null
  adminReviewedBy?: string | null
  adminReviewedAt?: string | null
  adminReviewNotes?: string | null
  aiDecisionRecord?: {
    decision: 'AUTO_ACCEPT' | 'AUTO_REJECT' | 'NEEDS_REVIEW' | 'POSSIBLE_DUPLICATE'
    decisionReason: string
    isRoadImage: boolean
    potholeDetected: boolean
    potholeConfidence: number
    imageQuality: string
    suspiciousImage: boolean
    gpsStatus: string
    isDuplicate: boolean
    duplicateDistanceMeters?: number | null
    estimatedSeverity: string
    severityConfidence: number
    severityReason?: string
    processedAt: string
    actionLogs: Array<{
      stage: string
      status: string
      message: string
      timestamp: string
    }>
  } | null

  // Recurring Pothole
  isRecurring?: boolean
  previousComplaintId?: string | null
  previousComplaintCode?: string | null
  recurringDistanceMeters?: number | null
  previousRepairDate?: string | null

  createdAt: string
  updatedAt: string
  votes: number
  timeline?: Array<{
    action: string
    timestamp: string
    performedBy?: string
    role?: string
    previousStatus?: string
    newStatus?: string
    details?: string
  }>
  lastActionAt?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  issueId?: string
  validationResult?: ValidationResult
}

export interface ChatHistoryItem {
  id: string
  role: 'citizen' | 'admin'
  message: string
  response: string
  timestamp: string
  issueId?: string
  validationResult?: ValidationResult
}

export interface Upload {
  id: string
  filename: string
  url: string
  uploaderId: string
  uploaderName: string
  issueId?: string
  createdAt: string
}

export interface AppNotification {
  id: string
  userId: string
  issueId?: string | null
  type: string
  title: string
  message: string
  read: boolean
  link?: string | null
  createdAt: string
  issue?: {
    title: string
    status: IssueStatus
  }
}

export type AdminNotification = AppNotification
export type UserNotification = AppNotification

export interface PriorityWeights {
  severity: number
  reportCount: number
  timeDelay: number
  clusterDensity: number
  trustScore: number
}

export interface ContractorReportSummary {
  contractorName: string
  contractorId: string
  totalAssigned: number
  accepted: number
  repairStarted: number
  repairSubmitted: number
  verified: number
  completed: number
  overdue: number
  completionRate: string
}

export interface ContractorComparisonItem {
  contractorId: string
  contractorName: string
  companyName: string
  assigned: number
  accepted: number
  inProgress: number
  submitted: number
  verified: number
  completed: number
  overdue: number
  completionRate: string
}

export interface DetailedWorkItem {
  id: string
  issueId: string
  complaintId: string
  title: string
  category: string
  location: string
  status: IssueStatus
  contractorName: string
  reportedDate: string | null
  assignedDate: string | null
  acceptedDate: string | null
  repairStartedDate: string | null
  repairSubmittedDate: string | null
  verificationStatus: string
  completedDate: string | null
  deadline: string | null
  completionTimeHours: number | null
  beforePhoto: string | null
  afterPhoto: string | null
  lat: number | null
  lng: number | null
}

export interface ContractorReportResponse {
  summary: ContractorReportSummary
  contractorsComparison: ContractorComparisonItem[]
  detailedIssues: DetailedWorkItem[]
  filters: {
    contractorId: string
    startDate: string
    endDate: string
    status: string
  }
}
