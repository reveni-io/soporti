const TIME_FORMAT = { dateStyle: 'medium', timeStyle: 'short' }

export function formatTime(value) {
  const date = new Date(value)

  return isNaN(date) ? '' : date.toLocaleString([], TIME_FORMAT)
}
