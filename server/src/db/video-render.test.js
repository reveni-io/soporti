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
