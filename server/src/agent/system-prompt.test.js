import { describe, it, expect } from 'vitest'
import {
  VALID_PROFILES,
  DEFAULT_PROFILE,
  buildBasePrompt,
  buildProfileInstructions,
  buildSourceInstructions,
  buildSimilarCasesPrompt,
} from './system-prompt.js'
import { buildSourcePolicy } from './sources.js'
import { INTEGRATIONS } from './integrations.js'

const ALL_CONFIGURED = {
  shortcutConfigured: true,
  sentryConfigured: true,
  driveConfigured: true,
  notionConfigured: true,
  helpjuiceConfigured: true,
  postgresConfigured: true,
  shopifyConfigured: true,
  betterstackConfigured: true,
}

describe('constants', () => {
  it('VALID_PROFILES contains tech and support', () => {
    expect(VALID_PROFILES).toContain('tech')
    expect(VALID_PROFILES).toContain('support')
  })

  it('DEFAULT_PROFILE is support', () => {
    expect(DEFAULT_PROFILE).toBe('support')
  })
})

describe('buildBasePrompt', () => {
  it('includes every section when every integration is configured', () => {
    const prompt = buildBasePrompt(null, { configured: ALL_CONFIGURED })

    expect(prompt).toContain('## How to explore code')
    for (const section of [
      'Shortcut',
      'Notion',
      'Google Drive',
      'PostgreSQL',
      'Sentry',
      'Better Stack',
      'Helpjuice',
      'Shopify',
    ]) {
      expect(prompt).toContain(`## ${section} integration`)
    }
  })

  it('treats yolo and an empty selection as unrestricted', () => {
    const noPolicy = buildBasePrompt(null, { configured: ALL_CONFIGURED })

    expect(buildBasePrompt(buildSourcePolicy(['yolo']), { configured: ALL_CONFIGURED })).toBe(noPolicy)
    expect(buildBasePrompt(buildSourcePolicy([]), { configured: ALL_CONFIGURED })).toBe(noPolicy)
  })

  it('fails closed when no configuration is passed', () => {
    const prompt = buildBasePrompt(buildSourcePolicy(['integration:notion']))

    expect(prompt).not.toContain('## Notion integration')
    expect(prompt).not.toContain('## Sentry integration')
    expect(prompt).toContain('code assistant')
  })

  it('only includes selected integration sections for a restricted policy', () => {
    const prompt = buildBasePrompt(buildSourcePolicy(['integration:postgres']), { configured: ALL_CONFIGURED })

    expect(prompt).toContain('## PostgreSQL integration')
    expect(prompt).not.toContain('## Better Stack integration')
    expect(prompt).not.toContain('## Notion integration')
    expect(prompt).not.toContain('## Shopify integration')
    expect(prompt).not.toContain('## Helpjuice integration')
    expect(prompt).not.toContain('## Google Drive integration')
  })

  it('includes the configured Shortcut and Sentry sections without selecting them', () => {
    const prompt = buildBasePrompt(buildSourcePolicy(['owner/repo']), { configured: ALL_CONFIGURED })

    expect(prompt).toContain('## Shortcut integration')
    expect(prompt).toContain('## Sentry integration')
  })

  it('includes the code exploration section only when repos are selected', () => {
    expect(buildBasePrompt(buildSourcePolicy(['owner/repo']), { configured: ALL_CONFIGURED })).toContain(
      '## How to explore code'
    )
    expect(buildBasePrompt(buildSourcePolicy(['integration:notion']), { configured: ALL_CONFIGURED })).not.toContain(
      '## How to explore code'
    )
  })

  it('injects a prompt section for every registered integration', () => {
    const baseline = buildBasePrompt(buildSourcePolicy(['integration:notion']))

    for (const [id, { flag }] of Object.entries(INTEGRATIONS)) {
      const prompt = buildBasePrompt(buildSourcePolicy([`integration:${id}`]), { configured: { [flag]: true } })
      expect(prompt.length, id).toBeGreaterThan(baseline.length)
    }
  })

  it('omits unconfigured integration sections for an unrestricted policy', () => {
    const prompt = buildBasePrompt(buildSourcePolicy(['yolo']), {
      configured: { notionConfigured: true, sentryConfigured: true },
    })

    expect(prompt).toContain('## Notion integration')
    expect(prompt).toContain('## Sentry integration')
    expect(prompt).not.toContain('## Shopify integration')
    expect(prompt).not.toContain('## Google Drive integration')
    expect(prompt).not.toContain('## PostgreSQL integration')
    expect(prompt).not.toContain('## Better Stack integration')
    expect(prompt).not.toContain('## Helpjuice integration')
    expect(prompt).not.toContain('## Shortcut integration')
  })

  it('omits a selected integration section when the integration is not configured', () => {
    const prompt = buildBasePrompt(buildSourcePolicy(['integration:postgres']), { configured: {} })

    expect(prompt).not.toContain('## PostgreSQL integration')
    expect(prompt).not.toContain('query_database')
  })

  it('omits the always-available sections when Shortcut and Sentry are not configured', () => {
    const prompt = buildBasePrompt(buildSourcePolicy(['owner/repo']), { configured: {} })

    expect(prompt).not.toContain('## Shortcut integration')
    expect(prompt).not.toContain('## Sentry integration')
    expect(prompt).toContain('## How to explore code')
  })

  it('maps google-drive to the drive configuration flag', () => {
    const prompt = buildBasePrompt(buildSourcePolicy(['integration:google-drive']), {
      configured: { driveConfigured: true },
    })

    expect(prompt).toContain('## Google Drive integration')
  })

  it('points Shopify at the database tools only when they are registered too', () => {
    const configured = { shopifyConfigured: true, postgresConfigured: true }

    const withDatabase = buildBasePrompt(buildSourcePolicy(['integration:shopify', 'integration:postgres']), {
      configured,
    })
    expect(withDatabase).toContain('use the database tools to search the stores table')
    expect(withDatabase).toContain('Fetch the same data from the backend using `query_database`')

    const withoutDatabase = buildBasePrompt(buildSourcePolicy(['integration:shopify']), { configured })
    expect(withoutDatabase).toContain('## Shopify integration')
    expect(withoutDatabase).toContain('The database tools are NOT available in this conversation')
    expect(withoutDatabase).not.toContain('query_database')
  })
})

