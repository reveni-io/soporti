import { describe, it, expect } from 'vitest'
import { parseAvatarStyle } from './avatar-style.js'

describe('parseAvatarStyle', () => {
  it('returns null when no style is sent', () => {
    expect(parseAvatarStyle(undefined)).toEqual({ value: null })
    expect(parseAvatarStyle(null)).toEqual({ value: null })
  })

  it('keeps every known trait the user picked', () => {
    const input = { shape: 'triangle', hue: 0, tone: 'ink', mood: 'sleepy' }

    expect(parseAvatarStyle(input)).toEqual({ value: input })
  })

  it('accepts a partial style and drops unknown keys', () => {
    expect(parseAvatarStyle({ hue: 359, sparkle: true })).toEqual({ value: { hue: 359 } })
    expect(parseAvatarStyle({})).toEqual({ value: {} })
  })

  it.each([
    ['a string', 'cloud', 'The avatar style must be an object.'],
    ['an array', ['cloud'], 'The avatar style must be an object.'],
    [
      'an unknown shape',
      { shape: 'star' },
      'The avatar shape must be one of: round, organic, boxy, capsule, nub, cloud, droplet, hexagon, sun, triangle.',
    ],
    ['an unknown tone', { tone: 'neon' }, 'The avatar tone must be one of: pastel, pale, mid, deep, bright, ink.'],
    [
      'an unknown mood',
      { mood: 'mad' },
      'The avatar mood must be one of: neutral, happy, wink, smug, sleepy, surprised.',
    ],
    ['a negative hue', { hue: -1 }, 'The avatar hue must be a whole number from 0 to 359.'],
    ['a hue past the circle', { hue: 360 }, 'The avatar hue must be a whole number from 0 to 359.'],
    ['a fractional hue', { hue: 12.5 }, 'The avatar hue must be a whole number from 0 to 359.'],
    ['a hue as text', { hue: '120' }, 'The avatar hue must be a whole number from 0 to 359.'],
  ])('rejects %s', (_label, input, error) => {
    expect(parseAvatarStyle(input)).toEqual({ error })
  })
})
