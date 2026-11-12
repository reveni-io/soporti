import { ChartGenerationError, generateChart } from './agent.js'
import { failCard, failInterruptedCards, saveGeneratedChart, setCardStep } from '../db/analytics-cards.js'

const LOG_PREFIX = '[analytics]'
const GENERIC_ERROR = 'The chart could not be generated. Try again or rephrase the question.'
const INTERRUPTED_ERROR = 'The chart generation was interrupted by a restart. Try again.'

const activeGenerations = new Map()

function stepReporter(cardId) {
  return async step => {
    try {
      await setCardStep(cardId, step)
    } catch (err) {
      console.error(`${LOG_PREFIX} Failed to save the step of a chart:`, cardId, err)
    }
  }
}

async function attemptGeneration(card, userId, signal) {
  try {
    return { chart: await generateChart(card, { userId, signal, onStep: stepReporter(card.id) }) }
  } catch (error) {
    return { error }
  } finally {
    activeGenerations.delete(card.id)
  }
}

function describeFailure(cardId, error) {
  if (error instanceof ChartGenerationError) return error.message

  console.error(`${LOG_PREFIX} Failed to generate a chart:`, cardId, error)

  return GENERIC_ERROR
}

async function recordOutcome(cardId, { chart, error }) {
  if (chart) return saveGeneratedChart(cardId, chart)

  return failCard(cardId, describeFailure(cardId, error))
}

async function generateInBackground(card, userId, controller) {
  const outcome = await attemptGeneration(card, userId, controller.signal)
  if (controller.signal.aborted) return

  try {
    await recordOutcome(card.id, outcome)
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to save the outcome of a chart:`, card.id, err)
  }
}

export function startGeneration(card, userId) {
  if (activeGenerations.has(card.id)) return

  const controller = new AbortController()
  activeGenerations.set(card.id, controller)
  generateInBackground(card, userId, controller)
}

export function cancelGeneration(cardId) {
  activeGenerations.get(cardId)?.abort()
}

export async function recoverInterruptedGenerations() {
  const count = await failInterruptedCards(INTERRUPTED_ERROR)
  if (count > 0) console.log(`${LOG_PREFIX} Marked ${count} chart generation(s) interrupted by the restart as failed.`)

  return count
}
