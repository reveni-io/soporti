import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeDom } from '../../__tests__/fake-dom.js'
import { exampleProjectFixture } from '../__fixtures__/example-project.js'

const SAMPLE_RATE = 48000
const PROJECT = { title: 'Test video', width: 1920, height: 1080, fps: 30 }

let dom

async function loadKit() {
  await import('./core.js')
  await import('./synth.js')
  return globalThis.R
}

async function startRuntime() {
  await import('./runtime.js')
  await vi.waitFor(() => {
    if (!globalThis.__ready && !globalThis.__error) throw new Error('Still booting.')
  })
}

function decodeChunk(base64) {
  return new Float32Array(new Uint8Array(Buffer.from(base64, 'base64')).buffer)
}

function channel(interleaved, index) {
  return interleaved.filter((_, i) => i % 2 === index)
}

function rms(samples, from, to) {
  const slice = samples.slice(Math.round(from * SAMPLE_RATE), Math.round(to * SAMPLE_RATE))
  return Math.sqrt(slice.reduce((sum, v) => sum + v * v, 0) / slice.length)
}

function dataUrls(assets) {
  return Object.fromEntries(
    Object.entries(assets).map(([name, asset]) => {
      return [name, `data:${asset.mimeType};base64,${asset.data.toString('base64')}`]
    })
  )
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  dom.uninstall()
  vi.restoreAllMocks()
})

