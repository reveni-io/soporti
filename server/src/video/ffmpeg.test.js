import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))

const { spawn } = await import('node:child_process')
const { runFfmpeg, spawnFfmpeg, describeFfmpegFailure } = await import('./ffmpeg.js')

function createChild() {
  const child = new EventEmitter()
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.kill = vi.fn()
  return child
}

describe('ffmpeg', () => {
  let child

  beforeEach(() => {
    vi.clearAllMocks()
    child = createChild()
    spawn.mockReturnValue(child)
  })

  it('runs ffmpeg with the given binary and resolves with stdout and stderr', async () => {
    const signal = new AbortController().signal
    const running = runFfmpeg({
      ffmpegPath: '/opt/ffmpeg',
      args: ['-i', 'in.mp4', '-'],
      input: Buffer.from('raw'),
      signal,
    })
    const received = []
    child.stdin.on('data', chunk => received.push(chunk))

    child.stdout.write(Buffer.from('jpeg'))
    child.stderr.write('loudnorm stats')
    setImmediate(() => child.emit('close', 0))
    const result = await running

    expect(spawn).toHaveBeenCalledTimes(1)
    expect(spawn).toHaveBeenCalledWith('/opt/ffmpeg', ['-hide_banner', '-i', 'in.mp4', '-'], {
      signal,
      killSignal: 'SIGKILL',
    })
    expect(result.stdout.toString()).toBe('jpeg')
    expect(result.stderr).toBe('loudnorm stats')
    expect(Buffer.concat(received).toString()).toBe('raw')
  })

  it('rejects with the tail of stderr when ffmpeg fails', async () => {
    const running = runFfmpeg({ ffmpegPath: 'ffmpeg', args: [] })
    const lines = Array.from({ length: 10 }, (_, index) => `line ${index}`).join('\n')

    child.stderr.write(`${lines}\n\n`)
    setImmediate(() => child.emit('close', 1))

    await expect(running).rejects.toThrow(
      'ffmpeg exited with code 1: line 4 | line 5 | line 6 | line 7 | line 8 | line 9'
    )
  })

  it('keeps only the end of a long stderr', async () => {
    const running = runFfmpeg({ ffmpegPath: 'ffmpeg', args: [] })

    child.stderr.write(`${'x'.repeat(20_000)}\nfinal error`)
    setImmediate(() => child.emit('close', 1))

    const error = await running.catch(failure => failure)
    expect(error.message.endsWith('final error')).toBe(true)
    expect(error.message.length).toBeLessThan(8300)
  })

  it('explains how to configure ffmpeg when the binary is missing', async () => {
    const running = runFfmpeg({ ffmpegPath: '/missing/ffmpeg', args: [] })

    child.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }))

    await expect(running).rejects.toThrow(
      'ffmpeg was not found at "/missing/ffmpeg": install it or point FFMPEG_PATH at the binary.'
    )
  })

  it('passes abort errors and other spawn errors through', async () => {
    const aborted = spawnFfmpeg({ ffmpegPath: 'ffmpeg', args: [] })
    child.emit('error', Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }))
    await expect(aborted.done).rejects.toMatchObject({ name: 'AbortError' })

    child = createChild()
    spawn.mockReturnValue(child)
    const failing = spawnFfmpeg({ ffmpegPath: 'ffmpeg', args: [] })
    child.emit('error', new Error('EACCES'))
    await expect(failing.done).rejects.toThrow('EACCES')
  })

  it('ignores write errors on stdin so a crash surfaces through done', async () => {
    const { done } = spawnFfmpeg({ ffmpegPath: 'ffmpeg', args: [] })

    child.stdin.emit('error', new Error('EPIPE'))
    child.emit('close', 1)

    await expect(done).rejects.toThrow('ffmpeg exited with code 1.')
  })

  it('describes a stopped process without stderr', () => {
    expect(describeFfmpegFailure(null, '')).toBe('ffmpeg was stopped.')
    expect(describeFfmpegFailure(1, '  \n')).toBe('ffmpeg exited with code 1.')
  })
})
