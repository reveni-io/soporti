import { fork } from 'node:child_process'
import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import config from '../config.js'
import { launchBrowser, openProjectPage, withTimeout } from './browser.js'
import { runFfmpeg } from './ffmpeg.js'
import { VideoProjectError } from './project-error.js'
import { writeSoundtrack } from './soundtrack.js'

const WORKER_PATH = fileURLToPath(new URL('./render-worker.js', import.meta.url))
const SHUTTER = 0.5
const CRF = 18
const HINT_BASELINE_SUBFRAMES = 2
const MOTION_PX_PER_SUBFRAME = 3
const MIN_CHUNK_COST = 30
const MAX_CHUNK_COST = 240
const CHUNKS_PER_WORKER = 2
const MIN_DURATION_SECONDS = 1
const MAX_DURATION_SECONDS = 600
const TARGET_LOUDNESS = -14
const TARGET_TRUE_PEAK = -1
const TARGET_LOUDNESS_RANGE = 20
const AUDIO_BITRATE = '192k'
const AUDIO_SAMPLE_RATE = 48_000
const WORKER_STOP_GRACE_MS = 5_000
const PREPARE_TIMEOUT_MS = 120_000
const LOUDNORM_STATS_RE = /\{[^{}]*"input_i"[^{}]*\}/
const CANCELLED_MESSAGE = 'The render was cancelled.'

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function hintSubframes(hints, t) {
  if (!Array.isArray(hints)) return 1
  return hints
    .filter(([from, to]) => t >= from && t < to)
    .reduce((most, [, , subframes]) => Math.max(most, subframes), HINT_BASELINE_SUBFRAMES)
}

function motionSubframes(motion) {
  if (!Number.isFinite(motion) || motion <= 0) return 1
  return Math.ceil((motion * SHUTTER) / MOTION_PX_PER_SUBFRAME)
}

export function buildSchedule({ total, fps, hints, motions, maxSubframes }) {
  return Array.from({ length: total }, (_, frame) => {
    const wanted = Math.max(hintSubframes(hints, frame / fps), motionSubframes(motions?.[frame]))
    return { frame, n: clamp(Math.round(wanted), 1, maxSubframes) }
  })
}

export function scheduleCost(schedule) {
  return schedule.reduce((sum, item) => sum + item.n, 0)
}

export function chunkCost(totalCost, workers) {
  return clamp(Math.ceil(totalCost / (workers * CHUNKS_PER_WORKER)), MIN_CHUNK_COST, MAX_CHUNK_COST)
}

export function chunkSchedule(schedule, maxCost) {
  const chunks = []
  let current = []
  let cost = 0

  for (const item of schedule) {
    if (current.length > 0 && cost + item.n > maxCost) {
      chunks.push(current)
      current = []
      cost = 0
    }
    current.push(item)
    cost += item.n
  }

  if (current.length > 0) chunks.push(current)
  return chunks
}

export function estimateEta({ startedAt, now, done, total }) {
  if (done <= 0) return null
  return Math.max(0, Math.round((((now - startedAt) / 1000) * (total - done)) / done))
}

function escapeConcatPath(path) {
  return path.replaceAll("'", "'\\''")
}

export function concatList(segments, fps) {
  const entries = segments.map(({ path, frames }) => {
    return `file '${escapeConcatPath(path)}'\nduration ${(frames / fps).toFixed(9)}`
  })
  return `${entries.join('\n')}\n`
}

function audioInput({ path, sampleRate }) {
  return ['-f', 'f32le', '-ar', String(sampleRate), '-ac', '2', '-i', path]
}

function loudnormBase() {
  return `loudnorm=I=${TARGET_LOUDNESS}:TP=${TARGET_TRUE_PEAK}:LRA=${TARGET_LOUDNESS_RANGE}`
}

export function measureLoudnessArgs(soundtrack) {
  return [
    '-nostats',
    '-loglevel',
    'info',
    ...audioInput(soundtrack),
    '-af',
    `${loudnormBase()}:print_format=json`,
    '-f',
    'null',
    '-',
  ]
}

export function parseLoudnormStats(stderr) {
  const match = LOUDNORM_STATS_RE.exec(stderr)
  if (!match) throw new Error('ffmpeg did not report the loudness of the soundtrack.')
  return JSON.parse(match[0])
}

function isMeasurable(stats) {
  return [stats.input_i, stats.input_tp, stats.input_lra, stats.input_thresh].every(value =>
    Number.isFinite(Number(value))
  )
}

export function audioFilter(stats) {
  const tail = `aresample=${AUDIO_SAMPLE_RATE},aformat=sample_rates=${AUDIO_SAMPLE_RATE}:channel_layouts=stereo,apad`
  if (!isMeasurable(stats)) return tail

  const measured = [
    `measured_I=${stats.input_i}`,
    `measured_TP=${stats.input_tp}`,
    `measured_LRA=${stats.input_lra}`,
    `measured_thresh=${stats.input_thresh}`,
    `offset=${stats.target_offset}`,
    'linear=true',
  ].join(':')
  return `${loudnormBase()}:${measured},${tail}`
}

