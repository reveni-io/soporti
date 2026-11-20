import { describe, it, expect } from 'vitest'
import { YOLO_SOURCE } from '../../constants.js'
import { summarizeSources } from './source-summary.js'

const INTEGRATIONS = [{ id: 'notion', name: 'Notion' }]

describe('summarizeSources', () => {
  it('names the automatic mode while yolo is selected', () => {
    expect(summarizeSources({ selectedSources: [YOLO_SOURCE], integrations: INTEGRATIONS, profile: 'support' })).toBe(
      'Auto · Support'
    )
  })

  it('names a single integration by its display name', () => {
    expect(
      summarizeSources({ selectedSources: ['integration:notion'], integrations: INTEGRATIONS, profile: 'tech' })
    ).toBe('Notion · Tech')
  })

  it('falls back to the integration id when it is not listed', () => {
    expect(summarizeSources({ selectedSources: ['integration:jira'], integrations: [], profile: 'tech' })).toBe(
      'jira · Tech'
    )
  })

  it('names a single repo without its owner', () => {
    expect(summarizeSources({ selectedSources: ['org/app'], integrations: [], profile: 'support' })).toBe(
      'app · Support'
    )
  })

  it('counts several sources', () => {
    expect(
      summarizeSources({
        selectedSources: ['org/app', 'integration:notion'],
        integrations: INTEGRATIONS,
        profile: 'support',
      })
    ).toBe('2 sources · Support')
  })

  it('says when no source is selected and defaults an unknown profile to the first one', () => {
    expect(summarizeSources({ selectedSources: [], integrations: [], profile: 'unknown' })).toBe('No source · Support')
  })
})
