const SHAPES = ['round', 'organic', 'boxy', 'capsule', 'nub', 'cloud', 'droplet', 'hexagon', 'sun', 'triangle']
const TONES = ['pastel', 'pale', 'mid', 'deep', 'bright', 'ink']
const MOODS = ['neutral', 'happy', 'wink', 'smug', 'sleepy', 'surprised']
const MAX_HUE = 359

const NAMED_TRAITS = [
  { key: 'shape', allowed: SHAPES },
  { key: 'tone', allowed: TONES },
  { key: 'mood', allowed: MOODS },
]

function isValidHue(hue) {
  return Number.isInteger(hue) && hue >= 0 && hue <= MAX_HUE
}

function parseNamedTraits(input) {
  const style = {}

  for (const { key, allowed } of NAMED_TRAITS) {
    if (input[key] === undefined) continue
    if (!allowed.includes(input[key])) return { error: `The avatar ${key} must be one of: ${allowed.join(', ')}.` }

    style[key] = input[key]
  }

  return { value: style }
}

export function parseAvatarStyle(input) {
  if (input === undefined || input === null) return { value: null }
  if (typeof input !== 'object' || Array.isArray(input)) return { error: 'The avatar style must be an object.' }

  const named = parseNamedTraits(input)
  if (named.error) return named

  if (input.hue === undefined) return named
  if (!isValidHue(input.hue)) return { error: `The avatar hue must be a whole number from 0 to ${MAX_HUE}.` }

  return { value: { ...named.value, hue: input.hue } }
}
