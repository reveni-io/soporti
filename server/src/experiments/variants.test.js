import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchExperimentPrompt = vi.fn()
vi.mock('../langfuse/sdk.js', async importOriginal => ({ ...(await importOriginal()), fetchExperimentPrompt }))

const { resolveVariant, variantKey } = await import('./variants.js')

const CLIENT = { name: 'langfuse' }

beforeEach(() => {
  fetchExperimentPrompt.mockReset()
})

describe('variantKey', () => {
  it.each([
    [{ baseline: true }, 'baseline'],
    [{ label: 'compact' }, 'compact'],
    [{ version: 4 }, 'v4'],
  ])('names %o as %s', (variant, key) => {
    expect(variantKey(variant)).toBe(key)
  })
})

describe('resolveVariant', () => {
  it('runs the baseline without reading Langfuse', async () => {
    const resolved = await resolveVariant(CLIENT, { baseline: true })

    expect(resolved).toEqual({ value: { key: 'baseline', promptVersion: null, overrides: null } })
    expect(fetchExperimentPrompt).not.toHaveBeenCalled()
  })

  it('returns the overrides and the version the label points at', async () => {
    fetchExperimentPrompt.mockResolvedValue({
      version: 9,
      config: {
        sections: { core_guidelines: ' Short rules. ', 'integration:postgres': 'Query carefully.' },
        tools: { search_code: 'Find code.', get_current_time: 'Now.' },
      },
    })

    const resolved = await resolveVariant(CLIENT, { label: 'compact' })

    expect(fetchExperimentPrompt).toHaveBeenCalledWith(CLIENT, { label: 'compact' })
    expect(resolved).toEqual({
      value: {
        key: 'compact',
        promptVersion: 9,
        overrides: {
          sections: { core_guidelines: 'Short rules.', 'integration:postgres': 'Query carefully.' },
          tools: { search_code: 'Find code.', get_current_time: 'Now.' },
        },
      },
    })
  })

  it.each([
    { kind: 'an unknown section', config: { sections: { core_typo: 'x' } } },
    { kind: 'a section an experiment never renders', config: { sections: { slack_post: 'x' } } },
    { kind: 'a user-scoped integration section', config: { sections: { 'integration:zendesk': 'x' } } },
    { kind: 'a write tool', config: { tools: { create_shortcut_story: 'x' } } },
    { kind: 'a user-scoped tool', config: { tools: { search_granola_notes: 'x' } } },
    {
      kind: 'an unknown top-level key next to a valid override',
      config: { sections: { core_intro: 'x' }, tool: { search_code: 'y' } },
    },
    { kind: 'an empty override', config: { sections: { core_intro: '   ' } } },
    { kind: 'no override at all', config: {} },
    { kind: 'a missing config', config: null },
  ])('rejects $kind with a 400', async ({ config }) => {
    fetchExperimentPrompt.mockResolvedValue({ version: 3, config })

    const resolved = await resolveVariant(CLIENT, { label: 'compact' })

    expect(resolved.status).toBe(400)
    expect(resolved.error).toContain('soporti-system (compact)')
  })

  it.each([
    { statusCode: 404, status: 404 },
    { statusCode: 500, status: 502 },
    { statusCode: undefined, status: 502 },
  ])('maps a Langfuse failure with status $statusCode to $status', async ({ statusCode, status }) => {
    fetchExperimentPrompt.mockRejectedValue(Object.assign(new Error('nope'), { statusCode }))

    const resolved = await resolveVariant(CLIENT, { version: 2 })

    expect(resolved.status).toBe(status)
    expect(resolved.error).toContain('v2')
  })
})
