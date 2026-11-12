import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../db/analytics-cards.js', () => ({ countCards: vi.fn() }))
vi.mock('../llm/model.js', () => ({ isConfigured: vi.fn() }))
vi.mock('../postgres/settings.js', () => ({ isPostgresConfigured: vi.fn() }))
vi.mock('./generator.js', () => ({ countActiveGenerations: vi.fn() }))

const { countCards } = await import('../db/analytics-cards.js')
const { isConfigured: isLlmConfigured } = await import('../llm/model.js')
const { isPostgresConfigured } = await import('../postgres/settings.js')
const { countActiveGenerations } = await import('./generator.js')
const { findGenerationRefusal } = await import('./generation-guard.js')

const DASHBOARD_ID = '5b0c9d1e-2f3a-4b4c-8d5e-6f7a8b9c0d1e'

beforeEach(() => {
  vi.clearAllMocks()
  isPostgresConfigured.mockResolvedValue(true)
  isLlmConfigured.mockResolvedValue(true)
  countCards.mockResolvedValue({ total: 0, generating: 0 })
  countActiveGenerations.mockReturnValue(0)
})

describe('findGenerationRefusal', () => {
  it('lets a generation start when everything is configured and the dashboard has room', async () => {
    countCards.mockResolvedValue({ total: 39, generating: 2 })

    expect(await findGenerationRefusal(DASHBOARD_ID, 7, { creating: true })).toBeNull()
    expect(countCards).toHaveBeenCalledTimes(1)
    expect(countCards).toHaveBeenCalledWith(DASHBOARD_ID, 7)
  })

  it('refuses when no database is connected, before counting anything', async () => {
    isPostgresConfigured.mockResolvedValue(false)

    expect(await findGenerationRefusal(DASHBOARD_ID, 7)).toBe('Connect a database in /admin (Database section) first.')
    expect(isLlmConfigured).not.toHaveBeenCalled()
    expect(countCards).not.toHaveBeenCalled()
  })

  it('refuses when the assistant is not configured', async () => {
    isLlmConfigured.mockResolvedValue(false)

    expect(await findGenerationRefusal(DASHBOARD_ID, 7)).toBe(
      'The assistant is not configured yet. Ask an admin to set it up in /admin (LLM section).'
    )
    expect(countCards).not.toHaveBeenCalled()
  })

  it('refuses a new card in a dashboard that already has 40', async () => {
    countCards.mockResolvedValue({ total: 40, generating: 0 })

    expect(await findGenerationRefusal(DASHBOARD_ID, 7, { creating: true })).toBe(
      'A dashboard can only have 40 charts. Delete one first.'
    )
  })

  it('does not count the cards of a full dashboard against a card that already exists', async () => {
    countCards.mockResolvedValue({ total: 40, generating: 0 })

    expect(await findGenerationRefusal(DASHBOARD_ID, 7)).toBeNull()
  })

  it('refuses a fourth generation at the same time by the same user, across dashboards', async () => {
    countActiveGenerations.mockReturnValue(3)

    expect(await findGenerationRefusal(DASHBOARD_ID, 7, { creating: true })).toBe(
      'You can only generate 3 charts at a time. Wait for one to finish.'
    )
    expect(countActiveGenerations).toHaveBeenCalledWith(7)
    expect(countCards).not.toHaveBeenCalled()
  })

  it.each([{ creating: true }, { creating: false }])(
    'refuses a fourth generation at the same time in the dashboard (creating: $creating)',
    async options => {
      countCards.mockResolvedValue({ total: 5, generating: 3 })

      expect(await findGenerationRefusal(DASHBOARD_ID, 7, options)).toBe(
        'A dashboard can only generate 3 charts at a time. Wait for one to finish.'
      )
    }
  )
})
