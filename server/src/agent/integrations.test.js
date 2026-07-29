import { describe, it, expect } from 'vitest'
import {
  INTEGRATIONS,
  ALWAYS_AVAILABLE_INTEGRATIONS,
  resolveAvailableIntegrations,
  integrationLabels,
} from './integrations.js'

describe('INTEGRATIONS', () => {
  it('gives every integration a label and a configuration flag', () => {
    for (const [id, { label, flag }] of Object.entries(INTEGRATIONS)) {
      expect(label, id).toBeTruthy()
      expect(flag, id).toMatch(/Configured$/)
    }
  })

  it('registers every always-available integration', () => {
    for (const id of ALWAYS_AVAILABLE_INTEGRATIONS) {
      expect(INTEGRATIONS[id], id).toBeDefined()
    }
  })
})

describe('resolveAvailableIntegrations', () => {
  it('fails closed when no configuration is given', () => {
    expect(resolveAvailableIntegrations(null)).toEqual([])
    expect(resolveAvailableIntegrations({ unrestricted: false, repos: [], integrations: ['notion'] })).toEqual([])
  })

  it('returns every configured integration for an unrestricted policy', () => {
    expect(resolveAvailableIntegrations(null, { notionConfigured: true, shopifyConfigured: true })).toEqual([
      'notion',
      'shopify',
    ])
    expect(
      resolveAvailableIntegrations({ unrestricted: true, repos: [], integrations: [] }, { notionConfigured: true })
    ).toEqual(['notion'])
  })

  it('returns only the selected integrations for a restricted policy', () => {
    const policy = { unrestricted: false, repos: [], integrations: ['notion'] }

    expect(resolveAvailableIntegrations(policy, { notionConfigured: true, shopifyConfigured: true })).toEqual([
      'notion',
    ])
  })

  it('appends the configured always-available integrations after the selected ones', () => {
    const policy = { unrestricted: false, repos: ['org/app'], integrations: ['postgres'] }

    expect(
      resolveAvailableIntegrations(policy, {
        postgresConfigured: true,
        shortcutConfigured: true,
        sentryConfigured: true,
      })
    ).toEqual(['postgres', 'shortcut', 'sentry'])
  })

  it('drops unknown ids and unconfigured selections', () => {
    const policy = { unrestricted: false, repos: [], integrations: ['unknown', 'notion', 'postgres'] }

    expect(resolveAvailableIntegrations(policy, { postgresConfigured: true })).toEqual(['postgres'])
  })

  it('does not repeat an integration selected twice', () => {
    const policy = { unrestricted: false, repos: [], integrations: ['notion', 'notion'] }

    expect(resolveAvailableIntegrations(policy, { notionConfigured: true })).toEqual(['notion'])
  })
})

describe('integrationLabels', () => {
  it('maps ids to their display labels', () => {
    expect(integrationLabels(['postgres', 'betterstack', 'google-drive'])).toEqual([
      'Database',
      'Better Stack',
      'Google Drive',
    ])
  })

  it('returns an empty list for an empty selection', () => {
    expect(integrationLabels([])).toEqual([])
  })
})
