import { describe, it, expect } from 'vitest'
import { describeEta, estimateQueueMinutes, isComposing, isRendering, videoFileName } from './version-state.js'

describe('version-state', () => {
  it.each([
    [{ status: 'queued', phase: null }, true, false],
    [{ status: 'running', phase: null }, true, false],
    [{ status: 'running', phase: 'preparing' }, true, false],
    [{ status: 'running', phase: 'composing' }, true, false],
    [{ status: 'running', phase: 'music' }, false, true],
    [{ status: 'running', phase: 'rendering' }, false, true],
    [{ status: 'running', phase: 'finalizing' }, false, true],
    [{ status: 'ready', phase: null }, false, false],
    [{ status: 'failed', phase: 'rendering' }, false, false],
  ])('classifies %o as composing %s and rendering %s', (version, composing, rendering) => {
    expect(isComposing(version)).toBe(composing)
    expect(isRendering(version)).toBe(rendering)
  })

  it('estimates the wait from the place in the queue', () => {
    expect(estimateQueueMinutes(1)).toBe(15)
    expect(estimateQueueMinutes(3)).toBe(45)
    expect(estimateQueueMinutes(null)).toBe(15)
  })

  it('describes the time left of a render', () => {
    expect(describeEta(null)).toBeNull()
    expect(describeEta(20)).toBe('Less than a minute left')
    expect(describeEta(150)).toBe('About 3 min left')
  })

  it('names the downloaded file after the title and the version', () => {
    expect(videoFileName('Liquid email templates!', 2)).toBe('liquid-email-templates-v2.mp4')
    expect(videoFileName('¿Qué?', 1)).toBe('qu-v1.mp4')
    expect(videoFileName('***', 3)).toBe('video-v3.mp4')
  })
})
