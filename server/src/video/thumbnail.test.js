import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../config.js', () => ({ default: { video: { ffmpegPath: '/usr/bin/ffmpeg' } } }))
vi.mock('./ffmpeg.js', () => ({ runFfmpeg: vi.fn() }))

const { runFfmpeg } = await import('./ffmpeg.js')
const { extractThumbnail, thumbnailArgs } = await import('./thumbnail.js')

describe('extractThumbnail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a 640 px wide JPEG of the requested instant', async () => {
    runFfmpeg.mockResolvedValue({ stdout: Buffer.from('jpeg'), stderr: '' })

    const jpeg = await extractThumbnail({ mp4Path: '/work/video.mp4', atSeconds: 2.5 })

    expect(jpeg.toString()).toBe('jpeg')
    expect(runFfmpeg).toHaveBeenCalledTimes(1)
    expect(runFfmpeg).toHaveBeenCalledWith({
      ffmpegPath: '/usr/bin/ffmpeg',
      args: thumbnailArgs({ mp4Path: '/work/video.mp4', atSeconds: 2.5 }),
    })
  })

  it('seeks to the instant, scales to 640 px and encodes one JPEG frame', () => {
    const args = thumbnailArgs({ mp4Path: '/work/video.mp4', atSeconds: -1 })

    expect(args.slice(args.indexOf('-ss'), args.indexOf('-ss') + 4)).toEqual(['-ss', '0', '-i', '/work/video.mp4'])
    expect(args).toContain('scale=640:-2:out_range=pc,format=yuvj420p')
    expect(args.slice(args.indexOf('-frames:v'), args.indexOf('-frames:v') + 2)).toEqual(['-frames:v', '1'])
    expect(args.slice(args.indexOf('-c:v'), args.indexOf('-c:v') + 2)).toEqual(['-c:v', 'mjpeg'])
  })

  it('fails when the instant is past the end of the video', async () => {
    runFfmpeg.mockResolvedValue({ stdout: Buffer.alloc(0), stderr: '' })

    await expect(extractThumbnail({ mp4Path: '/work/video.mp4', atSeconds: 99 })).rejects.toThrow(
      'The video has no frame at 99 s.'
    )
  })
})
