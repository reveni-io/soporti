import { EventEmitter } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))
vi.mock('./browser.js', async importOriginal => ({
  ...(await importOriginal()),
  launchBrowser: vi.fn(),
  openProjectPage: vi.fn(),
}))

const { spawn } = await import('node:child_process')
const { launchBrowser, openProjectPage } = await import('./browser.js')
const { createBlender, encoderArgs, finishFrame, renderChunk, startWorker, subframeTimes } =
  await import('./render-worker.js')

const JOB = { ffmpegPath: '/usr/bin/ffmpeg', width: 2, height: 1, fps: 10, shutter: 0.5, crf: 18 }
const FRAME_BYTES = 6
const CHUNK = {
  frames: [
    { frame: 0, n: 1 },
    { frame: 1, n: 2 },
  ],
  out: '/work/segments/0000.mkv',
}

function createChild() {
  const child = new EventEmitter()
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.kill = vi.fn()
  return child
}

function createDecoder({ exitCode = 0, output = true } = {}) {
  const child = createChild()
  child.stdin.on('data', png => {
    if (output) child.stdout.write(Buffer.alloc(FRAME_BYTES, png[0]))
  })
  child.stdin.on('end', () => {
    child.stdout.end()
    if (exitCode !== 0) child.stderr.write('Invalid PNG signature')
    setImmediate(() => child.emit('close', exitCode))
  })
  return child
}

function createEncoder() {
  const child = createChild()
  child.received = []
  child.stdin.on('data', bytes => child.received.push(bytes))
  child.stdin.on('end', () => setImmediate(() => child.emit('close', 0)))
  return child
}

function useFfmpeg({ decoder = createDecoder(), encoder = createEncoder() } = {}) {
  spawn.mockImplementation((_path, args) => (args.includes('image2pipe') ? decoder : encoder))
  return { decoder, encoder }
}

function createSession() {
  let current = 0
  globalThis.__seek = t => {
    current = t
  }
  return {
    page: { evaluate: async (fn, arg) => fn(arg) },
    cdp: { send: vi.fn(async () => ({ data: Buffer.from([Math.round(current * 100)]).toString('base64') })) },
    processes: new Set(),
  }
}

function frames(encoder) {
  const bytes = Buffer.concat(encoder.received)
  return Array.from({ length: bytes.length / FRAME_BYTES }, (_, index) => [
    ...bytes.subarray(index * FRAME_BYTES, (index + 1) * FRAME_BYTES),
  ])
}

describe('subframeTimes', () => {
  it('samples one instant without blur and spreads blurred subframes over the shutter', () => {
    expect(subframeTimes({ frame: 3, n: 1 }, { fps: 30, shutter: 0.5 })).toEqual([0.1])
    const blurred = subframeTimes({ frame: 1, n: 2 }, { fps: 10, shutter: 0.5 })
    expect(blurred).toHaveLength(2)
    expect(blurred[0]).toBeCloseTo(0.0875)
    expect(blurred[1]).toBeCloseTo(0.1125)
    expect(subframeTimes({ frame: 0, n: 2 }, { fps: 10, shutter: 0.5 })).toEqual([0, 0.0125])
  })
})

describe('finishFrame', () => {
  it('keeps a single subframe exact and averages several with dither', () => {
    expect([...finishFrame(Uint32Array.from([0, 128, 255]), { n: 1, frame: 7 })]).toEqual([0, 128, 255])

    const averaged = [...finishFrame(new Uint32Array(1000).fill(3), { n: 2, frame: 0 })]
    expect(averaged.every(value => value === 1 || value === 2)).toBe(true)
    expect(averaged.reduce((sum, value) => sum + value, 0) / averaged.length).toBeCloseTo(1.5, 1)
  })
})

describe('createBlender', () => {
  it('accumulates subframes split across chunks and emits each averaged frame', () => {
    const emitted = []
    const blender = createBlender({
      width: 1,
      height: 1,
      frames: [
        { frame: 0, n: 2 },
        { frame: 1, n: 1 },
      ],
      emit: (bytes, item) => emitted.push([[...bytes], item.frame]),
    })

    blender.push(Buffer.from([10, 20]))
    blender.push(Buffer.from([30, 30, 40, 50]))
    expect(blender.isComplete()).toBe(false)
    blender.push(Buffer.from([7, 8, 9]))

    expect(emitted).toEqual([
      [[20, 30, 40], 0],
      [[7, 8, 9], 1],
    ])
    expect(blender.isComplete()).toBe(true)
  })

  it('is not complete when ffmpeg decodes more than was captured', () => {
    const blender = createBlender({ width: 1, height: 1, frames: [{ frame: 0, n: 1 }], emit: () => {} })

    blender.push(Buffer.from([1, 2, 3, 4]))

    expect(blender.isComplete()).toBe(false)
  })
})

