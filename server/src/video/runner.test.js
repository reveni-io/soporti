import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('node:fs/promises', () => ({ readFile: vi.fn(), rm: vi.fn() }))
vi.mock('../db/video-versions.js', () => {
  return {
    claimNextVersion: vi.fn(),
    completeVersion: vi.fn(),
    failVersion: vi.fn(),
    markPreviewReady: vi.fn(),
    markVersionCancelled: vi.fn(),
    materializeVersionFiles: vi.fn(),
    requeueInterruptedVersions: vi.fn(),
  }
})
vi.mock('../db/video-files.js', () => ({ loadVideoAssets: vi.fn(), readProjectFiles: vi.fn() }))
vi.mock('./bundle.js', () => ({ bundleProject: vi.fn() }))
vi.mock('./kit.js', () => ({ loadKit: vi.fn(() => ({ scripts: [], runtime: '' })) }))
vi.mock('./render.js', () => ({ renderVideo: vi.fn() }))
vi.mock('./thumbnail.js', () => ({ extractThumbnail: vi.fn() }))
vi.mock('./agent.js', () => ({ composeVideo: vi.fn() }))
vi.mock('./notify.js', () => ({ notifyVersionOutcome: vi.fn() }))
vi.mock('./progress.js', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, createProgressReporter: vi.fn() }
})

const { readFile, rm } = await import('node:fs/promises')
const versions = await import('../db/video-versions.js')
const { loadVideoAssets, readProjectFiles } = await import('../db/video-files.js')
const { bundleProject } = await import('./bundle.js')
const { renderVideo } = await import('./render.js')
const { extractThumbnail } = await import('./thumbnail.js')
const { composeVideo } = await import('./agent.js')
const { notifyVersionOutcome } = await import('./notify.js')
const { createProgressReporter } = await import('./progress.js')
const { VideoProjectError } = await import('./project-error.js')
const { startVideoRunner, stopVideoRunner, wakeVideoRunner, cancelVideoVersion } = await import('./runner.js')

const MP4 = Buffer.from('mp4-bytes')
const JPEG = Buffer.from('jpeg-bytes')
const FILES = { 'project.json': '{}' }
const ASSETS = { 'logo.svg': { mimeType: 'image/svg+xml', data: Buffer.from('<svg/>') } }

let reporter

function job(overrides = {}) {
  return {
    id: 41,
    videoId: 'video-1',
    version: 2,
    kind: 'compose',
    previewReady: false,
    basedOn: 1,
    events: [],
    video: { id: 'video-1', userId: 7, title: 'Refunds', brief: {}, storyboard: {} },
    ...overrides,
  }
}

function renderResult() {
  return { mp4Path: '/tmp/work/video.mp4', durationMs: 62_000, sizeBytes: MP4.length }
}

function queue(...jobs) {
  versions.claimNextVersion.mockReset()
  for (const item of jobs) versions.claimNextVersion.mockResolvedValueOnce(item)
  versions.claimNextVersion.mockResolvedValue(null)
}

