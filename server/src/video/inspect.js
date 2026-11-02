import { launchBrowser, openProjectPage, withTimeout } from './browser.js'
import { readSoundtrack, tallySamples } from './soundtrack.js'

const WORDS_PER_SECOND = { relaxed: 2.5, normal: 3, fast: 4 }
const DEFAULT_PACE = 'relaxed'
const READING_BASE_SECONDS = 0.5
const MIN_DURATION_SECONDS = 1
const MAX_DURATION_SECONDS = 600
const RANDOM_SEEKS = 5
const GOLDEN_RATIO_FRACTION = 0.6180339887498949
const SEEK_TIMEOUT_MS = 30_000
const LENGTH_TOLERANCE_SECONDS = 0.5
const REQUIRED_FUNCTIONS = ['__seek', '__renderSoundtrack', '__soundtrackChunk']
const FLOAT_EPSILON = 1e-9

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function round(value, decimals) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function seconds(value) {
  return `${round(value, 2)} s`
}

export function readingSeconds(text, pace = DEFAULT_PACE) {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return READING_BASE_SECONDS + words / WORDS_PER_SECOND[pace]
}

export function checkCaptions(captions, pace = DEFAULT_PACE) {
  return captions.map(({ text, from, to }) => {
    const needed = readingSeconds(text, pace)
    return { text, from, to, needed: round(needed, 2), ok: to - from + FLOAT_EPSILON >= needed }
  })
}

function describeShortCaption({ text, from, to, needed }, pace) {
  return `Caption "${text}" is readable for ${seconds(to - from)} but needs ${seconds(needed)} at the ${pace} pace: hold it longer or shorten it.`
}

function validateMeta(meta) {
  if (!meta || typeof meta !== 'object') return ['__meta is missing: it must be { width, height, fps, duration }.']

  const errors = ['width', 'height', 'fps']
    .filter(field => !isFiniteNumber(meta[field]) || meta[field] <= 0)
    .map(field => `__meta.${field} must be a positive number, got ${JSON.stringify(meta[field])}.`)

  if (!isFiniteNumber(meta.duration) || meta.duration < MIN_DURATION_SECONDS || meta.duration > MAX_DURATION_SECONDS) {
    errors.push(
      `__meta.duration is ${JSON.stringify(meta.duration)}: a video lasts between ${MIN_DURATION_SECONDS} and ${MAX_DURATION_SECONDS} s.`
    )
  }
  return errors
}

function validateFunctions(types) {
  return REQUIRED_FUNCTIONS.filter(name => types[name] !== 'function').map(
    name => `${name} is not a function: the kit runtime defines it once R.video() is called.`
  )
}

function findCueProblem(cue, index, { cues, duration }) {
  if (!cue || !isFiniteNumber(cue.t) || typeof cue.type !== 'string' || !cue.type) {
    return `__CUES__[${index}] must be { t, type } with a number t and a non-empty type.`
  }
  if (cue.t < 0 || cue.t > duration) {
    return `Cue "${cue.type}" at ${seconds(cue.t)} is outside the video (0 to ${seconds(duration)}).`
  }
  if (index > 0 && cue.t < cues[index - 1].t) {
    return `__CUES__ are not sorted by t: cue "${cue.type}" at ${seconds(cue.t)} comes after ${seconds(cues[index - 1].t)}.`
  }
  return null
}

export function validateCues(cues, duration) {
  if (!Array.isArray(cues)) return ['__CUES__ must be an array of { t, type }.']

  const problem = cues.map((cue, index) => findCueProblem(cue, index, { cues, duration })).find(Boolean)
  return problem ? [problem] : []
}

function findCaptionProblem(caption, index, duration) {
  const valid =
    caption && typeof caption.text === 'string' && isFiniteNumber(caption.from) && isFiniteNumber(caption.to)
  if (!valid) return `__captions[${index}] must be { text, from, to } with a string text and number times.`
  if (caption.from < 0 || caption.to > duration || caption.from >= caption.to) {
    return `Caption "${caption.text}" runs from ${seconds(caption.from)} to ${seconds(caption.to)}: it must start before it ends, inside 0 to ${seconds(duration)}.`
  }
  return null
}

export function validateCaptions(captions, duration) {
  if (!Array.isArray(captions)) return ['__captions must be an array of { text, from, to }.']

  const problem = captions.map((caption, index) => findCaptionProblem(caption, index, duration)).find(Boolean)
  return problem ? [problem] : []
}

function validateBlur({ hints, types }) {
  const errors = []
  const validHints = hints === null || (Array.isArray(hints) && hints.every(isValidHint))

  if (!validHints) errors.push('__hints must be an array of [from, to, subframes] number triples.')
  if (types.__motion !== 'undefined' && types.__motion !== 'function') {
    errors.push('__motion must be a function of t when it is defined.')
  }
  return errors
}

function isValidHint(hint) {
  return Array.isArray(hint) && hint.length === 3 && hint.every(isFiniteNumber)
}

