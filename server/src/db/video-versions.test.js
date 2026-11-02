import { describe, it, expect, vi, beforeEach } from 'vitest'
import { and, eq } from 'drizzle-orm'

let queue = []
let calls = []

function tableName(ref) {
  return ref?.[Symbol.for('drizzle:Name')] ?? null
}

function makeChain(op, target) {
  const call = { op, target: tableName(target), steps: {} }
  calls.push(call)
  const record = name => value => {
    call.steps[name] = value
    return chain
  }
  const chain = {
    from: table => {
      call.target = tableName(table)
      return chain
    },
    where: record('where'),
    set: record('set'),
    values: record('values'),
    for: record('for'),
    orderBy: () => chain,
    limit: () => chain,
    innerJoin: () => chain,
    returning: () => chain,
    then: (resolve, reject) => {
      const next = queue.shift()
      const promise = next instanceof Error ? Promise.reject(next) : Promise.resolve(next ?? [])
      return promise.then(resolve, reject)
    },
  }
  return chain
}

const handle = {
  select: () => makeChain('select'),
  insert: table => makeChain('insert', table),
  update: table => makeChain('update', table),
  delete: table => makeChain('delete', table),
  transaction: fn => fn(handle),
}

vi.mock('./index.js', () => ({ getDb: () => handle }))

const { videoVersions } = await import('./schema.js')
const db = await import('./video-versions.js')

const VIDEO_ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601'
const JOB = { id: 41, videoId: VIDEO_ID, version: 2 }

function writes(op, target) {
  return calls.filter(call => call.op === op && call.target === target)
}

beforeEach(() => {
  queue = []
  calls = []
})

describe('startProduction', () => {
  it('moves an approved storyboard into production and queues version 1', async () => {
    queue = [[{ id: VIDEO_ID }], []]

    expect(await db.startProduction(VIDEO_ID, 7)).toBe(true)
    expect(writes('update', 'videos')[0].steps.set.stage).toBe('production')
    expect(writes('insert', 'video_versions')[0].steps.values).toEqual({
      videoId: VIDEO_ID,
      version: 1,
      kind: 'compose',
      status: 'queued',
    })
  })

  it('does nothing when the video is not in the storyboard stage with a storyboard', async () => {
    queue = [[]]

    expect(await db.startProduction(VIDEO_ID, 7)).toBe(false)
    expect(writes('insert', 'video_versions')).toHaveLength(0)
  })
})

describe('createChangeRequest', () => {
  it('reports a video that is missing or not owned', async () => {
    queue = [[]]

    expect(await db.createChangeRequest(VIDEO_ID, 7, 'Orange.')).toEqual({ status: 'not_found' })
  })

  it('reports a video that is not in production', async () => {
    queue = [[{ id: VIDEO_ID, stage: 'storyboard' }]]

    expect(await db.createChangeRequest(VIDEO_ID, 7, 'Orange.')).toEqual({ status: 'conflict' })
  })

  it.each([
    ['queued', { status: 'queued', previewReady: true }],
    ['composing', { status: 'running', previewReady: false }],
  ])('refuses while the latest version is %s', async (_label, latest) => {
    queue = [[{ id: VIDEO_ID, stage: 'production' }], [{ id: 5, version: 3, ...latest }]]

    expect(await db.createChangeRequest(VIDEO_ID, 7, 'Orange.')).toEqual({ status: 'busy' })
    expect(writes('insert', 'video_versions')).toHaveLength(0)
  })

  it('cancels a rendering latest version and queues the next one on the newest preview', async () => {
    queue = [
      [{ id: VIDEO_ID, stage: 'production' }],
      [
        { id: 5, version: 3, status: 'running', previewReady: true },
        { id: 4, version: 2, status: 'ready', previewReady: true },
      ],
    ]

    const result = await db.createChangeRequest(VIDEO_ID, 7, 'Make it orange.')

    expect(result).toEqual({ status: 'ok', version: 4, cancelledVersionId: 5 })
    expect(writes('update', 'video_versions')[0].steps.set).toEqual({ cancelRequested: true })
    expect(writes('insert', 'video_versions')[0].steps.values).toEqual({
      videoId: VIDEO_ID,
      version: 4,
      kind: 'compose',
      status: 'queued',
      request: 'Make it orange.',
      basedOn: 3,
    })
    expect(writes('insert', 'video_messages')[0].steps.values).toEqual({
      videoId: VIDEO_ID,
      role: 'user',
      content: 'Make it orange.',
      version: 4,
    })
  })

  it('starts from scratch when no version has a preview', async () => {
    queue = [[{ id: VIDEO_ID, stage: 'production' }], [{ id: 5, version: 1, status: 'failed', previewReady: false }]]

    const result = await db.createChangeRequest(VIDEO_ID, 7, 'Try again in blue.')

    expect(result).toEqual({ status: 'ok', version: 2, cancelledVersionId: null })
    expect(writes('insert', 'video_versions')[0].steps.values.basedOn).toBeNull()
  })
})

