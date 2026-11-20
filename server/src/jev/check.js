import { JEV_CHECK_ANSWERED, JEV_CHECK_UNAVAILABLE, MS_PER_SECOND } from '../constants.js'
import { countJevCallsSince, recordJevCall } from '../db/jev-calls.js'
import { getJevDocument } from '../db/jev-documents.js'
import { askQuestions, JevApiError } from './client.js'
import { defaultJevDocument } from './documents.js'
import { buildJevQuestions, readJevAnswers } from './questions.js'
import { areJevCallsEnabled, isConfigured } from './settings.js'

const CALL_FAILED = 'failed'

async function loadProject(project) {
  const [document, keyConfigured, enabled] = await Promise.all([
    getJevDocument(project),
    isConfigured(),
    areJevCallsEnabled(),
  ])

  return {
    enabled,
    keyConfigured,
    set: document?.data?.set ?? defaultJevDocument(project).set,
    setVersion: document?.setVersion ?? 0,
  }
}

function startOfUtcDay(now) {
  const day = new Date(now)
  day.setUTCHours(0, 0, 0, 0)

  return day
}

function describeSize(characters) {
  return characters.toLocaleString('en-US')
}

async function isOverDailyLimit(project, dailyLimit) {
  if (dailyLimit === 0) return false

  return (await countJevCallsSince(project, startOfUtcDay(Date.now()))) >= dailyLimit
}

async function findBlocker(project, { enabled, keyConfigured, set }, { stateChars, questionCount }) {
  if (!enabled) return 'Jev calls are off'
  if (!keyConfigured) return 'No API key saved'
  if (questionCount === 0) return 'No questions in the set'
  if (!set.model) return 'No model selected'
  if (set.minConfidence === null) return 'No min confidence set'
  if (set.maxCharacters && stateChars > set.maxCharacters) {
    return `Too large for Jev (${describeSize(stateChars)} characters, max ${describeSize(set.maxCharacters)})`
  }
  if (await isOverDailyLimit(project, set.dailyLimit)) return `Daily limit exceeded (${set.dailyLimit} calls)`

  return null
}

function unavailable({ set, setVersion }, reason) {
  return { status: JEV_CHECK_UNAVAILABLE, setVersion, model: set.model, reason }
}

async function callJev(project, loaded, { state, questions }) {
  const { set, setVersion } = loaded
  const call = { project, setVersion, model: set.model }

  try {
    const response = await askQuestions({
      model: set.model,
      state,
      questions: buildJevQuestions(questions),
      timeoutMs: set.timeoutSeconds * MS_PER_SECOND,
    })
    await recordJevCall({ ...call, answeredModel: response.model, status: JEV_CHECK_ANSWERED })

    return {
      status: JEV_CHECK_ANSWERED,
      setVersion,
      model: response.model,
      minConfidence: set.minConfidence,
      rows: readJevAnswers(questions, response.answers, set.minConfidence),
      set,
    }
  } catch (err) {
    if (!(err instanceof JevApiError)) throw err

    await recordJevCall({ ...call, status: CALL_FAILED, reason: err.message })
    return unavailable(loaded, err.message)
  }
}

export async function runJevCheck({ project, state, buildExtraQuestions = () => [] }) {
  const loaded = await loadProject(project)
  const questions = [...buildExtraQuestions(loaded.set), ...loaded.set.questions]
  const blocker = await findBlocker(project, loaded, {
    stateChars: JSON.stringify(state).length,
    questionCount: questions.length,
  })
  if (blocker) return unavailable(loaded, blocker)

  return callJev(project, loaded, { state, questions })
}