describe('encoderArgs', () => {
  it('encodes raw RGB to H.264 yuv420p tagged bt709', () => {
    const args = encoderArgs({ width: 1080, height: 1920, fps: 60, crf: 18 }, '/work/0001.mkv')

    expect(args.slice(args.indexOf('-s'), args.indexOf('-s') + 4)).toEqual(['-s', '1080x1920', '-r', '60'])
    expect(args).toContain(
      'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv'
    )
    expect(args.slice(args.indexOf('-crf'), args.indexOf('-crf') + 4)).toEqual(['-crf', '18', '-tune', 'animation'])
    expect(args.at(-1)).toBe('/work/0001.mkv')
  })
})

describe('renderChunk', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    delete globalThis.__seek
  })

  it('captures every subframe, blends them and pipes the frames to the encoder', async () => {
    const { decoder, encoder } = useFfmpeg()
    const session = createSession()
    const onFrame = vi.fn()

    await renderChunk({ session, job: JOB, chunk: CHUNK, onFrame })

    expect(frames(encoder)).toEqual([
      [0, 0, 0, 0, 0, 0],
      [10, 10, 10, 10, 10, 10],
    ])
    expect(session.cdp.send).toHaveBeenCalledTimes(3)
    expect(session.cdp.send).toHaveBeenCalledWith('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true })
    expect(onFrame.mock.calls).toEqual([[1], [2]])
    expect(spawn).toHaveBeenCalledWith('/usr/bin/ffmpeg', ['-hide_banner', ...encoderArgs(JOB, CHUNK.out)], {
      signal: undefined,
      killSignal: 'SIGKILL',
    })
    expect(spawn.mock.calls[1][1]).toContain('image2pipe')
    expect(session.processes.size).toBe(0)
    expect(decoder.kill).toHaveBeenCalledWith('SIGKILL')
  })

  it('pauses decoding while the encoder is full', async () => {
    const { decoder, encoder } = useFfmpeg()
    const pause = vi.spyOn(decoder.stdout, 'pause')
    const resume = vi.spyOn(decoder.stdout, 'resume')
    vi.spyOn(encoder.stdin, 'write').mockImplementationOnce(function (bytes) {
      PassThrough.prototype.write.call(this, bytes)
      setImmediate(() => this.emit('drain'))
      return false
    })

    await renderChunk({ session: createSession(), job: JOB, chunk: CHUNK, onFrame: () => {} })

    expect(pause).toHaveBeenCalledTimes(1)
    expect(resume).toHaveBeenCalled()
    expect(frames(encoder)).toHaveLength(2)
  })

  it('fails with the seek error and stops ffmpeg', async () => {
    const { decoder, encoder } = useFfmpeg()
    const session = createSession()
    globalThis.__seek = () => {
      throw new Error('scene is undefined')
    }

    await expect(renderChunk({ session, job: JOB, chunk: CHUNK, onFrame: () => {} })).rejects.toThrow(
      'Seeking to 0.000 s failed: scene is undefined'
    )
    expect(decoder.kill).toHaveBeenCalledWith('SIGKILL')
    expect(encoder.kill).toHaveBeenCalledWith('SIGKILL')
  })

  it('fails with the decoder error', async () => {
    useFfmpeg({ decoder: createDecoder({ exitCode: 1 }) })

    await expect(renderChunk({ session: createSession(), job: JOB, chunk: CHUNK, onFrame: () => {} })).rejects.toThrow(
      'ffmpeg exited with code 1: Invalid PNG signature'
    )
  })

  it('fails when the decoder output does not match the captures', async () => {
    useFfmpeg({ decoder: createDecoder({ output: false }) })

    await expect(renderChunk({ session: createSession(), job: JOB, chunk: CHUNK, onFrame: () => {} })).rejects.toThrow(
      'ffmpeg decoded a different number of screenshots than were captured.'
    )
  })

  it('fails when the encoder stops early', async () => {
    const encoder = createEncoder()
    useFfmpeg({ encoder })
    setImmediate(() => encoder.emit('close', 0))

    await expect(renderChunk({ session: createSession(), job: JOB, chunk: CHUNK, onFrame: () => {} })).rejects.toThrow(
      'ffmpeg stopped encoding before the chunk was complete.'
    )
  })
})