describe('runtime.js in render mode', () => {
  it('publishes the page globals once fonts, images and init are done', async () => {
    dom = installFakeDom({
      project: PROJECT,
      fonts: [{ family: 'Inter' }],
      assets: { 'a.png': 'data:image/png;base64,AA' },
    })
    const R = await loadKit()
    const calls = []
    R.cue(2, 'pop')
    R.cue(0.5, 'open', { i: 1 })
    R.caption('Second', 3, 5)
    R.caption('First', 1, 4)
    R.video({
      duration: 6,
      hints: [[1, 2, 8]],
      motion: t => t * 10,
      init(stage) {
        calls.push(['init', stage === dom.stage, dom.document.faces[0].loaded])
        R.el('img', null, stage).src = R.asset('a.png')
        R.el('img', null, stage)
      },
      update(t) {
        calls.push(['update', t])
      },
    })
    await startRuntime()

    expect(globalThis.__error).toBeUndefined()
    expect(globalThis.__ready).toBe(true)
    expect(globalThis.__meta).toEqual({ width: 1920, height: 1080, fps: 30, duration: 6 })
    expect(globalThis.__CUES__).toEqual([
      { i: 1, t: 0.5, type: 'open' },
      { t: 2, type: 'pop' },
    ])
    expect(globalThis.__captions).toEqual([
      { text: 'First', from: 1, to: 4 },
      { text: 'Second', from: 3, to: 5 },
    ])
    expect(globalThis.__hints).toEqual([[1, 2, 8]])
    expect(globalThis.__motion(9)).toBe(60)
    expect(calls).toEqual([
      ['init', true, true],
      ['update', 0],
    ])
    expect(dom.stage.style).toMatchObject({
      position: 'absolute',
      width: '1920px',
      height: '1080px',
      overflow: 'hidden',
    })
    expect(dom.document.body.find('kit-player')).toBeNull()
    expect(dom.leakedGlobals().sort()).toEqual(
      [
        'R',
        'SYNTH',
        '__CUES__',
        '__captions',
        '__hints',
        '__meta',
        '__motion',
        '__ready',
        '__renderSoundtrack',
        '__seek',
        '__soundtrackChunk',
      ].sort()
    )
  })

  it('draws any instant purely with __seek, clamped to the duration', async () => {
    dom = installFakeDom({ project: PROJECT })
    const R = await loadKit()
    let box
    R.video({
      duration: 4,
      init(stage) {
        box = R.el('div', 'box', stage)
      },
      update(t) {
        R.S(box, 'opacity', String(R.prog(t, 1, 3)))
        R.setText(box, t.toFixed(2))
      },
    })
    await startRuntime()

    globalThis.__seek(2)
    const first = { ...box.style, text: box.textContent }
    globalThis.__seek(3.5)
    globalThis.__seek(0.25)
    globalThis.__seek(2)

    expect({ ...box.style, text: box.textContent }).toEqual(first)
    globalThis.__seek(10)
    expect(box.textContent).toBe('4.00')
    globalThis.__seek(-3)
    expect(box.textContent).toBe('0.00')
    expect(globalThis.__hints).toBeUndefined()
    expect(globalThis.__motion).toBeUndefined()
  })

  it('refuses cues and captions once init has run', async () => {
    dom = installFakeDom({ project: PROJECT })
    const R = await loadKit()
    R.video({ duration: 2, init() {}, update() {} })
    await startRuntime()

    expect(() => R.cue(1, 'late')).toThrow('R.cue() was called after init()')
    expect(() => R.caption('Late', 1, 2)).toThrow('R.caption() was called after init()')
  })

  it('reports a project that never registers a video', async () => {
    dom = installFakeDom({ project: PROJECT })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await loadKit()
    await startRuntime()

    expect(globalThis.__ready).toBe(false)
    expect(globalThis.__error).toBe('No video was registered: call R.video({ duration, init, update }) exactly once.')
    await expect(globalThis.__renderSoundtrack()).rejects.toThrow('The video has not booted: check __error.')
  })

  it('reports the first script error raised while the project loaded', async () => {
    dom = installFakeDom({ project: PROJECT })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const R = await loadKit()
    dom.fire('error', { error: new TypeError('scenes.js broke'), lineno: 40 })
    R.video({ duration: 2, init() {}, update() {} })
    await startRuntime()

    expect(globalThis.__error).toMatch(/^TypeError: scenes.js broke[\s\S]*\(bundle line 40\)$/)
  })

  it('reports errors thrown by init with their stack', async () => {
    dom = installFakeDom({ project: PROJECT })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const R = await loadKit()
    R.video({
      duration: 2,
      init() {
        throw new Error('missing element')
      },
      update() {},
    })
    await startRuntime()

    expect(globalThis.__error).toMatch(/^Error: missing element\n\s+at /)
  })

  it('reports fonts that fail to load', async () => {
    dom = installFakeDom({ project: PROJECT, fonts: [{ family: 'Brand', weight: '700', fails: true }] })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const R = await loadKit()
    R.video({ duration: 2, init() {}, update() {} })
    await startRuntime()

    expect(globalThis.__error).toBe('The font "Brand" 700 normal failed to load: check its file in assets/.')
  })

  it('reports images that do not come from the assets', async () => {
    dom = installFakeDom({ project: PROJECT })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const R = await loadKit()
    R.video({
      duration: 2,
      init(stage) {
        R.el('img', null, stage).src = `assets/${'a'.repeat(80)}.png`
      },
      update() {},
    })
    await startRuntime()

    expect(globalThis.__error).toBe(
      `The image assets/${'a'.repeat(53)}… failed to load: reference assets with R.asset(name) or url("assets/name").`
    )
  })

  it('renders silence when the project has no music', async () => {
    dom = installFakeDom({ project: PROJECT })
    const R = await loadKit()
    R.video({ duration: 1.5, init() {}, update() {} })
    await startRuntime()

    expect(await globalThis.__renderSoundtrack()).toEqual({ sampleRate: SAMPLE_RATE, frames: 72000, peak: 0 })
    expect(Array.from(decodeChunk(globalThis.__soundtrackChunk(100, 2)))).toEqual([0, 0, 0, 0])
  })

  it('masters the arrangement once against the registered cues', async () => {
    dom = installFakeDom({ project: PROJECT })
    const R = await loadKit()
    const arrangement = vi.fn((S, { cues }) => S.put(S.kick(), S.cueTime(cues, 'hit'), 'drums'))
    R.cue(0.6, 'hit')
    R.music(arrangement)
    R.video({ duration: 1.2, init() {}, update() {} })
    await startRuntime()

    const summary = await globalThis.__renderSoundtrack()
    const again = await globalThis.__renderSoundtrack()
    const left = channel(decodeChunk(globalThis.__soundtrackChunk(0, summary.frames)), 0)

    expect(arrangement).toHaveBeenCalledTimes(1)
    expect(arrangement).toHaveBeenCalledWith(globalThis.SYNTH, {
      cues: [{ t: 0.6, type: 'hit' }],
      duration: 1.2,
      sampleRate: SAMPLE_RATE,
    })
    expect(summary.frames).toBe(1.2 * SAMPLE_RATE)
    expect(summary.peak).toBeGreaterThan(0.1)
    expect(summary.peak).toBeLessThanOrEqual(1)
    expect(again).toEqual(summary)
    expect(left.every(Number.isFinite)).toBe(true)
    expect(rms(left, 0, 0.55)).toBeLessThan(1e-4)
    expect(rms(left, 0.6, 0.75)).toBeGreaterThan(0.1)
  })

  it('encodes soundtrack chunks as interleaved little-endian float32 stereo', async () => {
    dom = installFakeDom({ project: PROJECT })
    const R = await loadKit()
    R.music(S => S.put(S.pop(), 0.01, 'sfx', { pan: -1 }))
    R.video({ duration: 1, init() {}, update() {} })
    await startRuntime()
    expect(() => globalThis.__soundtrackChunk(0, 10)).toThrow('Call __renderSoundtrack() before __soundtrackChunk().')

    await globalThis.__renderSoundtrack()
    const whole = decodeChunk(globalThis.__soundtrackChunk(0, 2000))
    const part = decodeChunk(globalThis.__soundtrackChunk(1000, 200))

    expect(whole).toHaveLength(4000)
    expect(part).toEqual(whole.slice(2000, 2400))
    expect(channel(whole, 1).every(v => v === 0)).toBe(true)
    expect(channel(whole, 0).some(v => Math.abs(v) > 0.01)).toBe(true)
    expect(decodeChunk(globalThis.__soundtrackChunk(SAMPLE_RATE - 10, 100))).toHaveLength(20)
    expect(decodeChunk(globalThis.__soundtrackChunk(-5, 3))).toEqual(whole.slice(0, 6))
    expect(globalThis.__soundtrackChunk(SAMPLE_RATE + 10, 5)).toBe('')
  })

  it('boots the example project and lands its kick and pop on the pop cue', async () => {
    const { files, assets } = exampleProjectFixture
    const project = JSON.parse(files['project.json'])
    dom = installFakeDom({ project, assets: dataUrls(assets) })
    await loadKit()
    for (const path of project.scripts) new Function(files[path])()
    await startRuntime()

    const summary = await globalThis.__renderSoundtrack()
    const pop = globalThis.__CUES__.find(c => c.type === 'pop').t
    const left = channel(decodeChunk(globalThis.__soundtrackChunk(0, summary.frames)), 0)

    expect(globalThis.__error).toBeUndefined()
    expect(globalThis.__CUES__.map(c => c.type)).toEqual(['open', 'pop', 'outro'])
    expect(globalThis.__captions.map(c => c.text)).toEqual(['Made with the video kit', 'Every frame comes from t.'])
    expect(globalThis.__motion(1.6)).toBeGreaterThan(globalThis.__motion(4))
    expect(summary.frames).toBe(7 * SAMPLE_RATE)
    expect(summary.peak).toBeLessThanOrEqual(1)
    expect(rms(left, pop, pop + 0.15)).toBeGreaterThan(2 * rms(left, pop - 0.3, pop - 0.05))
  }, 30000)
})

