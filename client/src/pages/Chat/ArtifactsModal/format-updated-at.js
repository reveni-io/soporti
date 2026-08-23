export function formatUpdatedAt(value) {
  if (!value) return 'Unknown date'

  return `Updated ${new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`
}
