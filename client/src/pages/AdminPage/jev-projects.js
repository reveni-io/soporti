const GUARD_LABELS = {
  flag: 'Warn',
  badge: 'warns',
  score: 'Warn when the score is at least',
  badgeAt: 'warns at',
  help: 'Tick the answers that should raise a warning. A guard never blocks anything: a person has the last word.',
  versioned: 'questions and min confidence',
  description: 'When to use it',
}

export function projectLabels() {
  return GUARD_LABELS
}

export const VERSIONED_SET_FIELDS = ['minConfidence', 'questions']
