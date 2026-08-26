const TICK_SCALES = [1, 0.68, 0.44, 0.25]
const TICK_OPACITIES = [1, 0.6, 0.45, 0.35]

export function progressAt(tops, readingLine) {
  if (tops.length === 0) return 0

  let index = 0
  while (index + 1 < tops.length && tops[index + 1] <= readingLine) index += 1

  if (index === tops.length - 1) return index

  return index + clamp((readingLine - tops[index]) / (tops[index + 1] - tops[index]), 0, 1)
}

export function readingLineAt(scrollTop, scrollHeight, clientHeight) {
  const scrollable = scrollHeight - clientHeight

  if (scrollable <= 0) return 0

  return clamp(scrollTop / scrollable, 0, 1) * clientHeight
}

export function tickScale(distance) {
  return falloff(TICK_SCALES, distance)
}

export function tickOpacity(distance) {
  return falloff(TICK_OPACITIES, distance)
}

function falloff(steps, distance) {
  const last = steps.length - 1
  const bounded = clamp(distance, 0, last)
  const lower = Math.floor(bounded)

  if (lower === last) return steps[last]

  return steps[lower] + (steps[lower + 1] - steps[lower]) * (bounded - lower)
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}
