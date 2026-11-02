import { describe, it, expect } from 'vitest'
import { toVideoDetail, toVideoSummary } from './video-render.js'

const CREATED_AT = new Date('2026-11-02T10:00:00Z')
const UPDATED_AT = new Date('2026-11-02T10:05:00Z')
const BRIEF = { idea: 'Refunds in one click', format: '9:16', durationSeconds: 60 }

describe('toVideoSummary', () => {
  it('maps a row to a VideoSummary with no version yet', () => {
    const summary = toVideoSummary({
      id: 'v1',
      title: 'Refunds',
      stage: 'drafting',
      brief: BRIEF,
      updatedAt: UPDATED_AT,
    })

    expect(summary).toEqual({
      id: 'v1',
      title: 'Refunds',
      status: 'drafting',
      phase: null,
      progress: null,
      format: '9:16',
      durationSeconds: 60,
      latestVersion: null,
      thumbnailVersion: null,
      updatedAt: UPDATED_AT,
    })
  })
})

describe('toVideoSummary in production', () => {
  it('takes the status, phase and progress from the latest version and the newest thumbnail', () => {
    const summary = toVideoSummary(
      { id: 'v1', title: 'Refunds', stage: 'production', brief: BRIEF, updatedAt: UPDATED_AT },
      [
        { version: 3, status: 'running', phase: 'rendering', progress: 42, hasThumbnail: false },
        { version: 2, status: 'ready', phase: null, progress: 100, hasThumbnail: true },
        { version: 1, status: 'ready', phase: null, progress: 100, hasThumbnail: true },
      ]
    )

    expect(summary).toMatchObject({
      status: 'running',
      phase: 'rendering',
      progress: 42,
      latestVersion: 3,
      thumbnailVersion: 2,
    })
  })
})

describe('toVideoDetail', () => {
  it('maps a row and its messages to a VideoDetail with no versions yet', () => {
    const messages = [{ id: 1, role: 'assistant', content: 'Here it is.', version: null, createdAt: UPDATED_AT }]
    const storyboard = { title: 'Refunds', scenes: [] }

    const detail = toVideoDetail({
      id: 'v1',
      title: 'Refunds',
      stage: 'storyboard',
      brief: BRIEF,
      storyboard,
      storyboardError: null,
      parentVideoId: null,
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
      messages,
    })

    expect(detail).toEqual({
      id: 'v1',
      title: 'Refunds',
      status: 'storyboard',
      stage: 'storyboard',
      brief: BRIEF,
      storyboard,
      storyboardError: null,
      parentVideoId: null,
      messages,
      versions: [],
      queuePosition: null,
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    })
  })
})

describe('toVideoDetail in production', () => {
  it('maps each version with its frames, newest first, and passes the queue position through', () => {
    const version = {
      id: 11,
      version: 2,
      kind: 'compose',
      status: 'queued',
      phase: null,
      progress: null,
      step: null,
      etaSeconds: null,
      events: [{ at: '2026-11-02T10:00:00.000Z', text: 'Reading the brief' }],
      request: 'Make it orange.',
      basedOn: 1,
      summary: 'internal',
      error: null,
      resume: false,
      previewReady: false,
      hasVideo: false,
      hasThumbnail: false,
      durationMs: null,
      sizeBytes: null,
      createdAt: CREATED_AT,
      startedAt: null,
      finishedAt: null,
    }
    const older = { ...version, id: 10, version: 1, status: 'ready', request: null, basedOn: null, hasVideo: true }
    const frames = [
      { id: 5, versionId: 10, times: [1, 2], createdAt: CREATED_AT },
      { id: 6, versionId: 10, times: [3], createdAt: UPDATED_AT },
    ]

    const detail = toVideoDetail(
      { id: 'v1', title: 'Refunds', stage: 'production', brief: BRIEF, messages: [] },
      { versions: [version, older], frames, queuePosition: 2 }
    )

    expect(detail.status).toBe('queued')
    expect(detail.queuePosition).toBe(2)
    expect(detail.versions).toHaveLength(2)
    expect(detail.versions[0]).toEqual({
      version: 2,
      kind: 'compose',
      status: 'queued',
      phase: null,
      progress: null,
      step: null,
      etaSeconds: null,
      events: version.events,
      frames: [],
      request: 'Make it orange.',
      basedOn: 1,
      error: null,
      previewReady: false,
      hasVideo: false,
      hasThumbnail: false,
      durationMs: null,
      sizeBytes: null,
      createdAt: CREATED_AT,
      startedAt: null,
      finishedAt: null,
    })
    expect(detail.versions[1].frames).toEqual([
      { id: 5, times: [1, 2], createdAt: CREATED_AT },
      { id: 6, times: [3], createdAt: UPDATED_AT },
    ])
  })
})
