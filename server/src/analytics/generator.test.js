import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

class FakeChartGenerationError extends Error {}

vi.mock('./agent.js', () => ({ generateChart: vi.fn(), ChartGenerationError: FakeChartGenerationError }))
vi.mock('../db/analytics-cards.js', () => {
  return { saveGeneratedChart: vi.fn(), failCard: vi.fn(), setCardStep: vi.fn(), failInterruptedCards: vi.fn() }
})

const { generateChart } = await import('./agent.js')
const { saveGeneratedChart, failCard, setCardStep, failInterruptedCards } = await import('../db/analytics-cards.js')
const { startGeneration, cancelGeneration, recoverInterruptedGenerations } = await import('./generator.js')

const CARD_ID = '8c1d2e3f-4a5b-4c6d-9e7f-a0b1c2d3e4f5'
const CARD = { id: CARD_ID, title: 'Returns per week', prompt: 'Returns per week', sql: null, chart: null }
const SUBMISSION = {
  title: 'Returns per week',
  sql: 'SELECT week, returns FROM weekly_returns',
  chart: { type: 'bar', xKey: 'week', groupKey: null, series: [{ key: 'returns', label: 'Returns' }], stacked: false },
}

let consoleError

async function settle() {
  await vi.waitFor(() => {
    expect(saveGeneratedChart.mock.calls.length + failCard.mock.calls.length).toBeGreaterThan(0)
  })
}

function nextTick() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

beforeEach(() => {
  vi.clearAllMocks()
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  saveGeneratedChart.mockResolvedValue(true)
  failCard.mockResolvedValue(true)
  setCardStep.mockResolvedValue(true)
})

afterEach(() => {
  consoleError.mockRestore()
})

