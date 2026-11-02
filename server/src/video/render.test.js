import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('node:child_process', () => ({ fork: vi.fn() }))
vi.mock('../config.js', () => ({
  default: { video: { renderWorkers: 2, maxSubframes: 16, ffmpegPath: '/usr/bin/ffmpeg' } },
}))
vi.mock('./ffmpeg.js', () => ({ runFfmpeg: vi.fn() }))
vi.mock('./browser.js', async importOriginal => ({
  ...(await importOriginal()),
  launchBrowser: vi.fn(),
  openProjectPage: vi.fn(),
}))

const { fork } = await import('node:child_process')
const { runFfmpeg } = await import('./ffmpeg.js')
const { launchBrowser, openProjectPage } = await import('./browser.js')
const {
  renderVideo,
  audioFilter,
  buildSchedule,
  chunkCost,
  chunkSchedule,
  concatList,
  estimateEta,
  measureLoudnessArgs,
  muxArgs,
  parseLoudnormStats,
  scheduleCost,
} = await import('./render.js')
const { VideoProjectError } = await import('./project-error.js')

const PAGE_GLOBALS = ['__meta', '__hints', '__motion', '__renderSoundtrack', '__soundtrackChunk']
const LOUDNORM_OUTPUT = `[Parsed_loudnorm_0 @ 0x1]
{
	"input_i" : "-20.53",
	"input_tp" : "-3.10",
	"input_lra" : "1.20",
	"input_thresh" : "-30.80",
	"output_i" : "-14.02",
	"normalization_type" : "linear",
	"target_offset" : "0.02"
}`
const SILENT_STATS = {
  input_i: '-inf',
  input_tp: '-inf',
  input_lra: '0.00',
  input_thresh: '-70.00',
  target_offset: '0',
}

function installPage({ duration = 2, fps = 30 } = {}) {
  const samples = new Float32Array(8000 * duration * 2).fill(0.25)
  globalThis.__meta = { width: 1920, height: 1080, fps, duration }
  globalThis.__renderSoundtrack = async () => ({ sampleRate: 8000, frames: samples.length / 2, peak: 0.25 })
  globalThis.__soundtrackChunk = (offset, length) => {
    return Buffer.from(samples.slice(offset * 2, (offset + length) * 2).buffer).toString('base64')
  }
}

function createSession(overrides = {}) {
  return {
    page: { evaluate: async (fn, arg) => fn(arg) },
    project: { title: 'T', width: 1920, height: 1080, fps: 30 },
    problems: { errors: [], warnings: [] },
    bootError: null,
    ...overrides,
  }
}

function createWorker(jobPath, { behavior }) {
  const child = new EventEmitter()
  child.exitCode = null
  child.signalCode = null
  child.kill = vi.fn(signal => {
    if (child.exitCode !== null) return
    child.signalCode = signal
    setImmediate(() => child.emit('exit', null, signal))
  })
  child.send = vi.fn(message => setImmediate(() => behavior(child, { message, jobPath })))
  setImmediate(() => child.emit('message', { type: 'ready' }))
  return child
}

function renderChunks(child, { message, jobPath }) {
  if (message.type === 'exit') {
    child.exitCode = 0
    child.emit('exit', 0, null)
    return
  }
  const job = JSON.parse(readFileSync(jobPath, 'utf8'))
  job.chunks[message.index].frames.forEach(item => child.emit('message', { type: 'frame', cost: item.n }))
  child.emit('message', { type: 'done', index: message.index })
}

function useWorkers(behavior = renderChunks) {
  const workers = []
  const jobs = []
  fork.mockImplementation((_path, [jobPath]) => {
    jobs.push(JSON.parse(readFileSync(jobPath, 'utf8')))
    const worker = createWorker(jobPath, { behavior })
    workers.push(worker)
    return worker
  })
  return { workers, jobs }
}

function useFfmpeg() {
  runFfmpeg.mockImplementation(async ({ args }) => {
    if (args.includes('null')) return { stdout: Buffer.alloc(0), stderr: LOUDNORM_OUTPUT }
    await writeFile(args.at(-1), 'mp4!')
    return { stdout: Buffer.alloc(0), stderr: '' }
  })
}

