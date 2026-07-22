import { describe, it, expect, vi, beforeEach } from 'vitest'

const getRepoCatalog = vi.fn()
vi.mock('../github/settings.js', () => ({ getRepoCatalog }))

const { buildRepoCatalogPrompt } = await import('./repo-catalog.js')

beforeEach(() => {
  getRepoCatalog.mockReset()
})

describe('buildRepoCatalogPrompt', () => {
  it('wraps the stored catalog text in the prompt section', async () => {
    getRepoCatalog.mockResolvedValue('### org/api\nThe backend: payments, auth, webhooks.')

    const prompt = await buildRepoCatalogPrompt()

    expect(prompt).toContain('## Repository catalog')
    expect(prompt).toContain('pick the most relevant repo(s)')
    expect(prompt).toContain('### org/api\nThe backend: payments, auth, webhooks.')
  })

  it('returns an empty string when no catalog is stored', async () => {
    getRepoCatalog.mockResolvedValue('')

    expect(await buildRepoCatalogPrompt()).toBe('')
  })

  it('treats whitespace-only catalogs as empty', async () => {
    getRepoCatalog.mockResolvedValue('  \n\n  ')

    expect(await buildRepoCatalogPrompt()).toBe('')
  })
})
