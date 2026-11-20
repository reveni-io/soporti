import { matchPath } from 'react-router-dom'
import { ROUTES } from './constants.js'

const PAGE_GROUPS = [
  { key: 'chat', patterns: [ROUTES.CHAT, ROUTES.BOTS, ROUTES.BOT] },
  { key: 'analytics', patterns: [ROUTES.ANALYTICS, ROUTES.ANALYTICS_DASHBOARD] },
  { key: 'admin', patterns: [`${ROUTES.ADMIN}/*`] },
]

function matchesAny(patterns, pathname) {
  return patterns.some(pattern => matchPath(pattern, pathname))
}

export function pageKey(pathname) {
  const group = PAGE_GROUPS.find(candidate => matchesAny(candidate.patterns, pathname))

  return group ? group.key : pathname
}