export function muxArgs({ concatPath, soundtrack, stats, fps, frames, out }) {
  return [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    concatPath,
    ...audioInput(soundtrack),
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-c:v',
    'copy',
    '-af',
    audioFilter(stats),
    '-c:a',
    'aac',
    '-b:a',
    AUDIO_BITRATE,
    '-ar',
    String(AUDIO_SAMPLE_RATE),
    '-t',
    (frames / fps).toFixed(6),
    '-video_track_timescale',
    String(fps * 1000),
    '-movflags',
    '+faststart',
    out,
  ]
}

function workPaths(workDir) {
  return {
    html: join(workDir, 'bundle.html'),
    job: join(workDir, 'job.json'),
    soundtrack: join(workDir, 'soundtrack.f32'),
    segments: join(workDir, 'segments'),
    concat: join(workDir, 'segments.txt'),
    mp4: join(workDir, 'video.mp4'),
  }
}

function cancelledError() {
  const error = new Error(CANCELLED_MESSAGE)
  error.name = 'AbortError'
  return error
}

function onAbort(signal, handler) {
  if (!signal) return () => {}
  signal.addEventListener('abort', handler, { once: true })
  return () => signal.removeEventListener('abort', handler)
}

function validateMeta(meta) {
  const valid = Number.isFinite(meta?.duration) && Number.isFinite(meta?.fps) && meta.fps > 0
  if (!valid || meta.duration < MIN_DURATION_SECONDS || meta.duration > MAX_DURATION_SECONDS) {
    throw new VideoProjectError(
      `__meta must give fps and a duration of ${MIN_DURATION_SECONDS}–${MAX_DURATION_SECONDS} s.`
    )
  }
  return meta
}

function readBlurInputs(page, { total, fps }) {
  const reading = page.evaluate(
    ({ count, rate }) => {
      const motion = globalThis.__motion
      return {
        hints: Array.isArray(globalThis.__hints) ? globalThis.__hints : null,
        motions:
          typeof motion === 'function' ? Array.from({ length: count }, (_, f) => Number(motion(f / rate))) : null,
      }
    },
    { count: total, rate: fps }
  )
  return withTimeout(reading, { timeoutMs: PREPARE_TIMEOUT_MS, message: '__motion(t) did not return in time.' })
}

function reportMusic(onProgress) {
  onProgress({ phase: 'music', done: 0, total: 1, etaSeconds: null })
  return ({ done, total }) => onProgress({ phase: 'music', done, total, etaSeconds: null })
}

async function planFromPage(session, { paths, onProgress }) {
  if (session.bootError) throw new VideoProjectError(session.bootError)

  const meta = validateMeta(await session.page.evaluate(() => globalThis.__meta))
  const total = Math.round(meta.duration * meta.fps)
  const blur = await readBlurInputs(session.page, { total, fps: meta.fps })
  const schedule = buildSchedule({ total, fps: meta.fps, ...blur, maxSubframes: config.video.maxSubframes })
  const soundtrack = await writeSoundtrack({
    page: session.page,
    path: paths.soundtrack,
    onProgress: reportMusic(onProgress),
  })

  const { width, height } = session.project
  return { width, height, fps: meta.fps, total, schedule, soundtrack: { ...soundtrack, path: paths.soundtrack } }
}

async function preparePlan({ html, paths, onProgress, signal }) {
  const browser = await launchBrowser()
  const forget = onAbort(signal, () => browser.close())
  try {
    return await planFromPage(await openProjectPage(browser, html), { paths, onProgress })
  } finally {
    forget()
    await browser.close()
  }
}

function sendNextChunk(pool, child) {
  const index = pool.queue.shift()
  if (index === undefined) return child.send({ type: 'exit' })
  child.send({ type: 'chunk', index })
}

const WORKER_MESSAGES = {
  ready: (pool, child) => sendNextChunk(pool, child),
  frame: (pool, _child, message) => pool.onFrame(message.cost),
  error: (pool, _child, message) => pool.settle.reject(new Error(message.message)),
  done: (pool, child) => {
    pool.finished += 1
    if (pool.finished === pool.chunkCount) return pool.settle.resolve()
    sendNextChunk(pool, child)
  },
}

function spawnWorker(pool, jobPath) {
  const child = fork(WORKER_PATH, [jobPath], { execArgv: [] })
  child.on('message', message => WORKER_MESSAGES[message.type]?.(pool, child, message))
  child.on('exit', code => {
    if (code !== 0) pool.settle.reject(new Error(`A render worker stopped unexpectedly (exit code ${code}).`))
  })
  return child
}