export function validateGlobals(globals) {
  const metaErrors = validateMeta(globals.meta)
  const duration = metaErrors.length === 0 ? globals.meta.duration : MAX_DURATION_SECONDS

  return [
    ...metaErrors,
    ...validateFunctions(globals.types),
    ...validateCues(globals.cues, duration),
    ...validateCaptions(globals.captions, duration),
    ...validateBlur(globals),
  ]
}

export function sampleTimes(duration, cues) {
  const firstOfEachType = new Map()
  for (const cue of cues) if (!firstOfEachType.has(cue.type)) firstOfEachType.set(cue.type, cue.t)

  const spread = Array.from({ length: RANDOM_SEEKS }, (_, index) => ((index + 1) * GOLDEN_RATIO_FRACTION) % 1)
  const times = [0, duration, ...firstOfEachType.values(), ...spread.map(fraction => fraction * duration)]
  return [...new Set(times.map(time => round(time, 3)))]
}

export function judgeSoundtrack(scan, duration) {
  if (scan.error) return { errors: [`The soundtrack could not be read: ${scan.error}`], warnings: [] }

  const errors = []
  const warnings = []
  const soundSeconds = scan.frames / scan.sampleRate

  if (scan.nonFinite > 0) {
    errors.push(
      `The soundtrack has ${scan.nonFinite} NaN or infinite samples: look for a division by zero in the music code.`
    )
  }
  if (scan.nonFinite === 0 && scan.peak === 0) {
    errors.push('The soundtrack is silent (peak 0): make sure R.music() writes notes into the synth buses.')
  }
  if (scan.clipped > 0) {
    warnings.push(`${scan.clipped} soundtrack samples go past full scale (peak ${round(scan.peak, 2)}): lower the mix.`)
  }
  if (Math.abs(soundSeconds - duration) > LENGTH_TOLERANCE_SECONDS) {
    warnings.push(`The soundtrack lasts ${seconds(soundSeconds)} but the video lasts ${seconds(duration)}.`)
  }
  return { errors, warnings }
}

function readGlobals(page) {
  return page.evaluate(() => ({
    meta: globalThis.__meta ?? null,
    cues: globalThis.__CUES__ ?? null,
    captions: globalThis.__captions ?? null,
    hints: globalThis.__hints ?? null,
    types: {
      __seek: typeof globalThis.__seek,
      __motion: typeof globalThis.__motion,
      __renderSoundtrack: typeof globalThis.__renderSoundtrack,
      __soundtrackChunk: typeof globalThis.__soundtrackChunk,
    },
  }))
}

function timeSeeks(page, times) {
  const timing = page.evaluate(
    instants =>
      instants.map(t => {
        const started = performance.now()
        try {
          globalThis.__seek(t)
          return { t, ms: performance.now() - started }
        } catch (error) {
          return { t, ms: performance.now() - started, error: `${error?.name}: ${error?.message}` }
        }
      }),
    times
  )
  return withTimeout(timing, {
    timeoutMs: SEEK_TIMEOUT_MS,
    message: `__seek did not return within ${SEEK_TIMEOUT_MS / 1000} s: look for an endless loop in update(t).`,
  })
}

async function scanSoundtrack(page) {
  const totals = { peak: 0, nonFinite: 0, clipped: 0 }
  try {
    const { sampleRate, frames } = await readSoundtrack(page, bytes => tallySamples(totals, bytes))
    return { sampleRate, frames, ...totals }
  } catch (error) {
    return { error: error.message }
  }
}

function summarizeSeeks(results) {
  const errors = results
    .filter(result => result.error)
    .map(result => `__seek(${round(result.t, 3)}) threw ${result.error}`)
  const seekMs = round(results.reduce((sum, result) => sum + result.ms, 0) / results.length, 2)
  return { errors, seekMs }
}

function report({ errors, warnings, meta = null, cues = [], captions = [], seekMs = null }) {
  return { ok: errors.length === 0, errors, warnings, meta, cues, captions, seekMs }
}

async function inspectSession(session, pace) {
  if (session.bootError) {
    return report({ errors: [session.bootError, ...session.problems.errors], warnings: session.problems.warnings })
  }

  const globals = await readGlobals(session.page)
  const contractErrors = validateGlobals(globals)
  if (contractErrors.length > 0) {
    return report({ errors: [...contractErrors, ...session.problems.errors], warnings: session.problems.warnings })
  }

  const { meta, cues } = globals
  const seeks = summarizeSeeks(await timeSeeks(session.page, sampleTimes(meta.duration, cues)))
  const soundtrack = judgeSoundtrack(await scanSoundtrack(session.page), meta.duration)
  const captions = checkCaptions(globals.captions, pace)
  const captionErrors = captions.filter(caption => !caption.ok).map(caption => describeShortCaption(caption, pace))

  return report({
    errors: [...seeks.errors, ...soundtrack.errors, ...captionErrors, ...session.problems.errors],
    warnings: [...soundtrack.warnings, ...session.problems.warnings],
    meta,
    cues,
    captions,
    seekMs: seeks.seekMs,
  })
}

export async function inspectProject({ html, pace = DEFAULT_PACE }) {
  const browser = await launchBrowser()
  try {
    const session = await openProjectPage(browser, html)
    return await inspectSession(session, pace)
  } finally {
    await browser.close()
  }
}
