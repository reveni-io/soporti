import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { launchBrowser, openProjectPage, withTimeout } from './browser.js'
import { spawnFfmpeg } from './ffmpeg.js'

const DITHER_SIZE = 1 << 18
const DITHER_MASK = DITHER_SIZE - 1
const DITHER_SEED = 987654321
const FRAME_DITHER_STRIDE = 104729
const RGB_CHANNELS = 3
const CAPTURE_TIMEOUT_MS = 30_000
const TERMINATED_EXIT_CODE = 143
const DECODER_ARGS = [
  '-loglevel',
  'error',
  '-f',
  'image2pipe',
  '-c:v',
  'png',
  '-i',
  '-',
  '-fps_mode',
  'passthrough',
  '-f',
  'rawvideo',
  '-pix_fmt',
  'rgb24',
  '-',
]

function createXorshift(seed) {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state >>>= 0
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state / 4294967296
  }
}

function createDitherTable() {
  const next = createXorshift(DITHER_SEED)
  return Float32Array.from({ length: DITHER_SIZE }, () => next())
}

const DITHER = createDitherTable()

export function subframeTimes({ frame, n }, { fps, shutter }) {
  const center = frame / fps
  if (n === 1) return [center]
  return Array.from({ length: n }, (_, k) => Math.max(0, center + ((k + 0.5) / n - 0.5) * (shutter / fps)))
}

export function finishFrame(sums, { n, frame }) {
  const out = Buffer.allocUnsafe(sums.length)
  const scale = 1 / n
  const start = (frame * FRAME_DITHER_STRIDE) & DITHER_MASK

  for (let i = 0; i < sums.length; i++) out[i] = sums[i] * scale + DITHER[(start + i) & DITHER_MASK]
  return out
}

function addBytes(sums, at, { bytes, from, length }) {
  for (let i = 0; i < length; i++) sums[at + i] += bytes[from + i]
}

export function createBlender({ width, height, frames, emit }) {
  const frameBytes = width * height * RGB_CHANNELS
  const sums = new Uint32Array(frameBytes)
  const state = { position: 0, subframe: 0, index: 0, overflow: false }

  function completeSubframe() {
    const item = frames[state.index]
    state.position = 0
    state.subframe += 1
    if (state.subframe < item.n) return

    emit(finishFrame(sums, item), item)
    sums.fill(0)
    state.subframe = 0
    state.index += 1
  }

  function push(bytes) {
    let from = 0
    while (from < bytes.length && state.index < frames.length) {
      const length = Math.min(bytes.length - from, frameBytes - state.position)
      addBytes(sums, state.position, { bytes, from, length })
      from += length
      state.position += length
      if (state.position === frameBytes) completeSubframe()
    }
    if (from < bytes.length) state.overflow = true
  }

  function isComplete() {
    return state.index === frames.length && state.position === 0 && !state.overflow
  }

  return { push, isComplete }
}

export function encoderArgs({ width, height, fps, crf }, out) {
  return [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-s',
    `${width}x${height}`,
    '-r',
    String(fps),
    '-i',
    '-',
    '-vf',
    'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    String(crf),
    '-tune',
    'animation',
    '-colorspace',
    'bt709',
    '-color_primaries',
    'bt709',
    '-color_trc',
    'bt709',
    '-color_range',
    'tv',
    out,
  ]
}

function writeTo(stream, bytes) {
  if (stream.write(bytes)) return Promise.resolve()
  return new Promise(resolve => stream.once('drain', resolve))
}

async function captureSubframe(session, t) {
  const seeking = session.page.evaluate(instant => globalThis.__seek(instant), t)
  try {
    await withTimeout(seeking, { timeoutMs: CAPTURE_TIMEOUT_MS, message: '__seek did not return in time' })
  } catch (error) {
    throw new Error(`Seeking to ${t.toFixed(3)} s failed: ${error.message}`, { cause: error })
  }

  const { data } = await session.cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true })
  return Buffer.from(data, 'base64')
}