describe('buildProfileInstructions', () => {
  it('returns tech instructions for tech profile', () => {
    const result = buildProfileInstructions('tech')
    expect(result).toContain('Technical')
    expect(result).toContain('code snippets')
    expect(result).toContain('engineer')
  })

  it('returns support instructions for support profile', () => {
    const result = buildProfileInstructions('support')
    expect(result).toContain('Support')
    expect(result).toContain('non-technical')
    expect(result).toContain('behavior')
  })

  it('defaults to support for unknown profile', () => {
    const result = buildProfileInstructions('unknown')
    expect(result).toContain('Support')
  })

  it('defaults to support for undefined profile', () => {
    const result = buildProfileInstructions(undefined)
    expect(result).toContain('Support')
  })
})

describe('buildSimilarCasesPrompt', () => {
  it('returns empty string when there are no cases', () => {
    expect(buildSimilarCasesPrompt([])).toBe('')
    expect(buildSimilarCasesPrompt(null)).toBe('')
    expect(buildSimilarCasesPrompt(undefined)).toBe('')
  })

  it('includes the cases with question and answer', () => {
    const result = buildSimilarCasesPrompt([{ question: 'How do refunds work?', answer: 'Via the refunds service.' }])
    expect(result).toContain('## Similar resolved cases')
    expect(result).toContain('How do refunds work?')
    expect(result).toContain('Via the refunds service.')
  })

  it('instructs the agent to attribute answers based on unverifiable cases', () => {
    const result = buildSimilarCasesPrompt([{ question: 'q', answer: 'a' }])
    expect(result).toContain('comes from a previously resolved case')
    expect(result).toContain('may be outdated')
    expect(result).toContain('cannot verify it with the tools available')
  })
})