describe('startGeneration', () => {
  it('generates the chart of the card for its user and saves it', async () => {
    generateChart.mockResolvedValue(SUBMISSION)

    startGeneration(CARD, 7)
    await settle()

    expect(generateChart).toHaveBeenCalledTimes(1)
    expect(generateChart.mock.calls[0][0]).toBe(CARD)
    expect(generateChart.mock.calls[0][1]).toMatchObject({ userId: 7 })
    expect(generateChart.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
    expect(saveGeneratedChart).toHaveBeenCalledTimes(1)
    expect(saveGeneratedChart).toHaveBeenCalledWith(CARD_ID, SUBMISSION)
    expect(failCard).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('writes by card alone, so a collaborator run survives the dashboard being unshared meanwhile', async () => {
    generateChart.mockImplementation(async (_card, { onStep }) => {
      await onStep('Trying a query')
      return SUBMISSION
    })

    startGeneration(CARD, 9)
    await settle()

    expect(generateChart.mock.calls[0][1]).toMatchObject({ userId: 9 })
    expect(setCardStep.mock.calls).toEqual([[CARD_ID, 'Trying a query']])
    expect(saveGeneratedChart.mock.calls).toEqual([[CARD_ID, SUBMISSION]])
  })

  it('fails by card alone too', async () => {
    generateChart.mockRejectedValue(new FakeChartGenerationError('The database has no table about returns.'))

    startGeneration(CARD, 9)
    await settle()

    expect(failCard.mock.calls).toEqual([[CARD_ID, 'The database has no table about returns.']])
  })

  it('stores the step the agent reports while it works', async () => {
    generateChart.mockImplementation(async (_card, { onStep }) => {
      await onStep('Reading the columns of orders')
      return SUBMISSION
    })

    startGeneration(CARD, 7)
    await settle()

    expect(setCardStep).toHaveBeenCalledTimes(1)
    expect(setCardStep).toHaveBeenCalledWith(CARD_ID, 'Reading the columns of orders')
  })

  it('goes on when a step cannot be stored', async () => {
    const failure = new Error('db down')
    setCardStep.mockRejectedValue(failure)
    generateChart.mockImplementation(async (_card, { onStep }) => {
      await onStep('Trying a query')
      return SUBMISSION
    })

    startGeneration(CARD, 7)
    await settle()

    expect(saveGeneratedChart).toHaveBeenCalledWith(CARD_ID, SUBMISSION)
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith('[analytics] Failed to save the step of a chart:', CARD_ID, failure)
  })

  it('fails the card with the sentence of a generation error', async () => {
    generateChart.mockRejectedValue(new FakeChartGenerationError('The database has no table about returns.'))

    startGeneration(CARD, 7)
    await settle()

    expect(failCard).toHaveBeenCalledTimes(1)
    expect(failCard).toHaveBeenCalledWith(CARD_ID, 'The database has no table about returns.')
    expect(saveGeneratedChart).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('fails the card with a generic sentence and logs an unexpected error', async () => {
    const failure = new Error('connect ECONNREFUSED 10.0.0.5:443')
    generateChart.mockRejectedValue(failure)

    startGeneration(CARD, 7)
    await settle()

    expect(failCard).toHaveBeenCalledTimes(1)
    expect(failCard).toHaveBeenCalledWith(
      CARD_ID,
      'The chart could not be generated. Try again or rephrase the question.'
    )
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith('[analytics] Failed to generate a chart:', CARD_ID, failure)
  })

  it('runs one generation per card at a time', async () => {
    let finish
    generateChart.mockImplementation(() => new Promise(resolve => (finish = resolve)))

    startGeneration(CARD, 7)
    startGeneration(CARD, 7)
    finish(SUBMISSION)
    await settle()

    expect(generateChart).toHaveBeenCalledTimes(1)
    expect(saveGeneratedChart).toHaveBeenCalledTimes(1)

    generateChart.mockResolvedValue(SUBMISSION)
    startGeneration(CARD, 7)
    await vi.waitFor(() => expect(saveGeneratedChart).toHaveBeenCalledTimes(2))
    expect(generateChart).toHaveBeenCalledTimes(2)
  })

  it('logs when the outcome cannot be saved', async () => {
    const failure = new Error('db down')
    generateChart.mockResolvedValue(SUBMISSION)
    saveGeneratedChart.mockRejectedValue(failure)

    startGeneration(CARD, 7)
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledTimes(1))

    expect(consoleError).toHaveBeenCalledWith('[analytics] Failed to save the outcome of a chart:', CARD_ID, failure)
  })
})

describe('cancelGeneration', () => {
  it('aborts the run and records nothing afterwards', async () => {
    generateChart.mockImplementation((_card, { signal }) => {
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')))
      })
    })

    startGeneration(CARD, 7)
    cancelGeneration(CARD_ID)
    await nextTick()

    expect(generateChart.mock.calls[0][1].signal.aborted).toBe(true)
    expect(saveGeneratedChart).not.toHaveBeenCalled()
    expect(failCard).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('records nothing when the agent had finished by the time the card was cancelled', async () => {
    generateChart.mockImplementation(async () => {
      cancelGeneration(CARD_ID)
      return SUBMISSION
    })

    startGeneration(CARD, 7)
    await nextTick()

    expect(saveGeneratedChart).not.toHaveBeenCalled()
    expect(failCard).not.toHaveBeenCalled()
  })

  it('ignores a card without a running generation', () => {
    expect(() => cancelGeneration(CARD_ID)).not.toThrow()
  })
})

describe('recoverInterruptedGenerations', () => {
  it('fails the cards a restart interrupted', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    failInterruptedCards.mockResolvedValue(2)

    expect(await recoverInterruptedGenerations()).toBe(2)
    expect(failInterruptedCards).toHaveBeenCalledTimes(1)
    expect(failInterruptedCards).toHaveBeenCalledWith('The chart generation was interrupted by a restart. Try again.')
    expect(consoleLog).toHaveBeenCalledTimes(1)
    consoleLog.mockRestore()
  })

  it('stays quiet when nothing was interrupted', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    failInterruptedCards.mockResolvedValue(0)

    expect(await recoverInterruptedGenerations()).toBe(0)
    expect(consoleLog).not.toHaveBeenCalled()
    consoleLog.mockRestore()
  })
})
