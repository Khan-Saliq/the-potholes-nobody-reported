import { Link } from 'react-router-dom'
import { MapPin, Users } from 'lucide-react'
import type { Issue } from '../../types'
import { StatusBadge } from '../ui/StatusBadge'
import { PriorityBar } from '../ui/PriorityBar'
import { Badge } from '../ui/Badge'
import { fixImageUrl } from '../../services/api'

const validationVariant: Record<string, 'green' | 'amber' | 'red' | 'default'> = {
  valid: 'green',
  suspicious: 'amber',
  manipulated: 'red',
  pending: 'default',
}

import { memo } from 'react'

export const IssueCard = memo(function IssueCard({
  issue,
  adminLink,
  delay = 0,
}: {
  issue: Issue
  adminLink?: boolean
  delay?: number
}) {
  const issueId = issue.id || (issue as any)._id
  const to = adminLink ? `/admin/issues/${issueId}` : `/my-issues#${issueId}`

  return (
    <Link
      to={to}
      className="glass-card group block p-5 animate-fade-in-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={issue.status} />
            {issue.validationResult &&
              issue.validationResult !== 'valid' &&
              issue.status !== 'completed' &&
              issue.status !== 'resolved' && (
                <Badge variant={validationVariant[issue.validationResult] || 'default'}>
                  {issue.validationResult === 'pending'
                    ? 'AI Verification Pending'
                    : issue.validationResult === 'suspicious'
                    ? 'AI Suspicious'
                    : issue.validationResult === 'manipulated'
                    ? 'AI Manipulated'
                    : issue.validationResult}
                </Badge>
              )}
          </div>
          <h3 className="mt-2 text-lg font-semibold text-slate-100 transition-colors group-hover:text-cyan-300">
            {issue.title}
          </h3>
        </div>
        {issue.imageUrl && (
          <img
            src={fixImageUrl(issue.imageUrl)}
            alt=""
            className="h-16 w-16 rounded-xl object-cover ring-2 ring-white/10 transition-transform duration-300 group-hover:scale-105 group-hover:ring-cyan-500/30"
          />
        )}
      </div>

      <p className="mt-2 line-clamp-2 text-sm text-slate-400">{issue.description}</p>

      <div className="mt-3 flex items-center gap-1 text-sm text-slate-500">
        <MapPin className="h-4 w-4 shrink-0 text-violet-400" />
        <span className="truncate">{issue.location.address}</span>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1 text-sm text-slate-500">
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4 text-cyan-400" />
            {issue.reportCount} reports
          </div>
          {issue.responsibleDepartment && (
            <div className="text-xs text-slate-500">
              Dept: <span className="text-cyan-300">{issue.responsibleDepartment}</span>
            </div>
          )}
        </div>
        <div className="w-32">
          <PriorityBar score={issue.priorityScore} />
        </div>
      </div>
    </Link>
  )
})
