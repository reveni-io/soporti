import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./browser.js', async importOriginal => ({
  ...(await importOriginal()),
  launchBrowser: vi.fn(),
  openProjectPage: vi.fn(),
}))

const { launchBrowser, openProjectPage } = await import('./browser.js')
const {
  inspectProject,
  checkCaptions,
  judgeSoundtrack,
  readingSeconds,
  sampleTimes,
  validateCaptions,
  validateCues,
  validateGlobals,
} = await import('./inspect.js')

const PAGE_GLOBALS = [
  '__meta',
  '__CUES__',
  '__captions',
  '__hints',
  '__motion',
  '__seek',
  '__renderSoundtrack',
  '__soundtrackChunk',
]

function encode(samples) {
  return Buffer.from(Float32Array.from(samples).buffer).toString('base64')
}

const SAMPLE_RATE = 8000
const TONE = Array.from({ length: 4 * SAMPLE_RATE * 2 }, (_, index) => Math.sin(index / 10) / 2)
const SILENCE = new Array(TONE.length).fill(0)

function installPage({ samples = TONE, seek = () => {}, captions } = {}) {
  globalThis.__meta = { width: 1920, height: 1080, fps: 30, duration: 4 }
  globalThis.__CUES__ = [
    { t: 0.5, type: 'whoosh' },
    { t: 1, type: 'key' },
    { t: 1.2, type: 'key' },
  ]
  globalThis.__captions = captions ?? [{ text: 'Two boxes, one beep', from: 1, to: 3.5 }]
  globalThis.__seek = seek
  globalThis.__renderSoundtrack = async () => ({ sampleRate: SAMPLE_RATE, frames: samples.length / 2, peak: 1 })
  globalThis.__soundtrackChunk = (offset, length) => encode(samples.slice(offset * 2, (offset + length) * 2))
}

function createSession(overrides = {}) {
  return {
    page: { evaluate: async (fn, arg) => fn(arg) },
    problems: { errors: [], warnings: [] },
    bootError: null,
    ...overrides,
  }
}

function validGlobals(overrides = {}) {
  return {
    meta: { width: 1920, height: 1080, fps: 60, duration: 10 },
    cues: [],
    captions: [],
    hints: null,
    types: { __seek: 'function', __motion: 'undefined', __renderSoundtrack: 'function', __soundtrackChunk: 'function' },
    ...overrides,
  }
}

describe('inspectProject', () => {
  let browser

  beforeEach(() => {
    vi.clearAllMocks()
    browser = { close: vi.fn().mockResolvedValue() }
    launchBrowser.mockResolvedValue(browser)
  })

  afterEach(() => {
    PAGE_GLOBALS.forEach(name => delete globalThis[name])
  })

  it('reports a healthy project with its meta, cues, captions and seek time', async () => {
    const seen = []
    installPage({ seek: t => seen.push(t) })
    openProjectPage.mockResolvedValue(createSession())

    const result = await inspectProject({ html: '<html>', pace: 'relaxed' })

    expect(result).toMatchObject({
      ok: true,
      errors: [],
      warnings: [],
      meta: { width: 1920, height: 1080, fps: 30, duration: 4 },
      captions: [{ text: 'Two boxes, one beep', from: 1, to: 3.5, needed: 2.1, ok: true }],
    })
    expect(result.cues).toHaveLength(3)
    expect(result.seekMs).toBeGreaterThanOrEqual(0)
    expect(seen.slice(0, 4)).toEqual([0, 4, 0.5, 1])
    expect(openProjectPage).toHaveBeenCalledWith(browser, '<html>')
    expect(browser.close).toHaveBeenCalledTimes(1)
  })

  it('stops at the boot error and keeps the page problems', async () => {
    openProjectPage.mockResolvedValue(
      createSession({
        bootError: 'The page failed to boot: no video',
        problems: { errors: ['The page threw Error: x.'], warnings: ['The page logged an error: y'] },
      })
    )

    const result = await inspectProject({ html: '<html>' })

    expect(result).toEqual({
      ok: false,
      errors: ['The page failed to boot: no video', 'The page threw Error: x.'],
      warnings: ['The page logged an error: y'],
      meta: null,
      cues: [],
      captions: [],
      seekMs: null,
    })
  })

  it('reports contract violations without seeking', async () => {
    const seek = vi.fn()
    installPage({ seek })
    delete globalThis.__renderSoundtrack
    openProjectPage.mockResolvedValue(createSession())

    const result = await inspectProject({ html: '<html>' })

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual([
      '__renderSoundtrack is not a function: the kit runtime defines it once R.video() is called.',
    ])
    expect(seek).not.toHaveBeenCalled()
  })

  it('fails on a caption that is too short to read, a throwing seek and a silent soundtrack', async () => {
    installPage({
      samples: SILENCE,
      captions: [{ text: 'one two three four five six', from: 0, to: 1 }],
      seek: t => {
        if (t === 4) throw new RangeError('past the end')
      },
    })
    openProjectPage.mockResolvedValue(createSession())

    const result = await inspectProject({ html: '<html>', pace: 'fast' })

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual([
      '__seek(4) threw RangeError: past the end',
      'The soundtrack is silent (peak 0): make sure R.music() writes notes into the synth buses.',
      'Caption "one two three four five six" is readable for 1 s but needs 2 s at the fast pace: hold it longer or shorten it.',
    ])
    expect(result.captions[0]).toMatchObject({ needed: 2, ok: false })
  })

  it('reports a soundtrack that cannot be read', async () => {
    installPage()
    globalThis.__soundtrackChunk = () => 'AAAA'
    openProjectPage.mockResolvedValue(createSession())

    const result = await inspectProject({ html: '<html>' })

    expect(result.errors).toEqual([
      'The soundtrack could not be read: __soundtrackChunk(0, 32000) returned 3 bytes instead of 256000 bytes: it must return base64 of interleaved stereo Float32 samples.',
    ])
  })

  it('closes the browser when the page cannot be opened', async () => {
    openProjectPage.mockRejectedValue(new Error('Target closed'))

    await expect(inspectProject({ html: '<html>' })).rejects.toThrow('Target closed')
    expect(browser.close).toHaveBeenCalledTimes(1)
  })
})

