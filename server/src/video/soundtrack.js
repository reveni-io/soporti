import { open } from 'node:fs/promises'
import { withTimeout } from './browser.js'
import { VideoProjectError } from './project-error.js'

const CHUNK_FRAMES = 1 << 16
const CHANNELS = 2
const BYTES_PER_SAMPLE = 4
const BYTES_PER_FRAME = CHANNELS * BYTES_PER_SAMPLE
const MIN_SAMPLE_RATE = 8000
const MAX_SAMPLE_RATE = 192_000
const RENDER_TIMEOUT_MS = 300_000

export function planChunks(frames, size = CHUNK_FRAMES) {
  return Array.from({ length: Math.ceil(frames / size) }, (_, index) => {
    const offset = index * size
    return { offset, length: Math.min(size, frames - offset) }
  })
}

export function decodeChunk(base64, { offset, length }) {
  const expected = length * BYTES_PER_FRAME
  const bytes = typeof base64 === 'string' ? Buffer.from(base64, 'base64') : null

  if (bytes?.length === expected) return bytes
  throw new VideoProjectError(
    `__soundtrackChunk(${offset}, ${length}) returned ${bytes ? `${bytes.length} bytes` : typeof base64} instead of ${expected} bytes: it must return base64 of interleaved stereo Float32 samples.`
  )
}

export function validateSoundtrackInfo(info) {
  const { sampleRate, frames } = info ?? {}

  if (!Number.isInteger(sampleRate) || sampleRate < MIN_SAMPLE_RATE || sampleRate > MAX_SAMPLE_RATE) {
    throw new VideoProjectError(`__renderSoundtrack() returned sampleRate ${sampleRate}: use an integer such as 48000.`)
  }
  if (!Number.isInteger(frames) || frames <= 0) {
    throw new VideoProjectError(`__renderSoundtrack() returned frames ${frames}: it must be a positive integer.`)
  }
  return { sampleRate, frames }
}

export function tallySamples(totals, bytes) {
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)

  for (const sample of new Float32Array(copy)) {
    const level = Math.abs(sample)
    if (!Number.isFinite(level)) totals.nonFinite += 1
    else if (level > totals.peak) totals.peak = level
    if (level > 1 && Number.isFinite(level)) totals.clipped += 1
  }
  return totals
}

async function renderOnPage(page) {
  const rendering = page.evaluate(() => globalThis.__renderSoundtrack())
  const info = await withTimeout(rendering, {
    timeoutMs: RENDER_TIMEOUT_MS,
    message: `__renderSoundtrack() did not finish within ${RENDER_TIMEOUT_MS / 1000} s.`,
  })
  return validateSoundtrackInfo(info)
}

export async function readSoundtrack(page, onChunk) {
  const info = await renderOnPage(page)
  const chunks = planChunks(info.frames)

  for (const [index, chunk] of chunks.entries()) {
    const base64 = await page.evaluate(range => globalThis.__soundtrackChunk(range.offset, range.length), chunk)
    await onChunk(decodeChunk(base64, chunk), { done: index + 1, total: chunks.length })
  }
  return info
}

export async function writeSoundtrack({ page, path, onProgress }) {
  const file = await open(path, 'w')
  try {
    return await readSoundtrack(page, async (bytes, progress) => {
      await file.write(bytes)
      onProgress(progress)
    })
  } finally {
    await file.close()
  }
}