describe('buildSourceInstructions', () => {
  it('returns fallback when no sources selected', () => {
    expect(buildSourceInstructions([])).toContain('not selected')
    expect(buildSourceInstructions(null)).toContain('not selected')
    expect(buildSourceInstructions(undefined)).toContain('not selected')
  })

  it('lists selected repos', () => {
    const result = buildSourceInstructions(['owner/repo1', 'owner/repo2'])
    expect(result).toContain('owner/repo1')
    expect(result).toContain('owner/repo2')
    expect(result).toContain('selected the following repos')
  })

  it('adds Notion integration instructions', () => {
    const result = buildSourceInstructions(['owner/repo', 'integration:notion'], { notionConfigured: true })
    expect(result).toContain('Notion')
    expect(result).toContain('search_notion_pages')
  })

  it('adds Better Stack integration instructions and its prompt section', () => {
    const configured = { betterstackConfigured: true }

    const result = buildSourceInstructions(['integration:betterstack'], configured)
    expect(result).toContain('Better Stack')
    expect(result).toContain('search_logs')

    const prompt = buildBasePrompt(buildSourcePolicy(['integration:betterstack']), { configured })
    expect(prompt).toContain('## Better Stack integration')
    expect(prompt).toContain('query_logs')
  })

  it('adds Postgres integration instructions', () => {
    const result = buildSourceInstructions(['integration:postgres'], { postgresConfigured: true })
    expect(result).toContain('Database')
    expect(result).toContain('list_database_schemas')
  })

  it('handles selections with only integrations', () => {
    const result = buildSourceInstructions(['integration:notion'], { notionConfigured: true })
    expect(result).toContain('Repository tools are not available')
    expect(result).toContain('search_notion_pages')
  })

  it('ignores unknown integrations', () => {
    const result = buildSourceInstructions(['integration:unknown', 'integration:notion'], { notionConfigured: true })
    expect(result).not.toContain('unknown')
    expect(result).toContain('search_notion_pages')
  })

  it('forbids consulting sources outside a specific selection', () => {
    const result = buildSourceInstructions(['owner/repo1'])
    expect(result).toContain('any other repository will be rejected')
    expect(result).toContain('Do not try to consult sources outside this selection')
    expect(result).not.toContain('no need to call list_repos')
  })

  it('notes that Shortcut and Sentry stay available in restricted mode', () => {
    const configured = { shortcutConfigured: true, sentryConfigured: true }

    expect(buildSourceInstructions(['owner/repo1'], configured)).toContain('Shortcut and Sentry')
    expect(buildSourceInstructions(['integration:notion'], configured)).toContain('Shortcut and Sentry')
    expect(buildSourceInstructions(['yolo'], configured)).not.toContain('Shortcut and Sentry are not part')
  })

  it('returns YOLO instructions when yolo source is selected', () => {
    const result = buildSourceInstructions(['yolo'])
    expect(result).toContain('YOLO mode')
    expect(result).toContain('list_repos')
  })

  it('YOLO takes precedence over other selections', () => {
    const result = buildSourceInstructions(['yolo', 'owner/repo'])
    expect(result).toContain('YOLO mode')
    expect(result).not.toContain('owner/repo')
  })

  it('omits instructions for a selected integration that is not configured', () => {
    const result = buildSourceInstructions(['integration:notion', 'integration:postgres'], {
      postgresConfigured: true,
    })

    expect(result).toContain('list_database_schemas')
    expect(result).not.toContain('search_notion_pages')
    expect(result).toContain('Notion is selected but not configured in this app')
  })

  it('warns about every unavailable selection at once', () => {
    const result = buildSourceInstructions(
      ['owner/repo', 'integration:notion', 'integration:postgres', 'integration:shopify'],
      {}
    )

    expect(result).toContain('Notion, Database and Shopify are selected but not configured in this app')
    expect(result).toContain('owner/repo')
  })

  it('states that nothing is available when neither a repo nor a configured integration is left', () => {
    const result = buildSourceInstructions(['integration:notion'], {})

    expect(result).toContain('No source is available in this conversation')
    expect(result).toContain('do not answer from memory')
    expect(result).toContain('Notion is selected but not configured in this app')
    expect(result).not.toContain('use the selected integrations below')
  })

  it('falls back to the always-available tools when the selected integration is not configured', () => {
    const result = buildSourceInstructions(['integration:notion'], { sentryConfigured: true })

    expect(result).toContain('the only tools you have are the always-available ones')
    expect(result).toContain('Sentry is not part of the source selection')
    expect(result).not.toContain('No source is available in this conversation')
  })

  it('mentions only the configured always-available integrations', () => {
    const both = buildSourceInstructions(['owner/repo'], { shortcutConfigured: true, sentryConfigured: true })
    expect(both).toContain('Shortcut and Sentry are not part of the source selection')

    const onlyShortcut = buildSourceInstructions(['owner/repo'], { shortcutConfigured: true })
    expect(onlyShortcut).toContain('Shortcut is not part of the source selection')
    expect(onlyShortcut).not.toContain('Sentry is not part of the source selection')

    const neither = buildSourceInstructions(['owner/repo'], {})
    expect(neither).not.toContain('not part of the source selection')
  })

  it('lists only the configured integrations in YOLO mode', () => {
    const result = buildSourceInstructions(['yolo'], { postgresConfigured: true, shopifyConfigured: true })

    expect(result).toContain(
      '- The integration tools available in this conversation are Database, Shopify — they are fair game when the question warrants them.'
    )
  })

  it('says no integrations are available in YOLO mode when none is configured', () => {
    const result = buildSourceInstructions(['yolo'], {})

    expect(result).toContain('No integrations are available in this conversation')
    expect(result).toContain('list_repos')
  })
})
