import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeDom } from '../../__tests__/fake-dom.js'

const ASSETS = { 'logo.svg': 'data:image/svg+xml;base64,PHN2Zy8+', 'font.woff2': 'data:font/woff2;base64,AAAA' }

let dom
let R

beforeEach(async () => {
  vi.resetModules()
  dom = installFakeDom({ assets: ASSETS })
  await import('./core.js')
  R = globalThis.R
})

afterEach(() => {
  dom.uninstall()
})

describe('core.js', () => {
  it('exposes window.R and nothing else', () => {
    expect(dom.leakedGlobals()).toEqual(['R'])
    expect(R.W).toBe(1920)
    expect(R.H).toBe(1080)
    expect(R.FPS).toBe(60)
  })

  it('maps every easing from 0 to 1', () => {
    for (const [name, ease] of Object.entries(R.E)) {
      expect(ease(0), name).toBeCloseTo(0, 6)
      expect(ease(1), name).toBeCloseTo(1, 6)
    }
  })

  it('computes easing values like the reference curves', () => {
    expect(R.E.outCubic(0.5)).toBe(0.875)
    expect(R.E.inOutCubic(0.5)).toBe(0.5)
    expect(R.E.inOutExpo(0.25)).toBeCloseTo(0.015625, 6)
    expect(R.E.inOutExpo(0.75)).toBeCloseTo(0.984375, 6)
    expect(R.E.outBack(0.5)).toBeGreaterThan(1)
    expect(R.bezier(0.25, 0.1, 0.25, 1)(0.5)).toBeCloseTo(0.8024, 3)
    expect(R.bezier(0, 0, 1, 1)(0.3)).toBeCloseTo(0.3, 5)
    expect(R.bezier(0.25, 0.1, 0.25, 1)(-1)).toBe(0)
    expect(R.bezier(0.25, 0.1, 0.25, 1)(2)).toBe(1)
  })

  it('clamps, interpolates and measures progress', () => {
    expect(R.clamp(2)).toBe(1)
    expect(R.clamp(-1)).toBe(0)
    expect(R.clamp(5, 0, 10)).toBe(5)
    expect(R.lerp(10, 20, 0.25)).toBe(12.5)
    expect(R.prog(1.5, 1, 2)).toBe(0.5)
    expect(R.prog(3, 1, 2)).toBe(1)
    expect(R.prog(2, 2, 2)).toBe(1)
    expect(R.prog(1, 2, 2)).toBe(0)
    expect(R.loglerp(1, 4, 0.5)).toBeCloseTo(2, 10)
  })

  it('interpolates keyframes with their easing and log fields', () => {
    const keys = [
      { t: 1, x: 0, k: 1 },
      { t: 2, x: 100, k: 4, e: R.E.linear },
      { t: 4, x: 0 },
    ]

    expect(R.keyframes(keys, 0, ['x', 'k'])).toEqual({ x: 0, k: 1 })
    expect(R.keyframes(keys, 1.5, ['x', 'k'])).toEqual({ x: 50, k: 2 })
    expect(R.keyframes(keys, 3, ['x']).x).toBeCloseTo(50, 10)
    expect(R.keyframes(keys, 2.5, ['x']).x).toBeCloseTo(100 - 100 * R.E.inOutCubic(0.25), 10)
    expect(R.keyframes(keys, 9, ['x', 'k'])).toEqual({ x: 0, k: 0 })
  })

  it('fills missing keyframe fields from the previous key', () => {
    expect(R.fillKeys([{ t: 0, x: 5, y: 1 }, { t: 1, x: 7 }, { t: 2 }], ['x', 'y'])).toEqual([
      { t: 0, x: 5, y: 1 },
      { t: 1, x: 7, y: 1 },
      { t: 2, x: 7, y: 1 },
    ])
  })

  it('settles springs at 1 after overshooting', () => {
    const samples = Array.from({ length: 200 }, (_, i) => R.spring(i / 100))

    expect(R.spring(0)).toBe(0)
    expect(Math.max(...samples)).toBeGreaterThan(1)
    expect(R.spring(4)).toBeCloseTo(1, 4)
    expect(R.spring(0.2, 3, 1)).toBeLessThan(1)
    expect(R.spring(4, 3, 1)).toBeCloseTo(1, 6)
  })

  it('generates the same random sequence for the same seed', () => {
    const a = R.rng(42)
    const b = R.rng(42)
    const c = R.rng(43)
    const first = Array.from({ length: 50 }, a)

    expect(first).toEqual(Array.from({ length: 50 }, b))
    expect(first).not.toEqual(Array.from({ length: 50 }, c))
    expect(first.every(v => v >= 0 && v < 1)).toBe(true)
  })

  it('returns deterministic bounded noise', () => {
    const values = Array.from({ length: 100 }, (_, i) => R.vnoise(i * 0.37, 3))

    expect(values).toEqual(Array.from({ length: 100 }, (_, i) => R.vnoise(i * 0.37, 3)))
    expect(values.every(v => v >= -1 && v <= 1)).toBe(true)
    expect(R.hash1(7)).toBe(R.hash1(7))
    expect(R.vnoise(2)).toBeCloseTo(R.hash1(2) * 2 - 1, 10)
  })

  it('fades opacity in, holds it and fades it out', () => {
    const envelope = [1, 2, 3, 4]

    expect(R.opacityOf(0.5, envelope)).toBe(0)
    expect(R.opacityOf(1.5, envelope)).toBe(0.875)
    expect(R.opacityOf(2.5, envelope)).toBe(1)
    expect(R.opacityOf(3.5, envelope)).toBe(0.875)
    expect(R.opacityOf(4.5, envelope)).toBe(0)
  })

  it('blinks a caret after holding it visible', () => {
    expect(R.blink(10.2, 10)).toBe(1)
    expect(R.blink(10.6, 10)).toBe(0)
    expect(R.blink(11.2, 10)).toBe(1)
    expect(R.blink(11.7, 10)).toBe(0)
    expect(R.blink(10.6, 10, 0.2)).toBe(0)
    expect(R.blink(10.67, 10, 0.2)).toBe(1)
  })

  it('formats transforms with rounded values', () => {
    expect(R.tf(10.123, -5.00001, 1.5, 0.1)).toBe('translate(10.12px,-5px) rotate(0.1rad) scale(1.5)')
    expect(R.tf(0.00001, 3)).toBe('translate(0px,3px) rotate(0rad) scale(1)')
  })

  it('creates elements with a class, html and parent', () => {
    const node = R.el('div', 'card', dom.stage, '<b>Hi</b>')
    const bare = R.el('span')

    expect(node.tagName).toBe('DIV')
    expect(node.className).toBe('card')
    expect(node.innerHTML).toBe('<b>Hi</b>')
    expect(dom.stage.children).toContain(node)
    expect(bare.className).toBe('')
    expect(bare.parentNode).toBeNull()
  })

  it('writes styles only when they change', () => {
    const node = R.el('div')
    const writes = []
    Object.defineProperty(node.style, 'opacity', {
      set(value) {
        writes.push(value)
      },
    })

    R.S(node, 'opacity', '0.5')
    R.S(node, 'opacity', '0.5')
    R.S(node, 'opacity', '1')

    expect(writes).toEqual(['0.5', '1'])
  })

  it('caches text, html, classes and visibility writes', () => {
    const node = R.el('div')

    R.setText(node, 'one')
    node.textContent = 'changed elsewhere'
    R.setText(node, 'one')
    expect(node.textContent).toBe('changed elsewhere')
    R.setText(node, 'two')
    expect(node.textContent).toBe('two')

    R.setHTML(node, '<i>a</i>')
    R.setHTML(node, '<i>a</i>')
    expect(node.innerHTML).toBe('<i>a</i>')

    R.cls(node, 'on', true)
    R.cls(node, 'on', true)
    expect(node.className).toBe('on')
    R.cls(node, 'on', false)
    expect(node.className).toBe('')

    R.show(node, false)
    expect(node.style.display).toBe('none')
    R.show(node, true)
    expect(node.style.display).toBe('')
  })

  it('splits html into word spans keeping em, br and code', () => {
    const html = R.splitWords('Meet <b>your</b> <em>agents now</em>.<br><code class="x">a b</code>')

    expect(html).toBe(
      [
        '<span class="wm"><span class="w">Meet</span></span> ',
        '<span class="wm"><span class="w">your</span></span> ',
        '<span class="wm"><span class="w"><em>agents</em></span></span> ',
        '<span class="wm"><span class="w"><em>now</em></span></span>',
        '<span class="wm"><span class="w">.</span></span><br>',
        '<span class="wm"><span class="w"><code class="x">a b</code></span></span>',
      ].join('')
    )
    expect(R.splitWords('')).toBe('')
    expect(R.splitWords('a</em>b')).toBe(
      '<span class="wm"><span class="w">a</span></span><span class="wm"><span class="w">b</span></span>'
    )
  })

  it('returns per-character typing times and registers a key cue for each character', () => {
    const times = R.keyTimes('Hi, you.', 2, { cps: 10, seed: 3 })

    expect(times).toHaveLength(8)
    expect(times[0]).toBe(2)
    expect(times.every((t, i) => i === 0 || t > times[i - 1])).toBe(true)
    expect(times[7]).toBeGreaterThan(2 + 7 * 0.075)
    expect(times[7]).toBeLessThan(2 + 7 * 0.125 * 1.25)
    expect(R.CUES.map(c => c.type)).toEqual(Array(8).fill('key'))
    expect(R.CUES.map(c => c.i)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(R.keyTimes('Hi, you.', 2, { cps: 10, seed: 3 })).toEqual(times)
    expect(R.keyTimes('ab', 0)[1]).toBeGreaterThan(0)
  })

  it('registers cues with rounded times and extra fields', () => {
    R.cue(1.234567, 'pop', { i: 2, t: 99 })

    expect(R.CUES).toEqual([{ i: 2, t: 1.2346, type: 'pop' }])
    expect(() => R.cue(Number.NaN, 'pop')).toThrow('t must be a number')
    expect(() => R.cue(1, '')).toThrow('type must be a non-empty string')
  })

  it('registers captions and rejects invalid ones', () => {
    R.caption('Read me', 1, 3.33333)

    expect(R.CAPTIONS).toEqual([{ text: 'Read me', from: 1, to: 3.3333 }])
    expect(() => R.caption('  ', 1, 2)).toThrow('text must be a string')
    expect(() => R.caption('Late', 3, 2)).toThrow('from < to')
    expect(() => R.caption('Late', 'a', 2)).toThrow('from < to')
  })

  it('returns asset data urls and names the available ones on a miss', () => {
    expect(R.asset('logo.svg')).toBe(ASSETS['logo.svg'])
    expect(() => R.asset('logo.png')).toThrow(
      'R.asset("logo.png"): there is no such asset. Available: logo.svg, font.woff2.'
    )
    expect(() => R.asset('constructor')).toThrow('no such asset')
  })

  it('registers the video exactly once', () => {
    const definition = { duration: 5, init() {}, update() {} }

    R.video(definition)

    expect(R._kit.video).toBe(definition)
    expect(() => R.video(definition)).toThrow('R.video() was called twice')
  })

  it.each([
    [null, 'takes { duration, init, update }'],
    [{ duration: 0, init() {}, update() {} }, 'duration must be seconds > 0'],
    [{ duration: 5, update() {} }, 'init(stage) must be a function'],
    [{ duration: 5, init() {} }, 'update(t) must be a function'],
    [{ duration: 5, init() {}, update() {}, motion: 3 }, 'motion(t) must be a function'],
    [{ duration: 5, init() {}, update() {}, hints: {} }, 'hints must be an array'],
  ])('rejects an invalid video definition %#', (definition, message) => {
    expect(() => R.video(definition)).toThrow(message)
    expect(R._kit.video).toBeNull()
  })

  it('registers the music arrangement exactly once', () => {
    function arrangement() {}

    expect(() => R.music('drums')).toThrow('fn must be a function')
    R.music(arrangement)

    expect(R._kit.music).toBe(arrangement)
    expect(() => R.music(arrangement)).toThrow('R.music() was called twice')
  })

  it('refuses registrations once the runtime sealed the timeline', () => {
    R._kit.sealed = true

    expect(() => R.cue(1, 'pop')).toThrow('R.cue() was called after init()')
    expect(() => R.caption('Hi', 1, 2)).toThrow('R.caption() was called after init()')
    expect(() => R.keyTimes('a', 1)).toThrow('R.cue() was called after init()')
  })

  it('records script errors and unhandled rejections raised while the page loads', () => {
    dom.fire('error', { error: new Error('boom'), lineno: 12 })
    dom.fire('error', { message: 'Script error.' })
    dom.fire('unhandledrejection', { reason: 'nope' })
    dom.fire('unhandledrejection', {})

    expect(R._kit.errors[0]).toMatch(/^Error: boom[\s\S]*\(bundle line 12\)$/)
    expect(R._kit.errors.slice(1)).toEqual(['Script error.', 'nope', 'Unhandled promise rejection'])
  })
})