describe('runtime.js in preview mode', () => {
  it('fits the stage to the window and refits it on resize', async () => {
    dom = installFakeDom({ project: PROJECT, mode: 'preview' })
    const R = await loadKit()
    R.video({ duration: 7, init() {}, update() {} })
    await startRuntime()

    expect(dom.stage.style.transform).toBe(`translate(0px, 0px) scale(${1280 / 1920})`)
    Object.assign(globalThis, { innerWidth: 1920, innerHeight: 1200 })
    dom.fire('resize')
    expect(dom.stage.style.transform).toBe('translate(0px, 60px) scale(1)')
  })

  it('shows its controls, paused at the start', async () => {
    dom = installFakeDom({ project: PROJECT, mode: 'preview' })
    const R = await loadKit()
    R.video({ duration: 7, init() {}, update() {} })
    await startRuntime()
    const root = dom.document.body.find('kit-player')

    expect(root.className).toBe('kit-player')
    expect(root.find('kit-player__big').getAttribute('aria-label')).toBe('Play')
    expect(root.find('kit-player__time').textContent).toBe('0:00 / 0:07')
    expect(root.find('kit-player__scrubber')).toMatchObject({ type: 'range', min: '0', max: '7', value: '0' })
    expect(dom.document.head.children[0].tagName).toBe('STYLE')
  })

  it('plays from a real clock on a click inside the frame and pauses on the next one', async () => {
    dom = installFakeDom({ project: PROJECT, mode: 'preview' })
    const now = vi.spyOn(performance, 'now').mockReturnValue(10_000)
    const R = await loadKit()
    const seen = []
    R.video({ duration: 7, init() {}, update: t => seen.push(t) })
    await startRuntime()
    const root = dom.document.body.find('kit-player')

    root.find('kit-player__big').dispatch('click')
    now.mockReturnValue(11_500)
    dom.runFrame()

    expect(root.className).toBe('kit-player kit-player--playing')
    expect(root.find('kit-player__button').getAttribute('aria-label')).toBe('Pause')
    expect(seen.at(-1)).toBeCloseTo(1.5, 6)
    expect(root.find('kit-player__time').textContent).toBe('0:01 / 0:07')
    expect(root.find('kit-player__scrubber').value).toBe('1.5')

    root.dispatch('click')
    now.mockReturnValue(13_000)
    dom.runFrame()

    expect(root.className).toBe('kit-player')
    expect(seen.at(-1)).toBeCloseTo(1.5, 6)
  })

  it('ignores clicks on the control bar itself', async () => {
    dom = installFakeDom({ project: PROJECT, mode: 'preview' })
    const R = await loadKit()
    R.video({ duration: 7, init() {}, update() {} })
    await startRuntime()
    const root = dom.document.body.find('kit-player')

    root.find('kit-player__bar').dispatch('click')

    expect(root.className).toBe('kit-player')
  })

  it('stops at the end and replays from the start', async () => {
    dom = installFakeDom({ project: PROJECT, mode: 'preview' })
    const now = vi.spyOn(performance, 'now').mockReturnValue(10_000)
    const R = await loadKit()
    const seen = []
    R.video({ duration: 7, init() {}, update: t => seen.push(t) })
    await startRuntime()
    const root = dom.document.body.find('kit-player')

    root.dispatch('click')
    now.mockReturnValue(18_000)
    dom.runFrame()

    expect(seen.at(-1)).toBe(7)
    expect(root.className).toBe('kit-player')
    expect(root.find('kit-player__time').textContent).toBe('0:07 / 0:07')

    root.dispatch('click')
    dom.runFrame()

    expect(seen.at(-1)).toBe(0)
  })

  it('toggles with the space bar and seeks with the arrow keys', async () => {
    dom = installFakeDom({ project: PROJECT, mode: 'preview' })
    const now = vi.spyOn(performance, 'now').mockReturnValue(10_000)
    const R = await loadKit()
    const seen = []
    R.video({ duration: 7, init() {}, update: t => seen.push(t) })
    await startRuntime()
    const root = dom.document.body.find('kit-player')

    const space = dom.fire('keydown', { target: dom.document.body, code: 'Space' })
    now.mockReturnValue(10_500)
    const right = dom.fire('keydown', { target: dom.document.body, code: 'ArrowRight' })

    expect(space.defaultPrevented).toBe(true)
    expect(right.defaultPrevented).toBe(true)
    expect(root.className).toBe('kit-player kit-player--playing')
    expect(seen.at(-1)).toBeCloseTo(1.5, 6)

    dom.fire('keydown', { target: dom.document.body, code: 'ArrowLeft', shiftKey: true })
    expect(seen.at(-1)).toBe(0)

    dom.fire('keydown', { target: dom.document.body, code: 'Space' })
    dom.fire('keydown', { target: dom.document.body, code: 'ArrowRight', shiftKey: true })
    expect(seen.at(-1)).toBe(5)
    expect(root.className).toBe('kit-player')
    expect(dom.fire('keydown', { target: dom.document.body, code: 'KeyA' }).defaultPrevented).toBe(false)
  })

  it('leaves the space bar to a focused button', async () => {
    dom = installFakeDom({ project: PROJECT, mode: 'preview' })
    const R = await loadKit()
    R.video({ duration: 7, init() {}, update() {} })
    await startRuntime()
    const root = dom.document.body.find('kit-player')

    const space = dom.fire('keydown', { target: root.find('kit-player__button'), code: 'Space' })

    expect(space.defaultPrevented).toBe(false)
    expect(root.className).toBe('kit-player')
  })

  it('pauses while scrubbing and resumes from the new position', async () => {
    dom = installFakeDom({ project: PROJECT, mode: 'preview' })
    const now = vi.spyOn(performance, 'now').mockReturnValue(10_000)
    const R = await loadKit()
    const seen = []
    R.video({ duration: 7, init() {}, update: t => seen.push(t) })
    await startRuntime()
    const root = dom.document.body.find('kit-player')
    const scrubber = root.find('kit-player__scrubber')

    root.dispatch('click')
    scrubber.dispatch('pointerdown')
    expect(root.className).toBe('kit-player')

    scrubber.value = '4.25'
    scrubber.dispatch('input')
    expect(seen.at(-1)).toBe(4.25)

    scrubber.dispatch('pointerup')
    scrubber.dispatch('pointercancel')
    now.mockReturnValue(11_000)
    dom.runFrame()

    expect(scrubber.blurred).toBe(true)
    expect(root.className).toBe('kit-player kit-player--playing')
    expect(seen.at(-1)).toBeCloseTo(5.25, 6)
  })

  it('masters the soundtrack in the background once the preview is up', async () => {
    dom = installFakeDom({ project: PROJECT, mode: 'preview' })
    const R = await loadKit()
    const arrangement = vi.fn(S => S.put(S.kick(), 0.5, 'drums'))
    R.music(arrangement)
    R.video({ duration: 1, init() {}, update() {} })
    await startRuntime()

    expect(arrangement).not.toHaveBeenCalled()
    dom.runFrame()
    await vi.waitFor(() => expect(arrangement).toHaveBeenCalledTimes(1))
    expect(dom.audioContexts).toHaveLength(0)
  })

  it('plays the soundtrack through Web Audio after the first click and follows seeks and pauses', async () => {
    dom = installFakeDom({ project: PROJECT, mode: 'preview' })
    const now = vi.spyOn(performance, 'now').mockReturnValue(10_000)
    const R = await loadKit()
    R.music(S => S.put(S.kick(), 0.5, 'drums'))
    R.video({ duration: 2.5, init() {}, update() {} })
    await startRuntime()
    const root = dom.document.body.find('kit-player')

    root.dispatch('click')
    const [context] = dom.audioContexts
    await vi.waitFor(() => expect(context.sources).toHaveLength(1))
    const [first] = context.sources

    expect(context.sampleRate).toBe(SAMPLE_RATE)
    expect(context.state).toBe('running')
    expect(first.started).toEqual({ when: 0, offset: 0 })
    expect(first.connectedTo).toBe(context.destination)
    expect(first.buffer.length).toBe(2.5 * SAMPLE_RATE)
    expect(first.buffer.data[0].some(v => Math.abs(v) > 0.1)).toBe(true)

    now.mockReturnValue(11_000)
    dom.fire('keydown', { target: dom.document.body, code: 'ArrowRight' })

    expect(first.stopped).toBe(true)
    expect(context.sources[1].started).toEqual({ when: 0, offset: 2 })

    root.dispatch('click')

    expect(context.sources[1].stopped).toBe(true)
    expect(context.sources).toHaveLength(2)
    expect(dom.audioContexts).toHaveLength(1)
  })

  it('mutes and unmutes the soundtrack from the sound button', async () => {
    dom = installFakeDom({ project: PROJECT, mode: 'preview' })
    vi.spyOn(performance, 'now').mockReturnValue(10_000)
    const R = await loadKit()
    R.video({ duration: 4, init() {}, update() {} })
    await startRuntime()
    const root = dom.document.body.find('kit-player')
    const sound = root.find('kit-player__bar').children[3]

    root.dispatch('click')
    const [context] = dom.audioContexts
    await vi.waitFor(() => expect(context.sources).toHaveLength(1))
    sound.dispatch('click')

    expect(context.sources[0].stopped).toBe(true)
    expect(sound.getAttribute('title')).toBe('Sound off')
    expect(sound.className).toBe('kit-player__button kit-player__button--muted')
    expect(root.className).toBe('kit-player kit-player--playing')

    sound.dispatch('click')

    expect(sound.getAttribute('title')).toBe('Sound on')
    expect(context.sources).toHaveLength(2)
    expect(context.sources[1].started).toEqual({ when: 0, offset: 0 })
  })

  it('keeps the picture in sync with the audio clock', async () => {
    dom = installFakeDom({ project: PROJECT, mode: 'preview' })
    const now = vi.spyOn(performance, 'now').mockReturnValue(10_000)
    const R = await loadKit()
    const seen = []
    R.video({ duration: 4, init() {}, update: t => seen.push(t) })
    await startRuntime()
    const root = dom.document.body.find('kit-player')

    root.dispatch('click')
    const [context] = dom.audioContexts
    await vi.waitFor(() => expect(context.sources).toHaveLength(1))
    now.mockReturnValue(11_000)
    context.currentTime = 0.5
    dom.runFrame()

    expect(seen.at(-1)).toBe(0.5)

    now.mockReturnValue(11_500)
    context.currentTime = 1.02
    dom.runFrame()

    expect(seen.at(-1)).toBeCloseTo(1, 6)
  })

  it('reports a failing arrangement on the sound button', async () => {
    dom = installFakeDom({ project: PROJECT, mode: 'preview' })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const R = await loadKit()
    R.music(() => {
      throw new Error('bad arrangement')
    })
    R.video({ duration: 2, init() {}, update() {} })
    await startRuntime()
    const root = dom.document.body.find('kit-player')
    const sound = root.find('kit-player__bar').children[3]

    root.dispatch('click')

    await vi.waitFor(() => expect(sound.getAttribute('title')).toBe('The soundtrack failed: bad arrangement'))
    expect(dom.audioContexts[0].sources).toHaveLength(0)
  })

  it('stops and shows the error when update throws', async () => {
    dom = installFakeDom({ project: PROJECT, mode: 'preview' })
    const now = vi.spyOn(performance, 'now').mockReturnValue(10_000)
    const R = await loadKit()
    R.video({
      duration: 4,
      init() {},
      update(t) {
        if (t > 1) throw new Error('update broke')
      },
    })
    await startRuntime()
    const root = dom.document.body.find('kit-player')

    root.dispatch('click')
    now.mockReturnValue(12_000)
    dom.runFrame()

    expect(root.className).toBe('kit-player')
    expect(root.find('kit-player__error').textContent).toMatch(/^Error: update broke/)
    expect(dom.runFrame()).toBe(0)
  })

  it('shows boot errors over the frame', async () => {
    dom = installFakeDom({ project: PROJECT, mode: 'preview' })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await loadKit()
    await startRuntime()

    expect(dom.document.body.find('kit-player__error').textContent).toBe(
      'No video was registered: call R.video({ duration, init, update }) exactly once.'
    )
    expect(dom.document.head.children[0].tagName).toBe('STYLE')
  })
})
