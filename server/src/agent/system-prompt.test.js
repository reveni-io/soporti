import { describe, it, expect } from 'vitest'
import {
  BASE_PROMPT,
  VALID_PROFILES,
  DEFAULT_PROFILE,
  buildBasePrompt,
  buildProfileInstructions,
  buildSourceInstructions,
  buildSimilarCasesPrompt,
} from './system-prompt.js'
import { buildSourcePolicy } from './sources.js'

describe('constants', () => {
  it('BASE_PROMPT is a non-empty string', () => {
    expect(typeof BASE_PROMPT).toBe('string')
    expect(BASE_PROMPT.length).toBeGreaterThan(0)
  })

  it('VALID_PROFILES contains tech and support', () => {
    expect(VALID_PROFILES).toContain('tech')
    expect(VALID_PROFILES).toContain('support')
  })

  it('DEFAULT_PROFILE is support', () => {
    expect(DEFAULT_PROFILE).toBe('support')
  })
})

describe('buildBasePrompt', () => {
  it('includes every section when called without a policy (BASE_PROMPT)', () => {
    expect(BASE_PROMPT).toBe(buildBasePrompt())
    expect(BASE_PROMPT).toContain('## How to explore code')
    for (const section of ['Shortcut', 'Notion', 'Google Drive', 'PostgreSQL', 'Sentry', 'Helpjuice', 'Shopify']) {
      expect(BASE_PROMPT).toContain(`## ${section} integration`)
    }
  })

  it('includes every section for an unrestricted policy (yolo / empty)', () => {
    expect(buildBasePrompt(buildSourcePolicy(['yolo']))).toBe(BASE_PROMPT)
    expect(buildBasePrompt(buildSourcePolicy([]))).toBe(BASE_PROMPT)
  })

  it('only includes selected integration sections for a restricted policy', () => {
    const prompt = buildBasePrompt(buildSourcePolicy(['integration:postgres']))
    expect(prompt).toContain('## PostgreSQL integration')
    expect(prompt).not.toContain('## Notion integration')
    expect(prompt).not.toContain('## Shopify integration')
    expect(prompt).not.toContain('## Helpjuice integration')
    expect(prompt).not.toContain('## Google Drive integration')
  })

  it('always includes Shortcut and Sentry sections (not selectable sources)', () => {
    const prompt = buildBasePrompt(buildSourcePolicy(['owner/repo']))
    expect(prompt).toContain('## Shortcut integration')
    expect(prompt).toContain('## Sentry integration')
  })

  it('includes the code exploration section only when repos are selected', () => {
    expect(buildBasePrompt(buildSourcePolicy(['owner/repo']))).toContain('## How to explore code')
    expect(buildBasePrompt(buildSourcePolicy(['integration:notion']))).not.toContain('## How to explore code')
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
    const result = buildSourceInstructions(['owner/repo', 'integration:notion'])
    expect(result).toContain('Notion')
    expect(result).toContain('search_notion_pages')
  })

  it('adds Postgres integration instructions', () => {
    const result = buildSourceInstructions(['integration:postgres'])
    expect(result).toContain('Database')
    expect(result).toContain('list_database_schemas')
  })

  it('handles selections with only integrations', () => {
    const result = buildSourceInstructions(['integration:notion'])
    expect(result).toContain('Repository tools are not available')
    expect(result).toContain('Notion')
  })

  it('ignores unknown integrations', () => {
    const result = buildSourceInstructions(['integration:unknown'])
    expect(result).not.toContain('unknown')
    expect(result).toContain('Repository tools are not available')
  })

  it('forbids consulting sources outside a specific selection', () => {
    const result = buildSourceInstructions(['owner/repo1'])
    expect(result).toContain('any other repository will be rejected')
    expect(result).toContain('Do not try to consult sources outside this selection')
    expect(result).not.toContain('no need to call list_repos')
  })

  it('notes that Shortcut and Sentry stay available in restricted mode', () => {
    expect(buildSourceInstructions(['owner/repo1'])).toContain('Shortcut and Sentry')
    expect(buildSourceInstructions(['integration:notion'])).toContain('Shortcut and Sentry')
    expect(buildSourceInstructions(['yolo'])).not.toContain('Shortcut and Sentry are not part')
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
})
