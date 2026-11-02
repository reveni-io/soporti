const SECONDS_PER_MINUTE = 60

export function formatTimecode(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE)

  return `${minutes}:${String(seconds % SECONDS_PER_MINUTE).padStart(2, '0')}`
}