describe('renderVideo', () => {
  let root
  let workDir
  let browser

  beforeEach(async () => {
    vi.clearAllMocks()
    root = await mkdtemp(join(tmpdir(), 'render-test-'))
    workDir = join(root, 'work')
    browser = { close: vi.fn().mockResolvedValue() }
    launchBrowser.mockResolvedValue(browser)
    openProjectPage.mockResolvedValue(createSession())
    installPage()
    useFfmpeg()
  })

  afterEach(async () => {
    PAGE_GLOBALS.forEach(name => delete globalThis[name])
    await rm(root, { recursive: true, force: true })
  })

  it('renders the soundtrack, the frames in parallel workers and muxes the MP4', async () => {
    const { jobs } = useWorkers()
    const progress = []

    const result = await renderVideo({ html: '<html>', workDir, onProgress: update => progress.push(update) })

    expect(result).toEqual({ mp4Path: join(workDir, 'video.mp4'), durationMs: 2000, sizeBytes: 4 })
    expect(await readdir(workDir)).toEqual(['video.mp4'])
    expect(fork).toHaveBeenCalledTimes(2)
    expect(fork.mock.calls[0][0].endsWith('/video/render-worker.js')).toBe(true)
    expect(fork.mock.calls[0][2].execArgv).toEqual([])
    expect(fork.mock.calls[0][2].env).not.toHaveProperty('JWT_SECRET')
    expect(fork.mock.calls[0][2].env).not.toHaveProperty('DATABASE_URL')
    expect(jobs[0]).toMatchObject({
      ffmpegPath: '/usr/bin/ffmpeg',
      width: 1920,
      height: 1080,
      fps: 30,
      shutter: 0.5,
      crf: 18,
    })
    expect(jobs[0].chunks.map(chunk => chunk.frames.length)).toEqual([30, 30])
    expect(jobs[0].chunks[1].out).toBe(join(workDir, 'segments', '0001.mkv'))
    expect(browser.close).toHaveBeenCalled()

    expect(progress[0]).toEqual({ phase: 'music', done: 0, total: 1, etaSeconds: null })
    expect(progress).toContainEqual({ phase: 'music', done: 1, total: 1, etaSeconds: null })
    expect(progress).toContainEqual({ phase: 'rendering', done: 0, total: 60, etaSeconds: null })
    expect(progress.filter(update => update.phase === 'rendering').at(-1)).toMatchObject({
      done: 60,
      total: 60,
      etaSeconds: 0,
    })
    expect(progress.at(-1)).toEqual({ phase: 'finalizing', done: 2, total: 2, etaSeconds: 0 })

    expect(runFfmpeg).toHaveBeenCalledTimes(2)
    const soundtrack = { sampleRate: 8000, frames: 16_000, path: join(workDir, 'soundtrack.f32') }
    expect(runFfmpeg.mock.calls[0][0]).toEqual({
      ffmpegPath: '/usr/bin/ffmpeg',
      args: measureLoudnessArgs(soundtrack),
      signal: undefined,
    })
    expect(runFfmpeg.mock.calls[1][0].args).toEqual(
      muxArgs({
        concatPath: join(workDir, 'segments.txt'),
        soundtrack,
        stats: parseLoudnormStats(LOUDNORM_OUTPUT),
        fps: 30,
        frames: 60,
        out: join(workDir, 'video.mp4'),
      })
    )
  })

  it('schedules motion blur from the page hints and motion', async () => {
    const { jobs } = useWorkers()
    globalThis.__hints = [[0, 1, 6]]
    globalThis.__motion = t => (t < 1.5 ? 0 : 60)

    await renderVideo({ html: '<html>', workDir })

    const subframes = jobs[0].chunks.flatMap(chunk => chunk.frames.map(item => item.n))
    expect(subframes.slice(0, 30).every(n => n === 6)).toBe(true)
    expect(subframes.slice(30, 45).every(n => n === 2)).toBe(true)
    expect(subframes.slice(45).every(n => n === 10)).toBe(true)
  })

  it('fails with the worker error and removes the work dir', async () => {
    const { workers } = useWorkers(child => child.emit('message', { type: 'error', message: '__seek threw' }))

    await expect(renderVideo({ html: '<html>', workDir })).rejects.toThrow('__seek threw')
    await expect(readdir(workDir)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(workers.every(worker => worker.kill.mock.calls[0][0] === 'SIGTERM')).toBe(true)
  })

  it('fails when a worker dies without a word', async () => {
    useWorkers(child => {
      child.exitCode = 1
      child.emit('exit', 1, null)
    })

    await expect(renderVideo({ html: '<html>', workDir })).rejects.toThrow(
      'A render worker stopped unexpectedly (exit code 1).'
    )
  })

  it('cancels the workers and cleans up when the signal aborts', async () => {
    const controller = new AbortController()
    const { workers } = useWorkers(() => controller.abort())

    const error = await renderVideo({ html: '<html>', workDir, signal: controller.signal }).catch(failure => failure)

    expect(error).toMatchObject({ name: 'AbortError', message: 'The render was cancelled.' })
    expect(workers).toHaveLength(2)
    expect(workers.every(worker => worker.kill.mock.calls[0][0] === 'SIGTERM')).toBe(true)
    await expect(readdir(workDir)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(runFfmpeg).not.toHaveBeenCalled()
  })

  it('closes the browser when the signal aborts while preparing', async () => {
    const controller = new AbortController()
    let rejectPending = () => {}
    browser.close.mockImplementation(async () => rejectPending(new Error('Target closed')))
    openProjectPage.mockResolvedValue(
      createSession({
        page: {
          evaluate: (fn, arg) => {
            if (!String(fn).includes('__renderSoundtrack')) return Promise.resolve(fn(arg))
            const pending = new Promise((_resolve, reject) => {
              rejectPending = reject
            })
            controller.abort()
            return pending
          },
        },
      })
    )

    await expect(renderVideo({ html: '<html>', workDir, signal: controller.signal })).rejects.toThrow(
      'The render was cancelled.'
    )
    expect(browser.close).toHaveBeenCalled()
    expect(fork).not.toHaveBeenCalled()
  })

  it('refuses to start with an aborted signal', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(renderVideo({ html: '<html>', workDir, signal: controller.signal })).rejects.toThrow(
      'The render was cancelled.'
    )
    expect(launchBrowser).not.toHaveBeenCalled()
  })

  it('reports a page that does not boot or has an invalid meta as a project error', async () => {
    openProjectPage.mockResolvedValueOnce(createSession({ bootError: 'The page failed to boot: nope' }))
    await expect(renderVideo({ html: '<html>', workDir })).rejects.toThrow(VideoProjectError)

    globalThis.__meta = { fps: 30, duration: 0.5 }
    await expect(renderVideo({ html: '<html>', workDir })).rejects.toThrow(
      '__meta must give fps and a duration of 1–600 s.'
    )
    expect(browser.close).toHaveBeenCalledTimes(2)
    expect(fork).not.toHaveBeenCalled()
  })
})

describe('buildSchedule', () => {
  it('takes one subframe per frame when the page gives no blur information', () => {
    expect(buildSchedule({ total: 3, fps: 30, hints: null, motions: null, maxSubframes: 16 })).toEqual([
      { frame: 0, n: 1 },
      { frame: 1, n: 1 },
      { frame: 2, n: 1 },
    ])
  })

  it('takes two subframes by default with hints, more inside a hint range, and caps the count', () => {
    const schedule = buildSchedule({ total: 4, fps: 2, hints: [[0.5, 1, 40]], motions: null, maxSubframes: 16 })

    expect(schedule.map(item => item.n)).toEqual([2, 16, 2, 2])
  })

  it('adds one subframe per 3 px of blur trail from the motion estimate', () => {
    const schedule = buildSchedule({
      total: 4,
      fps: 30,
      hints: null,
      motions: [0, 6, 20, Number.NaN],
      maxSubframes: 16,
    })

    expect(schedule.map(item => item.n)).toEqual([1, 1, 4, 1])
  })
})

describe('chunking', () => {
  it('cuts the schedule into chunks under a subframe budget', () => {
    const schedule = [5, 5, 5, 20, 1].map((n, frame) => ({ frame, n }))

    expect(chunkSchedule(schedule, 12).map(chunk => chunk.map(item => item.frame))).toEqual([[0, 1], [2], [3], [4]])
    expect(scheduleCost(schedule)).toBe(36)
  })

  it('sizes chunks so every worker gets a couple of them, within bounds', () => {
    expect(chunkCost(60, 2)).toBe(30)
    expect(chunkCost(2400, 4)).toBe(240)
    expect(chunkCost(1000, 4)).toBe(125)
  })
})

describe('estimateEta', () => {
  it('extrapolates the remaining time from the work done', () => {
    expect(estimateEta({ startedAt: 0, now: 10_000, done: 25, total: 100 })).toBe(30)
    expect(estimateEta({ startedAt: 0, now: 10_000, done: 0, total: 100 })).toBeNull()
  })
})

describe('ffmpeg arguments', () => {
  it('lists the segments with their exact durations for the concat demuxer', () => {
    const list = concatList(
      [
        { path: "/work/it's/0000.mkv", frames: 30 },
        { path: '/work/0001.mkv', frames: 1 },
      ],
      60
    )

    expect(list).toBe(
      "file '/work/it'\\''s/0000.mkv'\nduration 0.500000000\nfile '/work/0001.mkv'\nduration 0.016666667\n"
    )
  })

  it('measures the loudness of the raw soundtrack', () => {
    expect(measureLoudnessArgs({ path: '/work/soundtrack.f32', sampleRate: 48_000 })).toEqual([
      '-nostats',
      '-loglevel',
      'info',
      '-f',
      'f32le',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-i',
      '/work/soundtrack.f32',
      '-af',
      'loudnorm=I=-14:TP=-1:LRA=20:print_format=json',
      '-f',
      'null',
      '-',
    ])
  })

  it('reads the loudnorm measurement from stderr', () => {
    expect(parseLoudnormStats(LOUDNORM_OUTPUT)).toMatchObject({ input_i: '-20.53', target_offset: '0.02' })
    expect(() => parseLoudnormStats('nothing here')).toThrow('ffmpeg did not report the loudness of the soundtrack.')
  })

  it('normalizes to -14 LUFS in a second linear pass, and leaves silence alone', () => {
    expect(audioFilter(parseLoudnormStats(LOUDNORM_OUTPUT))).toBe(
      'loudnorm=I=-14:TP=-1:LRA=20:measured_I=-20.53:measured_TP=-3.10:measured_LRA=1.20:measured_thresh=-30.80:offset=0.02:linear=true,aresample=48000,aformat=sample_rates=48000:channel_layouts=stereo,apad'
    )
    expect(audioFilter(SILENT_STATS)).toBe('aresample=48000,aformat=sample_rates=48000:channel_layouts=stereo,apad')
  })

  it('copies the video, encodes AAC 192k and trims to the frame count', () => {
    const args = muxArgs({
      concatPath: '/work/segments.txt',
      soundtrack: { path: '/work/soundtrack.f32', sampleRate: 44_100 },
      stats: SILENT_STATS,
      fps: 60,
      frames: 150,
      out: '/work/video.mp4',
    })

    expect(args.slice(args.indexOf('-f'), args.indexOf('-f') + 6)).toEqual([
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      '/work/segments.txt',
    ])
    expect(args.slice(args.indexOf('-c:v'), args.indexOf('-c:v') + 2)).toEqual(['-c:v', 'copy'])
    expect(args.slice(args.indexOf('-c:a'), args.indexOf('-c:a') + 4)).toEqual(['-c:a', 'aac', '-b:a', '192k'])
    expect(args.slice(args.indexOf('-t'), args.indexOf('-t') + 2)).toEqual(['-t', '2.500000'])
    expect(args.slice(-4)).toEqual(['60000', '-movflags', '+faststart', '/work/video.mp4'])
  })
})