describe('startWorker', () => {
  let workDir
  let browser
  let jobPath

  function createChannel() {
    const channel = new EventEmitter()
    channel.sent = []
    channel.send = vi.fn((message, callback) => {
      channel.sent.push(message)
      callback?.()
    })
    channel.exit = vi.fn()
    return channel
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    workDir = await mkdtemp(join(tmpdir(), 'render-worker-test-'))
    jobPath = join(workDir, 'job.json')
    await writeFile(join(workDir, 'bundle.html'), '<html>')
    await writeFile(jobPath, JSON.stringify({ ...JOB, htmlPath: join(workDir, 'bundle.html'), chunks: [CHUNK] }))
    browser = { close: vi.fn().mockResolvedValue() }
    launchBrowser.mockResolvedValue(browser)
  })

  afterEach(async () => {
    delete globalThis.__seek
    vi.restoreAllMocks()
    await rm(workDir, { recursive: true, force: true })
  })

  function bootPage() {
    const session = createSession()
    const context = { newCDPSession: vi.fn().mockResolvedValue(session.cdp) }
    openProjectPage.mockResolvedValue({ page: session.page, context, bootError: null })
    return context
  }

  it('boots the bundle, renders the chunks it is sent and exits when told', async () => {
    const context = bootPage()
    const { encoder } = useFfmpeg()
    const channel = createChannel()

    await startWorker(channel, jobPath)
    channel.emit('message', { type: 'chunk', index: 0 })
    await vi.waitFor(() => expect(channel.sent.at(-1)).toEqual({ type: 'done', index: 0 }))
    channel.emit('message', { type: 'exit' })
    await vi.waitFor(() => expect(channel.exit).toHaveBeenCalledWith(0))

    expect(openProjectPage).toHaveBeenCalledWith(browser, '<html>')
    expect(context.newCDPSession).toHaveBeenCalledTimes(1)
    expect(channel.sent).toEqual([
      { type: 'ready' },
      { type: 'frame', cost: 1 },
      { type: 'frame', cost: 2 },
      { type: 'done', index: 0 },
    ])
    expect(frames(encoder)).toHaveLength(2)
    expect(browser.close).toHaveBeenCalledTimes(1)
  })

  it('reports a page that cannot boot and exits with an error', async () => {
    openProjectPage.mockResolvedValue({ bootError: 'The page failed to boot: nope' })
    const channel = createChannel()

    await startWorker(channel, jobPath)

    expect(channel.sent).toEqual([{ type: 'error', message: 'The page failed to boot: nope' }])
    expect(channel.exit).toHaveBeenCalledWith(1)
    expect(browser.close).toHaveBeenCalledTimes(1)
  })

  it('reports a chunk that fails to render', async () => {
    bootPage()
    useFfmpeg({ decoder: createDecoder({ exitCode: 1 }) })
    const channel = createChannel()

    await startWorker(channel, jobPath)
    channel.emit('message', { type: 'chunk', index: 0 })
    await vi.waitFor(() => expect(channel.exit).toHaveBeenCalledWith(1))

    expect(channel.sent.at(-1)).toEqual({ type: 'error', message: 'ffmpeg exited with code 1: Invalid PNG signature' })
  })

  it('kills the ffmpeg processes of the running chunk and closes the browser on SIGTERM', async () => {
    const context = bootPage()
    const cdp = await context.newCDPSession()
    let rejectCapture = () => {}
    cdp.send.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectCapture = reject
      })
    )
    browser.close.mockImplementation(async () => rejectCapture(new Error('Target closed')))
    const { decoder, encoder } = useFfmpeg()
    const channel = createChannel()

    await startWorker(channel, jobPath)
    channel.emit('message', { type: 'chunk', index: 0 })
    await vi.waitFor(() => expect(cdp.send).toHaveBeenCalledTimes(1))
    channel.emit('SIGTERM')
    await vi.waitFor(() => expect(channel.exit).toHaveBeenCalledWith(143))

    expect(decoder.kill).toHaveBeenCalledWith('SIGKILL')
    expect(encoder.kill).toHaveBeenCalledWith('SIGKILL')
    expect(browser.close).toHaveBeenCalledTimes(1)
    await new Promise(resolve => setImmediate(resolve))
    expect(console.error).not.toHaveBeenCalled()
    expect(channel.sent.some(message => message.type === 'error')).toBe(false)
  })

  it('exits when the parent process goes away', async () => {
    bootPage()
    const channel = createChannel()

    await startWorker(channel, jobPath)
    channel.emit('disconnect')
    await vi.waitFor(() => expect(channel.exit).toHaveBeenCalledWith(1))

    expect(browser.close).toHaveBeenCalledTimes(1)
  })
})