function stopWorker(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()

  return new Promise(resolve => {
    const timer = setTimeout(() => child.kill('SIGKILL'), WORKER_STOP_GRACE_MS)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    child.kill('SIGTERM')
  })
}

function createSettlement() {
  const settlement = {}
  settlement.promise = new Promise((resolve, reject) => {
    settlement.resolve = resolve
    settlement.reject = reject
  })
  return settlement
}

async function runWorkers({ jobPath, workerCount, chunkCount, onFrame, signal }) {
  const pool = { queue: Array.from({ length: chunkCount }, (_, index) => index), finished: 0, chunkCount, onFrame }
  pool.settle = createSettlement()

  const children = Array.from({ length: workerCount }, () => spawnWorker(pool, jobPath))
  const forget = onAbort(signal, () => pool.settle.reject(cancelledError()))
  try {
    await pool.settle.promise
  } finally {
    forget()
    await Promise.all(children.map(stopWorker))
  }
}

function trackRendering({ totalFrames, totalCost, onProgress }) {
  const startedAt = Date.now()
  const progress = { frames: 0, cost: 0 }

  onProgress({ phase: 'rendering', done: 0, total: totalFrames, etaSeconds: null })
  return cost => {
    progress.frames += 1
    progress.cost += cost
    const etaSeconds = estimateEta({ startedAt, now: Date.now(), done: progress.cost, total: totalCost })
    onProgress({ phase: 'rendering', done: progress.frames, total: totalFrames, etaSeconds })
  }
}

async function renderSegments({ plan, paths, onProgress, signal }) {
  const totalCost = scheduleCost(plan.schedule)
  const frameChunks = chunkSchedule(plan.schedule, chunkCost(totalCost, config.video.renderWorkers))
  const chunks = frameChunks.map((frames, index) => ({
    frames,
    out: join(paths.segments, `${String(index).padStart(4, '0')}.mkv`),
  }))
  const { width, height, fps } = plan
  const job = {
    htmlPath: paths.html,
    ffmpegPath: config.video.ffmpegPath,
    width,
    height,
    fps,
    shutter: SHUTTER,
    crf: CRF,
    chunks,
  }

  await mkdir(paths.segments, { recursive: true })
  await writeFile(paths.job, JSON.stringify(job))
  await runWorkers({
    jobPath: paths.job,
    workerCount: Math.min(config.video.renderWorkers, chunks.length),
    chunkCount: chunks.length,
    onFrame: trackRendering({ totalFrames: plan.total, totalCost, onProgress }),
    signal,
  })
  return chunks.map(chunk => ({ path: chunk.out, frames: chunk.frames.length }))
}

async function muxVideo({ plan, segments, paths, onProgress, signal }) {
  const { ffmpegPath } = config.video
  onProgress({ phase: 'finalizing', done: 0, total: 2, etaSeconds: null })

  await writeFile(paths.concat, concatList(segments, plan.fps))
  const measured = await runFfmpeg({ ffmpegPath, args: measureLoudnessArgs(plan.soundtrack), signal })
  const stats = parseLoudnormStats(measured.stderr)
  onProgress({ phase: 'finalizing', done: 1, total: 2, etaSeconds: null })

  const { fps, total: frames, soundtrack } = plan
  await runFfmpeg({
    ffmpegPath,
    args: muxArgs({ concatPath: paths.concat, soundtrack, stats, fps, frames, out: paths.mp4 }),
    signal,
  })
  onProgress({ phase: 'finalizing', done: 2, total: 2, etaSeconds: 0 })
}

async function renderInto({ html, paths, onProgress, signal }) {
  await writeFile(paths.html, html)

  const plan = await preparePlan({ html, paths, onProgress, signal })
  signal?.throwIfAborted()
  const segments = await renderSegments({ plan, paths, onProgress, signal })
  signal?.throwIfAborted()
  await muxVideo({ plan, segments, paths, onProgress, signal })

  const { size } = await stat(paths.mp4)
  return { mp4Path: paths.mp4, durationMs: Math.round((plan.total / plan.fps) * 1000), sizeBytes: size }
}

function removeIntermediates(paths) {
  const intermediates = [paths.html, paths.job, paths.soundtrack, paths.segments, paths.concat]
  return Promise.all(intermediates.map(path => rm(path, { recursive: true, force: true })))
}

export async function renderVideo({ html, workDir, onProgress = () => {}, signal }) {
  if (signal?.aborted) throw cancelledError()

  const paths = workPaths(workDir)
  await mkdir(workDir, { recursive: true })
  try {
    const result = await renderInto({ html, paths, onProgress, signal })
    await removeIntermediates(paths)
    return result
  } catch (error) {
    await rm(workDir, { recursive: true, force: true })
    throw signal?.aborted ? cancelledError() : error
  }
}
