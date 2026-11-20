const GITHUB_LABELS = {
  flag: 'Veto approval',
  badge: 'vetoes approval',
  score: 'Veto when the score is at least',
  badgeAt: 'vetoes at',
  help: 'Tick the answers that should block an approval. Jev never approves: it can only veto.',
  versioned: 'questions, rules, model and min confidence',
  description: 'Set description',
}

const GUARD_LABELS = {
  flag: 'Warn',
  badge: 'warns',
  score: 'Warn when the score is at least',
  badgeAt: 'warns at',
  help: 'Tick the answers that should raise a warning. A guard never blocks anything: a person has the last word.',
  versioned: 'questions, model and min confidence',
  description: 'When to use it',
}

export function projectLabels(id) {
  return id === 'github' ? GITHUB_LABELS : GUARD_LABELS
}

export const VERSIONED_SET_FIELDS = ['model', 'minConfidence', 'questions', 'rules']
