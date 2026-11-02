import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeDom } from '../../__tests__/fake-dom.js'

const SAMPLE_RATE = 48000
const MIX_RATE = 8000

let dom
let S

function rms(samples, from, to, rate = SAMPLE_RATE) {
  const start = Math.round(from * rate)
  const end = Math.round(to * rate)
  let sum = 0
  for (let i = start; i < end; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / (end - start))
}

function peak(samples) {
  return samples.reduce((max, v) => Math.max(max, Math.abs(v)), 0)
}

function sine(frequency, seconds) {
  const buffer = S.buf(seconds)
  for (let k = 0; k < buffer.length; k++) buffer[k] = Math.sin((S.TAU * frequency * k) / SAMPLE_RATE)
  return buffer
}

function isFinite(samples) {
  return samples.every(Number.isFinite)
}

beforeEach(async () => {
  vi.resetModules()
  dom = installFakeDom()
  await import('./core.js')
  await import('./synth.js')
  S = globalThis.SYNTH
})

afterEach(() => {
  dom.uninstall()
})

describe('synth.js', () => {
  it('exposes window.SYNTH next to window.R and nothing else', () => {
    expect(dom.leakedGlobals().sort()).toEqual(['R', 'SYNTH'])
    expect(S.BUSES).toEqual(['drums', 'bass', 'pad', 'lead', 'sfx'])
  })

  it.each([
    ['kick', () => S.kick(), 0.55],
    ['clap', () => S.clap(), 0.4],
    ['hat', () => S.hat(), 0.034 * 7],
    ['snare', () => S.snare(), 0.3],
    ['crash', () => S.crash(1), 1],
    ['boom', () => S.boom(), 2.2],
    ['bassNote', () => S.bassNote(40, 0.5), 0.55],
    ['pluck', () => S.pluck(64), 0.7],
    ['bell', () => S.bell(76, 1), 1],
    ['riser', () => S.riser(1), 1],
    ['blip', () => S.blip(), 0.07],
    ['click', () => S.click(), 0.03],
    ['key', () => S.key(), 0.06],
    ['pop', () => S.pop(), 0.18],
    ['thump', () => S.thump(), 0.22],
    ['sweep', () => S.sweep(300, 1500, 0.3), 0.3],
    ['air', () => S.air(0.5), 0.5],
  ])('renders a finite, audible %s of the requested length', (_name, render, seconds) => {
    const buffer = render()

    expect(buffer).toBeInstanceOf(Float32Array)
    expect(buffer.length).toBe(Math.floor(seconds * SAMPLE_RATE))
    expect(isFinite(buffer)).toBe(true)
    expect(peak(buffer)).toBeGreaterThan(0.01)
  })

  it('renders stereo pads and whooshes', () => {
    const pad = S.padChord([60, 64, 67], 1, { release: 0.5, width: 1.2 })
    const whoosh = S.whoosh(0.6, -1)

    expect(pad.L.length).toBe(1.5 * SAMPLE_RATE)
    expect(whoosh.R.length).toBe(0.6 * SAMPLE_RATE)
    for (const channel of [pad.L, pad.R, whoosh.L, whoosh.R]) {
      expect(isFinite(channel)).toBe(true)
      expect(peak(channel)).toBeGreaterThan(0.01)
    }
    expect(rms(whoosh.L, 0, 0.2)).toBeLessThan(rms(whoosh.R, 0, 0.2))
  })

  it('converts midi notes to frequencies', () => {
    expect(S.mtof(69)).toBe(440)
    expect(S.mtof(81)).toBe(880)
  })

  it('filters frequencies out with biquads', () => {
    const high = S.filt(sine(8000, 0.5), 'lp', 500)
    const low = S.filt(sine(60, 0.5), 'hp', 2000)
    const inBand = S.filt(sine(1000, 0.5), 'bp', 1000, 1)
    const swept = S.filt(sine(8000, 0.5), 'lp', t => 200 + t * 100)

    expect(rms(high, 0.25, 0.5)).toBeLessThan(0.01)
    expect(rms(low, 0.25, 0.5)).toBeLessThan(0.01)
    expect(rms(inBand, 0.25, 0.5)).toBeGreaterThan(0.6)
    expect(rms(swept, 0.25, 0.5)).toBeLessThan(0.01)
    expect(() => S.filt(sine(100, 0.1), 'notch', 100)).toThrow('type must be one of lp, hp, bp')
  })

  it('reverses buffers with a short fade-in', () => {
    expect(Array.from(S.reversed(Float32Array.from([1, 2, 3, 4]), 0))).toEqual([4, 3, 2, 1])
    expect(S.reversed(new Float32Array(100).fill(1), 0.001)[0]).toBe(0)
  })

  it('corrects saw discontinuities with polyBLEP only near the wrap', () => {
    expect(S.polyblep(0.5, 0.01)).toBe(0)
    expect(S.polyblep(0.001, 0.01)).toBeLessThan(0)
    expect(S.polyblep(0.999, 0.01)).toBeGreaterThan(0)
  })

  it('pans with constant power', () => {
    const [left, right] = S.panGains(0)

    expect(left).toBeCloseTo(1, 10)
    expect(right).toBeCloseTo(1, 10)
    expect(S.panGains(-3)[1]).toBeCloseTo(0, 10)
  })

  it('locks a whole number of bars between two times', () => {
    const grid = S.tempo({ from: 2, to: 12, bar: 2.4 })

    expect(grid).toMatchObject({ from: 2, bars: 4, bar: 2.5, beat: 0.625, bpm: 96 })
    expect(grid.at(1)).toBe(4.5)
    expect(grid.at(1, 2)).toBe(5.75)
    expect(S.tempo({ from: 0, to: 1 })).toMatchObject({ bars: 1, bar: 1, beat: 0.25 })
    expect(S.tempo({ to: 5, bar: 2.5 })).toMatchObject({ from: 0, bars: 2, bar: 2.5 })
  })

  it('keeps a fixed tempo from a bpm', () => {
    const grid = S.tempo({ bpm: 120, from: 1, beats: 3 })

    expect(grid).toMatchObject({ beat: 0.5, bar: 1.5, bpm: 120, bars: null })
    expect(grid.at(2, 1)).toBe(4.5)
    expect(() => S.tempo({ from: 3, to: 3 })).toThrow('SYNTH.tempo()')
  })

  it('finds cue times by type and order', () => {
    const cues = [
      { t: 1, type: 'hit' },
      { t: 2, type: 'pop' },
      { t: 3, type: 'hit' },
    ]

    expect(S.cueTime(cues, 'hit')).toBe(1)
    expect(S.cueTime(cues, 'hit', 1)).toBe(3)
    expect(() => S.cueTime(cues, 'impact')).toThrow('there is no "impact" cue #0')
  })

  it('only mixes inside an arrangement', () => {
    expect(() => S.put(S.pop(), 0, 'sfx')).toThrow('SYNTH.put() only works inside the R.music() arrangement.')
    expect(() => S.gap(1, 2)).toThrow('SYNTH.gap() only works inside')
    expect(() => S.master()).toThrow('SYNTH.master() only works inside')

    S.begin({ duration: 1, sampleRate: SAMPLE_RATE })

    expect(() => S.put(S.pop(), 0, 'vocals')).toThrow('unknown bus "vocals"')
  })

  it('masters a soundtrack of exactly duration × sample rate finite samples', () => {
    S.begin({ duration: 3, sampleRate: MIX_RATE })
    S.put(S.padChord([50, 57, 62], 2.5), 0, 'pad', { gain: 0.5, verb: 0.4, dly: 0.2 })
    S.put(S.kick(), 1, 'drums')
    S.put(S.whoosh(), 2, 'sfx', { pan: 0.5 })
    S.put(S.crash(), -0.5, 'drums')
    S.put(S.bell(81), 2.9, 'lead', { dly: 0.3 })
    const result = S.master()

    expect(result.sampleRate).toBe(MIX_RATE)
    expect(result.left.length).toBe(3 * MIX_RATE)
    expect(result.right.length).toBe(3 * MIX_RATE)
    expect(isFinite(result.left) && isFinite(result.right)).toBe(true)
    expect(result.peak).toBeLessThanOrEqual(1)
    expect(result.peak).toBe(Math.max(peak(result.left), peak(result.right)))
    expect(Math.abs(result.left.at(-1))).toBeLessThan(1e-3)
  })

  it('lands a kick at its time', () => {
    S.begin({ duration: 2, sampleRate: MIX_RATE })
    S.put(S.kick(), 1, 'drums')
    const { left } = S.master()

    expect(rms(left, 0, 0.95, MIX_RATE)).toBeLessThan(1e-4)
    expect(rms(left, 1, 1.15, MIX_RATE)).toBeGreaterThan(0.1)
  })

  it('ducks the pad after each kick unless told not to', () => {
    function padAfterKick(kickOptions) {
      S.begin({ duration: 2, sampleRate: MIX_RATE })
      S.put(S.padChord([57, 61, 64], 2, { attack: 0.01 }), 0, 'pad', { gain: 0.5 })
      S.put(S.kick(), 1, 'drums', kickOptions)
      const { left } = S.master()
      return { before: rms(left, 0.8, 0.98, MIX_RATE), after: rms(left, 1.01, 1.08, MIX_RATE) }
    }

    const ducked = padAfterKick({ gain: 0 })
    const steady = padAfterKick({ gain: 0, duck: false })

    expect(ducked.after / ducked.before / (steady.after / steady.before)).toBeLessThan(0.7)
  })

  it('cuts the dry mix during a gap', () => {
    S.begin({ duration: 3, sampleRate: MIX_RATE })
    S.put(S.padChord([57, 61, 64], 3, { attack: 0.01 }), 0, 'pad', { gain: 0.5, verb: 0.3 })
    S.gap(1.5, 2)
    const { left } = S.master()

    expect(rms(left, 1.6, 1.95, MIX_RATE) / rms(left, 1, 1.4, MIX_RATE)).toBeLessThan(0.3)
  })

  it('keeps a hard-left sound out of the right channel', () => {
    S.begin({ duration: 1, sampleRate: MIX_RATE })
    S.put(S.pop(), 0.2, 'sfx', { pan: -1 })
    const { left, right } = S.master()

    expect(peak(left)).toBeGreaterThan(0.1)
    expect(peak(right)).toBe(0)
  })

  it('renders silence when nothing was put', () => {
    S.begin({ duration: 1, sampleRate: MIX_RATE })
    const result = S.master()

    expect(result.peak).toBe(0)
    expect(result.left.every(v => v === 0)).toBe(true)
  })

  it('renders the same arrangement identically every time', () => {
    function render() {
      S.begin({ duration: 1, sampleRate: MIX_RATE })
      S.put(S.hat(), 0.1, 'drums')
      S.put(S.riser(0.5), 0.2, 'sfx', { verb: 0.3 })
      S.put(Float32Array.from([S.rand(), S.noise()]), 0.9, 'sfx')
      return S.master()
    }

    expect(render().left).toEqual(render().left)
  })
})
