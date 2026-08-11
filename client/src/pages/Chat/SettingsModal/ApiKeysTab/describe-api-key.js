import { YOLO_SOURCE } from '../../../../constants.js'

export function describeScope(sources) {
  if (!sources || sources.length === 0) return 'All sources'
  if (sources.includes(YOLO_SOURCE)) return 'All sources (YOLO)'

  return sources.join(', ')
}

export function formatLastUsed(value) {
  if (!value) return 'Never used'

  return `Last used ${new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`
}