describe('createVariant', () => {
  it('reports a source that is missing or not owned', async () => {
    queue = [[]]

    expect(await db.createVariant(VIDEO_ID, 7, 'For Lounge.')).toEqual({ status: 'not_found' })
  })

  it('needs a version with a ready preview to start from', async () => {
    queue = [[{ id: VIDEO_ID, title: 'Refunds', brief: {}, storyboard: {} }], []]

    expect(await db.createVariant(VIDEO_ID, 7, 'For Lounge.')).toEqual({ status: 'conflict' })
  })

  it('creates a sibling in production with the assets and the files of the newest preview', async () => {
    const asset = { name: 'logo.svg', mimeType: 'image/svg+xml', data: Buffer.from('<svg/>'), sha256: 'abc' }
    queue = [
      [{ id: VIDEO_ID, userId: 7, title: 'Refunds', brief: { idea: 'x' }, storyboard: { scenes: [] } }],
      [{ id: 12 }],
      [],
      [asset],
      [],
      [{ id: 99 }],
      [{ path: 'scenes.js', content: 'R.video({})' }],
      [],
      [],
    ]

    const result = await db.createVariant(VIDEO_ID, 7, 'For Lounge.')

    expect(result.status).toBe('ok')
    const [video] = writes('insert', 'videos')
    expect(video.steps.values).toMatchObject({
      id: result.id,
      userId: 7,
      title: 'Refunds',
      stage: 'production',
      parentVideoId: VIDEO_ID,
      storyboard: { scenes: [] },
    })
    expect(writes('insert', 'video_assets')[0].steps.values).toEqual([{ ...asset, videoId: result.id }])
    expect(writes('insert', 'video_versions')[0].steps.values).toEqual({
      videoId: result.id,
      version: 1,
      kind: 'compose',
      status: 'queued',
      request: 'For Lounge.',
    })
    expect(writes('insert', 'video_files')[0].steps.values).toEqual([
      { path: 'scenes.js', content: 'R.video({})', versionId: 99 },
    ])
    expect(writes('insert', 'video_messages')[0].steps.values).toMatchObject({ role: 'user', version: 1 })
  })
})

