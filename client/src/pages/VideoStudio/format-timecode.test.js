import { describe, it, expect } from 'vitest'
import { formatTimecode } from './format-timecode.js'

describe('formatTimecode', () => {
  it('pads the seconds', () => {
    expect(formatTimecode(6)).toBe('0:06')
  })

  it('carries whole minutes', () => {
    expect(formatTimecode(90)).toBe('1:30')
  })

  it('drops the fraction of a second', () => {
    expect(formatTimecode(12.8)).toBe('0:12')
  })

  it('never goes below zero', () => {
    expect(formatTimecode(-1)).toBe('0:00')
  })
})
