const MS_PER_MINUTE = 60_000
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24
const DAY_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
const EXACT_TIME_OPTIONS = { dateStyle: 'medium', timeStyle: 'short' }

export function describeDataAge(fetchedAt, now) {
  const fetched = new Date(fetchedAt)
  const minutes = Math.floor((now - fetched) / MS_PER_MINUTE)
  const hours = Math.floor(minutes / MINUTES_PER_HOUR)

  if (minutes < 1) return 'Updated just now'
  if (hours < 1) return `Updated ${minutes} min ago`
  if (hours < HOURS_PER_DAY) return `Updated ${hours} h ago`

  return `Updated ${DAY_FORMAT.format(fetched)}`
}

export function formatExactTime(fetchedAt) {
  return new Date(fetchedAt).toLocaleString([], EXACT_TIME_OPTIONS)
}