describe('materializeVersionFiles', () => {
  it('leaves a first version empty', async () => {
    expect(await db.materializeVersionFiles({ id: 41, videoId: VIDEO_ID, basedOn: null })).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it('keeps the files a version already has', async () => {
    queue = [[{ total: 3 }]]

    expect(await db.materializeVersionFiles({ id: 41, videoId: VIDEO_ID, basedOn: 1 })).toBe(false)
    expect(writes('insert', 'video_files')).toHaveLength(0)
  })

  it('does nothing when the base version is gone', async () => {
    queue = [[{ total: 0 }], []]

    expect(await db.materializeVersionFiles({ id: 41, videoId: VIDEO_ID, basedOn: 1 })).toBe(false)
  })

  it('copies the files of the version it is based on', async () => {
    queue = [[{ total: 0 }], [{ id: 40 }], [{ path: 'data.js', content: 'R.DATA = {}' }], []]

    expect(await db.materializeVersionFiles({ id: 41, videoId: VIDEO_ID, basedOn: 1 })).toBe(true)
    expect(writes('insert', 'video_files')[0].steps.values).toEqual([
      { path: 'data.js', content: 'R.DATA = {}', versionId: 41 },
    ])
  })

  it('copies nothing when the base version has no files', async () => {
    queue = [[{ total: 0 }], [{ id: 40 }], []]

    expect(await db.materializeVersionFiles({ id: 41, videoId: VIDEO_ID, basedOn: 1 })).toBe(true)
    expect(writes('insert', 'video_files')).toHaveLength(0)
  })
})

describe('claimNextVersion', () => {
  it('returns null when nothing is queued', async () => {
    queue = [[]]

    expect(await db.claimNextVersion()).toBeNull()
  })

  it('locks the oldest queued version, marks it running and returns it with its video', async () => {
    const video = { id: VIDEO_ID, userId: 7, title: 'Refunds', brief: {}, storyboard: {} }
    queue = [[{ id: 41, kind: 'compose', previewReady: false }], [{ id: 41, videoId: VIDEO_ID, version: 2 }], [video]]

    const job = await db.claimNextVersion()

    expect(job).toEqual({ id: 41, videoId: VIDEO_ID, version: 2, video })
    expect(calls[0].steps.for).toBe('update')
    expect(writes('update', 'video_versions')[0].steps.set).toMatchObject({
      status: 'running',
      phase: 'preparing',
      error: null,
      cancelRequested: false,
      finishedAt: null,
    })
  })

  it.each([[{ kind: 'render', previewReady: true }], [{ kind: 'compose', previewReady: true }]])(
    'starts at the music for %o',
    async next => {
      queue = [[{ id: 41, ...next }], [{ id: 41, videoId: VIDEO_ID }], [{ id: VIDEO_ID }]]

      await db.claimNextVersion()

      expect(writes('update', 'video_versions')[0].steps.set.phase).toBe('music')
    }
  )
})

describe('progress and outcomes', () => {
  it('saves progress only while running and returns the cancel flag', async () => {
    queue = [[{ cancelRequested: true }], []]

    expect(await db.saveVersionProgress(41, { progress: 10 })).toEqual({ cancelRequested: true })
    expect(await db.saveVersionProgress(41, { progress: 20 })).toBeNull()
    expect(writes('update', 'video_versions')[0].steps.set).toEqual({ progress: 10 })
  })

  it('marks the preview ready and adds the summary as a message', async () => {
    queue = [[{ id: 41 }], [], []]

    expect(await db.markPreviewReady(JOB, 'A tour.')).toBe(true)
    expect(writes('update', 'video_versions')[0].steps.set).toEqual({ previewReady: true, summary: 'A tour.' })
    expect(writes('insert', 'video_messages')[0].steps.values).toEqual({
      videoId: VIDEO_ID,
      role: 'assistant',
      content: 'A tour.',
      version: 2,
    })
  })

  it('skips the summary of a version that stopped running', async () => {
    queue = [[]]

    expect(await db.markPreviewReady(JOB, 'A tour.')).toBe(false)
    expect(writes('insert', 'video_messages')).toHaveLength(0)
  })

  it('stores the video, keeps the MP4s of the two most recent renders only and adds the message', async () => {
    const mp4 = Buffer.from('mp4')
    queue = [[{ id: 41 }], [{ id: 41 }, { id: 30 }, { id: 20 }, { id: 10 }], [], [], []]

    const completed = await db.completeVersion(JOB, {
      mp4,
      thumbnail: Buffer.from('jpg'),
      durationMs: 7000,
      sizeBytes: 3,
      message: 'Version 2 is ready (0:07).',
    })

    expect(completed).toBe(true)
    const [stored, dropped] = writes('update', 'video_versions')
    expect(stored.steps.set).toMatchObject({ status: 'ready', progress: 100, mp4, durationMs: 7000, sizeBytes: 3 })
    expect(dropped.steps.set).toEqual({ mp4: null })
    expect(writes('insert', 'video_messages')[0].steps.values.content).toBe('Version 2 is ready (0:07).')
  })

  it('drops nothing while two or fewer versions have an MP4', async () => {
    queue = [[{ id: 41 }], [{ id: 41 }, { id: 30 }], [], []]

    await db.completeVersion(JOB, {
      mp4: Buffer.from('x'),
      thumbnail: null,
      durationMs: 1,
      sizeBytes: 1,
      message: 'ok',
    })

    expect(writes('update', 'video_versions')).toHaveLength(1)
  })

  it('stores nothing more for a version that was cancelled or deleted meanwhile', async () => {
    queue = [[]]

    expect(await db.completeVersion(JOB, { message: 'x' })).toBe(false)
    expect(writes('insert', 'video_messages')).toHaveLength(0)
  })

  it('fails a running version with its error and message', async () => {
    queue = [[{ id: 41 }], [], [], []]

    expect(await db.failVersion(JOB, { error: 'Boom.', message: 'Version 2 failed: Boom.' })).toBe(true)
    expect(writes('update', 'video_versions')[0].steps.set).toMatchObject({ status: 'failed', error: 'Boom.' })
    expect(writes('insert', 'video_messages')[0].steps.values.content).toBe('Version 2 failed: Boom.')
  })

  it('does not fail a version that stopped running', async () => {
    queue = [[]]

    expect(await db.failVersion(JOB, { error: 'Boom.', message: 'x' })).toBe(false)
  })

  it('marks a version cancelled', async () => {
    queue = [[{ id: 41 }], []]

    expect(await db.markVersionCancelled(41)).toBe(true)
    expect(await db.markVersionCancelled(41)).toBe(false)
    expect(writes('update', 'video_versions')[0].steps.set).toMatchObject({ status: 'cancelled', phase: null })
  })

  it('cancels the interrupted versions whose cancel was requested, then re-queues the rest to resume', async () => {
    queue = [[], [{ id: 1 }, { id: 2 }]]

    expect(await db.requeueInterruptedVersions()).toBe(2)
    const [cancelled, requeued] = writes('update', 'video_versions')
    expect(cancelled.steps.set).toMatchObject({ status: 'cancelled', phase: null, progress: null, step: null })
    expect(cancelled.steps.set.finishedAt).toBeInstanceOf(Date)
    expect(cancelled.steps.where).toEqual(
      and(eq(videoVersions.status, 'running'), eq(videoVersions.cancelRequested, true))
    )
    expect(requeued.steps.set).toMatchObject({ status: 'queued', resume: true })
    expect(requeued.steps.where).toEqual(eq(videoVersions.status, 'running'))
  })
})

describe('cancelLatestVersion', () => {
  it('reports a missing video', async () => {
    queue = [[]]

    expect(await db.cancelLatestVersion(VIDEO_ID, 7)).toEqual({ status: 'not_found' })
  })

  it('reports that nothing is queued or running', async () => {
    queue = [[{ id: VIDEO_ID }], [{ id: 5, status: 'ready' }]]

    expect(await db.cancelLatestVersion(VIDEO_ID, 7)).toEqual({ status: 'idle' })
  })

  it('cancels a queued version at once', async () => {
    queue = [[{ id: VIDEO_ID }], [{ id: 5, status: 'queued' }], []]

    expect(await db.cancelLatestVersion(VIDEO_ID, 7)).toEqual({ status: 'cancelled', versionId: 5 })
    expect(writes('update', 'video_versions')[0].steps.set).toMatchObject({ status: 'cancelled' })
  })

  it('asks a running version to stop', async () => {
    queue = [[{ id: VIDEO_ID }], [{ id: 5, status: 'running' }], []]

    expect(await db.cancelLatestVersion(VIDEO_ID, 7)).toEqual({ status: 'cancelling', versionId: 5 })
    expect(writes('update', 'video_versions')[0].steps.set).toEqual({ cancelRequested: true })
  })
})

describe('requeueVersion', () => {
  it('re-queues a failed version to resume from its files', async () => {
    queue = [[{ id: 41 }]]

    expect(await db.requeueVersion({ videoId: VIDEO_ID, userId: 7, version: 2, mode: 'retry' })).toBe('ok')
    expect(writes('update', 'video_versions')[0].steps.set).toMatchObject({
      status: 'queued',
      resume: true,
      error: null,
      cancelRequested: false,
    })
  })

  it('re-queues a version as a render only', async () => {
    queue = [[{ id: 41 }]]

    expect(await db.requeueVersion({ videoId: VIDEO_ID, userId: 7, version: 1, mode: 'render' })).toBe('ok')
    expect(writes('update', 'video_versions')[0].steps.set).toMatchObject({ kind: 'render', resume: false })
  })

  it('tells a version in the wrong state from a missing one', async () => {
    queue = [[], [{ id: 41 }], [], []]

    expect(await db.requeueVersion({ videoId: VIDEO_ID, userId: 7, version: 2, mode: 'retry' })).toBe('conflict')
    expect(await db.requeueVersion({ videoId: VIDEO_ID, userId: 7, version: 9, mode: 'retry' })).toBe('not_found')
  })
})

describe('reads', () => {
  it('lists the active version ids of an owned video', async () => {
    queue = [[{ id: 4 }, { id: 5 }]]

    expect(await db.listActiveVersionIds(VIDEO_ID, 7)).toEqual([4, 5])
  })

  it('lists versions, summaries and frames, and skips the queries for no ids', async () => {
    queue = [[{ id: 41 }], [{ videoId: VIDEO_ID, version: 1 }], [{ id: 3, versionId: 41 }]]

    expect(await db.listVersions(VIDEO_ID)).toEqual([{ id: 41 }])
    expect(await db.listVersionSummaries([VIDEO_ID])).toEqual([{ videoId: VIDEO_ID, version: 1 }])
    expect(await db.listFrames([41])).toEqual([{ id: 3, versionId: 41 }])
    expect(await db.listVersionSummaries([])).toEqual([])
    expect(await db.listFrames([])).toEqual([])
    expect(calls).toHaveLength(3)
  })

  it('counts the place of a version in the queue', async () => {
    queue = [[{ position: 3 }]]

    expect(await db.getQueuePosition(41)).toBe(3)
  })

  it('says first in line for a version claimed between the reads', async () => {
    queue = [[{ position: 0 }]]

    expect(await db.getQueuePosition(41)).toBe(1)
  })

  it('reads the summary of a version', async () => {
    queue = [[{ summary: 'A tour.' }], []]

    expect(await db.getVersionSummary(VIDEO_ID, 1)).toBe('A tour.')
    expect(await db.getVersionSummary(VIDEO_ID, 9)).toBeNull()
  })

  it('reads an owned version', async () => {
    queue = [[{ id: 41, previewReady: true }], []]

    expect(await db.getOwnedVersion({ videoId: VIDEO_ID, userId: 7, version: 1 })).toEqual({
      id: 41,
      previewReady: true,
    })
    expect(await db.getOwnedVersion({ videoId: VIDEO_ID, userId: 7, version: 9 })).toBeNull()
  })

  it('reads the MP4 or the thumbnail with the title, or null when it is gone', async () => {
    const data = Buffer.from('mp4')
    queue = [[{ title: 'Refunds', data }], [{ title: 'Refunds', data: null }], []]

    expect(await db.getVersionMedia({ videoId: VIDEO_ID, userId: 7, version: 1, kind: 'video' })).toEqual({
      title: 'Refunds',
      data,
    })
    expect(await db.getVersionMedia({ videoId: VIDEO_ID, userId: 7, version: 1, kind: 'thumbnail' })).toBeNull()
    expect(await db.getVersionMedia({ videoId: VIDEO_ID, userId: 7, version: 2, kind: 'video' })).toBeNull()
  })
})
