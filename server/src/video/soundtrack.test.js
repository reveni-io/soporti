import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  decodeChunk,
  planChunks,
  readSoundtrack,
  tallySamples,
  validateSoundtrackInfo,
  writeSoundtrack,
} from './soundtrack.js'
import { VideoProjectError } from './project-error.js'

const page = { evaluate: async (fn, arg) => fn(arg) }

function encode(samples) {
  return Buffer.from(Float32Array.from(samples).buffer).toString('base64')
}

function installSoundtrack(samples, sampleRate = 8000) {
  globalThis.__renderSoundtrack = async () => ({ sampleRate, frames: samples.length / 2, peak: 1 })
  globalThis.__soundtrackChunk = (offset, length) => encode(samples.slice(offset * 2, (offset + length) * 2))
}

describe('soundtrack', () => {
  let workDir

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'soundtrack-test-'))
  })

  afterEach(async () => {
    delete globalThis.__renderSoundtrack
    delete globalThis.__soundtrackChunk
    await rm(workDir, { recursive: true, force: true })
  })

  it('cuts the frames into chunks', () => {
    expect(planChunks(5, 2)).toEqual([
      { offset: 0, length: 2 },
      { offset: 2, length: 2 },
      { offset: 4, length: 1 },
    ])
    expect(planChunks(70_000)).toEqual([
      { offset: 0, length: 65_536 },
      { offset: 65_536, length: 4464 },
    ])
  })

  it('decodes a chunk of interleaved stereo float samples', () => {
    const bytes = decodeChunk(encode([0.5, -0.5, 1, 0]), { offset: 0, length: 2 })

    expect(Array.from(new Float32Array(bytes.buffer, bytes.byteOffset, 4))).toEqual([0.5, -0.5, 1, 0])
  })

  it('rejects a chunk of the wrong size or type', () => {
    expect(() => decodeChunk(encode([0, 0]), { offset: 4, length: 2 })).toThrow(VideoProjectError)
    expect(() => decodeChunk(encode([0, 0]), { offset: 4, length: 2 })).toThrow(
      '__soundtrackChunk(4, 2) returned 8 bytes instead of 16 bytes'
    )
    expect(() => decodeChunk(undefined, { offset: 0, length: 1 })).toThrow('returned undefined instead of 8 bytes')
  })

  it.each([
    [{ sampleRate: 44_100.5, frames: 10 }, 'returned sampleRate 44100.5'],
    [{ sampleRate: 4000, frames: 10 }, 'returned sampleRate 4000'],
    [{ sampleRate: 48_000, frames: 0 }, 'returned frames 0'],
    [undefined, 'returned sampleRate undefined'],
  ])('rejects invalid soundtrack info (%#)', (info, message) => {
    expect(() => validateSoundtrackInfo(info)).toThrow(message)
  })

  it('tallies the peak, the clipped and the invalid samples', () => {
    const bytes = Buffer.concat([Buffer.from([0]), Buffer.from(Float32Array.from([0.25, -1.5, NaN, Infinity]).buffer)])

    const totals = tallySamples({ peak: 0, nonFinite: 0, clipped: 0 }, bytes.subarray(1))

    expect(totals).toEqual({ peak: 1.5, nonFinite: 2, clipped: 1 })
  })

  it('writes the soundtrack as raw f32le stereo and reports progress', async () => {
    const samples = Array.from({ length: 140_000 }, (_, index) => (index % 7) / 10)
    const onProgress = vi.fn()
    installSoundtrack(samples)

    const info = await writeSoundtrack({ page, path: join(workDir, 'soundtrack.f32'), onProgress })
    const written = await readFile(join(workDir, 'soundtrack.f32'))

    expect(info).toEqual({ sampleRate: 8000, frames: 70_000 })
    expect(written.equals(Buffer.from(Float32Array.from(samples).buffer))).toBe(true)
    expect(onProgress).toHaveBeenCalledTimes(2)
    expect(onProgress).toHaveBeenLastCalledWith({ done: 2, total: 2 })
  })

  it('hands every decoded chunk to the reader', async () => {
    const chunks = []
    installSoundtrack([0.1, 0.2, 0.3, 0.4])

    await readSoundtrack(page, bytes => chunks.push(bytes.length))

    expect(chunks).toEqual([16])
  })

  it('fails when the page reports an invalid soundtrack', async () => {
    globalThis.__renderSoundtrack = async () => ({ sampleRate: 48_000, frames: -1 })

    await expect(readSoundtrack(page, () => {})).rejects.toThrow('__renderSoundtrack() returned frames -1')
  })
})