async function settle() {
  await vi.waitFor(() => expect(versions.claimNextVersion.mock.calls.length).toBeGreaterThan(0))
  await new Promise(resolve => setTimeout(resolve, 0))
  await vi.waitFor(() => {
    const outcomes =
      versions.completeVersion.mock.calls.length +
      versions.failVersion.mock.calls.length +
      versions.markVersionCancelled.mock.calls.length
    expect(outcomes).toBeGreaterThan(0)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  reporter = { update: vi.fn(), step: vi.fn(), event: vi.fn(), close: vi.fn().mockResolvedValue(undefined) }
  createProgressReporter.mockReturnValue(reporter)
  versions.requeueInterruptedVersions.mockResolvedValue(0)
  versions.completeVersion.mockResolvedValue(true)
  versions.failVersion.mockResolvedValue(true)
  versions.markPreviewReady.mockResolvedValue(true)
  versions.markVersionCancelled.mockResolvedValue(true)
  readProjectFiles.mockResolvedValue(FILES)
  loadVideoAssets.mockResolvedValue(ASSETS)
  bundleProject.mockReturnValue({ html: '<html>bundle</html>', project: {} })
  renderVideo.mockResolvedValue(renderResult())
  extractThumbnail.mockResolvedValue(JPEG)
  readFile.mockResolvedValue(MP4)
  rm.mockResolvedValue(undefined)
  composeVideo.mockResolvedValue({ summary: 'A tour of one-click refunds.' })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  stopVideoRunner()
})

describe('video runner', () => {
  it('re-queues the versions a restart interrupted when it starts', async () => {
    versions.requeueInterruptedVersions.mockResolvedValue(2)
    queue()

    await startVideoRunner()

    expect(versions.requeueInterruptedVersions).toHaveBeenCalledTimes(1)
    expect(console.log).toHaveBeenCalledWith('[videos] Re-queued 2 video version(s) interrupted by the restart.')
    expect(rm).toHaveBeenCalledWith(expect.stringMatching(/soporti-videos$/), { recursive: true, force: true })
  })

  it('prepares, composes, renders and stores a compose version, then tells the owner', async () => {
    queue(job())

    await startVideoRunner()
    await settle()

    expect(versions.materializeVersionFiles).toHaveBeenCalledWith(expect.objectContaining({ id: 41, basedOn: 1 }))
    expect(composeVideo).toHaveBeenCalledTimes(1)
    expect(composeVideo.mock.calls[0][0].id).toBe(41)
    expect(versions.markPreviewReady).toHaveBeenCalledWith(
      expect.objectContaining({ id: 41 }),
      'A tour of one-click refunds.'
    )
    expect(bundleProject).toHaveBeenCalledWith({
      files: FILES,
      assets: ASSETS,
      kit: { scripts: [], runtime: '' },
      mode: 'render',
    })
    expect(renderVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        html: '<html>bundle</html>',
        workDir: expect.stringMatching(/soporti-videos\/41-\d+$/),
      })
    )
    expect(extractThumbnail).toHaveBeenCalledWith({ mp4Path: '/tmp/work/video.mp4', atSeconds: 21.7 })
    expect(versions.completeVersion).toHaveBeenCalledWith(expect.objectContaining({ id: 41 }), {
      mp4: MP4,
      thumbnail: JPEG,
      durationMs: 62_000,
      sizeBytes: MP4.length,
      message: 'Version 2 is ready (1:02).',
    })
    expect(rm).toHaveBeenCalledWith(expect.stringMatching(/soporti-videos\/41-\d+$/), { recursive: true, force: true })
    expect(notifyVersionOutcome).toHaveBeenCalledWith({
      job: expect.objectContaining({ id: 41 }),
      status: 'ready',
      durationMs: 62_000,
    })
  })

  it('reports the phases in order and maps render progress to percent, step and eta', async () => {
    renderVideo.mockImplementation(async ({ onProgress }) => {
      onProgress({ phase: 'music', done: 1, total: 2, etaSeconds: null })
      onProgress({ phase: 'rendering', done: 30, total: 120, etaSeconds: 45 })
      onProgress({ phase: 'finalizing', done: 0, total: 0, etaSeconds: null })
      return renderResult()
    })
    queue(job())

    await startVideoRunner()
    await settle()

    const phases = reporter.update.mock.calls.map(([fields]) => fields.phase).filter(Boolean)
    expect(phases).toEqual(['preparing', 'composing', 'music', 'music', 'rendering', 'finalizing'])
    expect(reporter.update).toHaveBeenCalledWith({
      phase: 'rendering',
      progress: 25,
      etaSeconds: 45,
      step: 'Rendering frame 30 of 120',
    })
    expect(reporter.update).toHaveBeenCalledWith({
      phase: 'finalizing',
      progress: null,
      etaSeconds: null,
      step: 'Mixing the sound and encoding the MP4',
    })
  })

  it('jumps straight to the music for a render version and for a version whose preview is ready', async () => {
    queue(job({ kind: 'render', previewReady: true }), job({ id: 42, kind: 'compose', previewReady: true }))

    await startVideoRunner()
    await vi.waitFor(() => expect(versions.completeVersion).toHaveBeenCalledTimes(2))

    expect(versions.materializeVersionFiles).not.toHaveBeenCalled()
    expect(composeVideo).not.toHaveBeenCalled()
    expect(renderVideo).toHaveBeenCalledTimes(2)
  })

  it('runs one version at a time, oldest first, and claims the next when one ends', async () => {
    let finishFirst
    renderVideo.mockImplementationOnce(() => new Promise(resolve => (finishFirst = resolve)))
    queue(job({ id: 1, previewReady: true }), job({ id: 2, previewReady: true }))

    await startVideoRunner()
    await vi.waitFor(() => expect(renderVideo).toHaveBeenCalledTimes(1))
    wakeVideoRunner()
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(versions.claimNextVersion).toHaveBeenCalledTimes(1)

    finishFirst(renderResult())
    await vi.waitFor(() => expect(versions.completeVersion).toHaveBeenCalledTimes(2))
    expect(versions.completeVersion.mock.calls.map(([item]) => item.id)).toEqual([1, 2])
  })

  it('fails the version with the sentence of a project error and tells the owner', async () => {
    composeVideo.mockRejectedValue(new VideoProjectError('The video did not pass its last check: boom.'))
    queue(job())

    await startVideoRunner()
    await settle()

    expect(renderVideo).not.toHaveBeenCalled()
    expect(versions.failVersion).toHaveBeenCalledWith(expect.objectContaining({ id: 41 }), {
      error: 'The video did not pass its last check: boom.',
      message: 'Version 2 failed: The video did not pass its last check: boom.',
    })
    expect(notifyVersionOutcome).toHaveBeenCalledWith({
      job: expect.objectContaining({ id: 41 }),
      status: 'failed',
      error: 'The video did not pass its last check: boom.',
    })
  })

  it('hides an unexpected error behind a generic sentence and logs it', async () => {
    renderVideo.mockRejectedValue(new Error('ffmpeg exited with code 1'))
    queue(job({ previewReady: true }))

    await startVideoRunner()
    await settle()

    expect(versions.failVersion).toHaveBeenCalledWith(expect.anything(), {
      error: 'Something went wrong while making this version. Try again.',
      message: 'Version 2 failed: Something went wrong while making this version. Try again.',
    })
    expect(console.error).toHaveBeenCalledWith('[videos] Failed to make a video version:', 41, expect.any(Error))
  })

  it('does not tell the owner when the version was deleted while it ran', async () => {
    versions.completeVersion.mockResolvedValue(false)
    queue(job({ previewReady: true }))

    await startVideoRunner()
    await settle()

    expect(notifyVersionOutcome).not.toHaveBeenCalled()
  })

  it('cancels the running version: aborts the agent and marks it cancelled, with no message or DM', async () => {
    composeVideo.mockImplementation((_job, { signal }) => {
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))
    })
    queue(job())

    await startVideoRunner()
    await vi.waitFor(() => expect(composeVideo).toHaveBeenCalledTimes(1))
    cancelVideoVersion(41)
    await settle()

    expect(versions.markVersionCancelled).toHaveBeenCalledWith(41)
    expect(versions.failVersion).not.toHaveBeenCalled()
    expect(notifyVersionOutcome).not.toHaveBeenCalled()
  })

  it('aborts the render when the database reports a cancel request', async () => {
    renderVideo.mockImplementation(({ signal }) => {
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('cancelled'))))
    })
    queue(job({ previewReady: true }))

    await startVideoRunner()
    await vi.waitFor(() => expect(renderVideo).toHaveBeenCalledTimes(1))
    createProgressReporter.mock.calls[0][1].onCancelRequested()
    await settle()

    expect(versions.markVersionCancelled).toHaveBeenCalledWith(41)
  })

  it('stops claiming once stopped and ignores cancels of versions it does not run', async () => {
    queue(job())
    await startVideoRunner()
    await settle()
    stopVideoRunner()
    versions.claimNextVersion.mockClear()

    wakeVideoRunner()
    cancelVideoVersion(999)
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(versions.claimNextVersion).not.toHaveBeenCalled()
  })

  it('logs a failed claim and keeps the runner alive', async () => {
    versions.claimNextVersion.mockRejectedValueOnce(new Error('db down')).mockResolvedValue(null)

    await startVideoRunner()
    await vi.waitFor(() => {
      expect(console.error).toHaveBeenCalledWith('[videos] Failed to claim a queued video version:', expect.any(Error))
    })
  })

  it('logs when recording the outcome itself fails', async () => {
    versions.failVersion.mockRejectedValue(new Error('db down'))
    composeVideo.mockRejectedValue(new VideoProjectError('Nope.'))
    queue(job())

    await startVideoRunner()
    await vi.waitFor(() => {
      expect(console.error).toHaveBeenCalledWith(
        '[videos] Failed to record the outcome of a video version:',
        41,
        expect.any(Error)
      )
    })
  })
})