describe('reading time', () => {
  it('needs half a second plus the words at the pace', () => {
    expect(readingSeconds('Ship faster with Soporti', 'relaxed')).toBe(2.1)
    expect(readingSeconds('  Ship   faster  ', 'normal')).toBeCloseTo(0.5 + 2 / 3)
    expect(readingSeconds('a b c d', 'fast')).toBe(1.5)
    expect(readingSeconds('a b c d e')).toBe(2.5)
  })

  it('marks a caption ok only when it stays on screen long enough', () => {
    expect(
      checkCaptions(
        [
          { text: 'a b c d e', from: 1, to: 3.5 },
          { text: 'a b c d e', from: 1, to: 3.4 },
        ],
        'relaxed'
      )
    ).toEqual([
      { text: 'a b c d e', from: 1, to: 3.5, needed: 2.5, ok: true },
      { text: 'a b c d e', from: 1, to: 3.4, needed: 2.5, ok: false },
    ])
  })
})

describe('validateGlobals', () => {
  it('accepts a complete page', () => {
    expect(
      validateGlobals(validGlobals({ hints: [[0, 1, 4]], types: { ...validGlobals().types, __motion: 'function' } }))
    ).toEqual([])
  })

  it('reports a missing or invalid meta', () => {
    expect(validateGlobals(validGlobals({ meta: null }))).toEqual([
      '__meta is missing: it must be { width, height, fps, duration }.',
    ])
    expect(validateGlobals(validGlobals({ meta: { width: 1920, height: 0, fps: 60, duration: 601 } }))).toEqual([
      '__meta.height must be a positive number, got 0.',
      '__meta.duration is 601: a video lasts between 1 and 600 s.',
    ])
  })

  it('reports invalid hints and motion', () => {
    const globals = validGlobals({ hints: [[0, 1]], types: { ...validGlobals().types, __motion: 'number' } })

    expect(validateGlobals(globals)).toEqual([
      '__hints must be an array of [from, to, subframes] number triples.',
      '__motion must be a function of t when it is defined.',
    ])
  })
})

describe('validateCues', () => {
  it.each([
    [null, '__CUES__ must be an array of { t, type }.'],
    [[{ t: 'x', type: 'beep' }], '__CUES__[0] must be { t, type } with a number t and a non-empty type.'],
    [[{ t: 1, type: '' }], '__CUES__[0] must be { t, type } with a number t and a non-empty type.'],
    [[{ t: 11, type: 'beep' }], 'Cue "beep" at 11 s is outside the video (0 to 10 s).'],
    [
      [
        { t: 2, type: 'a' },
        { t: 1.5, type: 'b' },
      ],
      '__CUES__ are not sorted by t: cue "b" at 1.5 s comes after 2 s.',
    ],
  ])('reports the first problem (%#)', (cues, message) => {
    expect(validateCues(cues, 10)).toEqual([message])
  })
})

describe('validateCaptions', () => {
  it.each([
    [{}, '__captions must be an array of { text, from, to }.'],
    [[{ text: 3, from: 0, to: 1 }], '__captions[0] must be { text, from, to } with a string text and number times.'],
    [
      [{ text: 'Hi', from: 2, to: 1 }],
      'Caption "Hi" runs from 2 s to 1 s: it must start before it ends, inside 0 to 10 s.',
    ],
    [
      [{ text: 'Hi', from: 9, to: 12 }],
      'Caption "Hi" runs from 9 s to 12 s: it must start before it ends, inside 0 to 10 s.',
    ],
  ])('reports the first problem (%#)', (captions, message) => {
    expect(validateCaptions(captions, 10)).toEqual([message])
  })
})

describe('sampleTimes', () => {
  it('seeks the start, the end, the first cue of each type and a spread of instants', () => {
    const times = sampleTimes(10, [
      { t: 1, type: 'key' },
      { t: 2, type: 'key' },
      { t: 3.5, type: 'beep' },
    ])

    expect(times.slice(0, 4)).toEqual([0, 10, 1, 3.5])
    expect(times).toHaveLength(9)
    expect(times.every(t => t >= 0 && t <= 10)).toBe(true)
  })
})

describe('judgeSoundtrack', () => {
  it('flags NaN samples as errors and clipping and a length mismatch as warnings', () => {
    expect(judgeSoundtrack({ sampleRate: 48_000, frames: 48_000, peak: 1.4, nonFinite: 3, clipped: 12 }, 4)).toEqual({
      errors: ['The soundtrack has 3 NaN or infinite samples: look for a division by zero in the music code.'],
      warnings: [
        '12 soundtrack samples go past full scale (peak 1.4): lower the mix.',
        'The soundtrack lasts 1 s but the video lasts 4 s.',
      ],
    })
  })

  it('accepts a clean soundtrack', () => {
    expect(judgeSoundtrack({ sampleRate: 48_000, frames: 192_000, peak: 0.9, nonFinite: 0, clipped: 0 }, 4)).toEqual({
      errors: [],
      warnings: [],
    })
  })
})
