export const TRUST_DELTAS = {
  valid: 5,
  suspicious: -3,
  manipulated: -15,
}

export const DEFAULT_TRUST_SCORE = 50

export const FIELD_TEAMS = ['Sanitation Team A', 'Sanitation Team B', 'Electrical Dept', 'PWD Team', 'Water Board']

export const ISSUE_CATEGORIES = [
  {
    id: 'potholes_and_road_damage',
    label: 'Potholes & Road Damage',
    department: 'Roads & Public Works Department (PWD) / Municipal Roads Department',
  },
]

export const CATEGORY_DEPARTMENTS = ISSUE_CATEGORIES.reduce((map, category) => {
  map[category.id] = category.department
  return map
}, {})

export const ISSUE_STATUSES = [
  { id: 'reported', label: 'Reported' },
  { id: 'assigned', label: 'Assigned to Contractor' },
  { id: 'accepted', label: 'Accepted by Contractor' },
  { id: 'repair_in_progress', label: 'Repair In Progress' },
  { id: 'needs_review', label: 'Needs Admin Review' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'completed', label: 'Completed' },
  { id: 'suspicious', label: 'Suspicious Evidence' },
  { id: 'rejected', label: 'Rejected' },
]

export const VALIDATION_RESULTS = ['valid', 'suspicious', 'manipulated', 'pending']

export const CHAT_SUGGESTIONS = {
  citizen: [
    'What are the most critical areas right now?',
    'How do I report a duplicate issue?',
    'What is a trust score?',
    'Show me common issue types in my area',
  ],
  admin: [
    'Validate this image for morph detection',
    'Summarize high-priority issues today',
    'Which reports have suspicious evidence?',
    'Show cluster density in my region',
  ],
}

export const CHAT_GREETINGS = {
  citizen:
    "Hello! I'm your CivicPulse assistant. I can guide you through reporting, suggest existing issues, and share insights about critical areas.",
  admin:
    'Admin AI Validation Assistant ready. Select an issue, then ask me to validate its image for morph detection. I classify evidence as Valid, Suspicious, or Manipulated.',
}

export const PRIORITY_WEIGHTS = {
  severity: 0.3,
  reportCount: 0.2,
  timeDelay: 0.15,
  clusterDensity: 0.2,
  trustScore: 0.15,
}

export const HIGH_PRIORITY_THRESHOLD = 7

export const DUPLICATE_RADIUS_METERS = 500

export const MORPH_CONFIDENCE = {
  valid: 94,
  suspicious: 72,
  manipulated: 89,
}