async function captureFrames({ session, job, frames, decoder }) {
  for (const item of frames) {
    for (const t of subframeTimes(item, job)) await writeTo(decoder.child.stdin, await captureSubframe(session, t))
  }
  decoder.child.stdin.end()
}

function failOnEarlyExit(encoder) {
  return encoder.done.then(() => {
    throw new Error('ffmpeg stopped encoding before the chunk was complete.')
  })
}

function forwardFrames({ encoder, decoder, onFrame }) {
  return (bytes, item) => {
    onFrame(item.n)
    if (encoder.child.stdin.write(bytes)) return
    decoder.child.stdout.pause()
    encoder.child.stdin.once('drain', () => decoder.child.stdout.resume())
  }
}

async function encodeChunk({ session, job, chunk, encoder, decoder, onFrame }) {
  const emit = forwardFrames({ encoder, decoder, onFrame })
  const blender = createBlender({ width: job.width, height: job.height, frames: chunk.frames, emit })
  decoder.child.stdout.on('data', bytes => blender.push(bytes))

  const decoding = Promise.all([captureFrames({ session, job, frames: chunk.frames, decoder }), decoder.done])
  await Promise.race([decoding, failOnEarlyExit(encoder)])
  if (!blender.isComplete()) throw new Error('ffmpeg decoded a different number of screenshots than were captured.')

  encoder.child.stdin.end()
  await encoder.done
}

export async function renderChunk({ session, job, chunk, onFrame }) {
  const encoder = spawnFfmpeg({ ffmpegPath: job.ffmpegPath, args: encoderArgs(job, chunk.out) })
  const decoder = spawnFfmpeg({ ffmpegPath: job.ffmpegPath, args: DECODER_ARGS })
  const children = [encoder.child, decoder.child]

  children.forEach(child => session.processes.add(child))
  try {
    await encodeChunk({ session, job, chunk, encoder, decoder, onFrame })
  } finally {
    children.forEach(child => {
      session.processes.delete(child)
      child.kill('SIGKILL')
    })
  }
}

function send(channel, message) {
  return new Promise(resolve => channel.send(message, () => resolve()))
}

async function shutdown(session, { channel, code }) {
  session.stopping = true
  session.processes.forEach(child => child.kill('SIGKILL'))
  await session.browser?.close().catch(() => {})
  channel.exit(code)
}

async function fail(session, { channel, error }) {
  if (session.stopping) return

  console.error('Video render worker failed:', error)
  await send(channel, { type: 'error', message: error.message })
  await shutdown(session, { channel, code: 1 })
}

async function bootWorker(session, jobPath) {
  session.job = JSON.parse(await readFile(jobPath, 'utf8'))
  session.browser = await launchBrowser()

  const html = await readFile(session.job.htmlPath, 'utf8')
  const { page, context, bootError } = await openProjectPage(session.browser, html)
  if (bootError) throw new Error(bootError)

  session.page = page
  session.cdp = await context.newCDPSession(page)
}

async function handleMessage(session, { channel, message }) {
  if (message.type === 'exit') return shutdown(session, { channel, code: 0 })

  try {
    const chunk = session.job.chunks[message.index]
    await renderChunk({ session, job: session.job, chunk, onFrame: cost => channel.send({ type: 'frame', cost }) })
    channel.send({ type: 'done', index: message.index })
  } catch (error) {
    await fail(session, { channel, error })
  }
}

export async function startWorker(channel, jobPath) {
  const session = { processes: new Set(), browser: null, stopping: false }
  channel.on('SIGTERM', () => shutdown(session, { channel, code: TERMINATED_EXIT_CODE }))
  channel.on('disconnect', () => shutdown(session, { channel, code: 1 }))

  try {
    await bootWorker(session, jobPath)
  } catch (error) {
    await fail(session, { channel, error })
    return
  }

  channel.on('message', message => handleMessage(session, { channel, message }))
  channel.send({ type: 'ready' })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) startWorker(process, process.argv[2])
