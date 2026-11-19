export const JEV_PROJECT_LABELS = {
  github: {
    flag: 'Veto approval',
    badge: 'vetoes approval',
    score: 'Veto when the score is at least',
    badgeAt: 'vetoes at',
    help: 'Tick the answers that should block an approval. Jev never approves: it can only veto.',
    versioned: 'questions, rules, model and min confidence',
  },
  legal: {
    flag: 'Warn Legal',
    badge: 'warns Legal',
    score: 'Warn Legal when the score is at least',
    badgeAt: 'warns Legal at',
    help: 'Tick the answers that should warn Legal. Jev never blocks a reply: Legal has the last word.',
    versioned: 'questions, model and min confidence',
  },
}

export const VERSIONED_SET_FIELDS = ['model', 'minConfidence', 'questions', 'rules']
