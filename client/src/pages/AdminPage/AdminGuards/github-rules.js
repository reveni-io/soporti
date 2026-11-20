export const GITHUB_RULES = [
  {
    id: 'ci',
    label: 'CI status',
    checks: 'Every CI check passed. A pending check holds the approval until the next review.',
  },
  { id: 'findings', label: 'Blocking findings', checks: 'The review found no critical or major issue.' },
  { id: 'spec', label: 'Spec check', checks: 'The spec pass found nothing blocking. PRs without a spec pass it.' },
  { id: 'threads', label: 'Open review threads', checks: 'No review thread on the PR is left unresolved.' },
  { id: 'walkthrough', label: 'Walkthrough', checks: 'The review wrote its walkthrough.' },
  {
    id: 'merge-risk',
    label: 'Max merge risk',
    checks: 'The merge risk of the review is at most the limit.',
    limits: ['Low', 'Medium', 'High'],
  },
  {
    id: 'review-effort',
    label: 'Max review effort',
    checks: 'The estimated review time is at most the limit.',
    limits: [5, 10, 20, 30],
    unit: 'mins',
  },
  {
    id: 'nitpicks',
    label: 'Max nitpicks',
    checks: 'The review left at most this many nitpicks.',
    limits: Array.from({ length: 16 }, (_, count) => count),
  },
  { id: 'denylist', label: 'Denylist', checks: 'No changed file matches the denylist of the repo.' },
]

export const RULE_ROLES = [
  { value: 'veto', help: 'Blocks the approval when Jev’s answer fails it' },
  { value: 'info', help: 'Asked and shown in the review, never blocks' },
]
