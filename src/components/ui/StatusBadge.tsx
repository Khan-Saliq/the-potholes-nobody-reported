import { useConfig } from '../../context/ConfigContext'
import type { IssueStatus } from '../../types'
import { Badge } from './Badge'

const statusVariant: Record<IssueStatus, 'amber' | 'blue' | 'green' | 'red' | 'teal'> = {
  reported: 'amber',
  awaiting_assignment: 'amber',
  under_review: 'amber',
  assigned: 'blue',
  accepted: 'blue',
  repair_in_progress: 'amber',
  after_photo_submitted: 'teal',
  ai_verification: 'teal',
  verified: 'green',
  needs_review: 'amber',
  completed: 'green',
  resolved: 'green',
  suspicious: 'red',
  rejected: 'red',
  overdue: 'red',
}

const statusTextOverrides: Partial<Record<IssueStatus, string>> = {
  reported: 'Reported',
  awaiting_assignment: 'Awaiting Assignment',
  assigned: 'Assigned',
  accepted: 'Accepted',
  repair_in_progress: 'Repair In Progress',
  ai_verification: 'AI Verifying',
  needs_review: 'Needs Review',
  completed: 'Completed',
  suspicious: 'Suspicious',
  rejected: 'Rejected',
  overdue: 'OVERDUE',
}

export function StatusBadge({ status }: { status: IssueStatus }) {
  const { config } = useConfig()
  const label =
    statusTextOverrides[status] ||
    config?.statuses.find((s) => s.id === status)?.label ||
    status.replace('_', ' ').toUpperCase()

  return <Badge variant={statusVariant[status] || 'amber'}>{label}</Badge>
}
