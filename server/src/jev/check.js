import { getCurrentTrace, withGenerationSpan } from '@openai/agents'
import { JEV_CHECK_ANSWERED, JEV_CHECK_UNAVAILABLE, JEV_LATEST_MODEL, MS_PER_SECOND } from '../constants.js'
import { countJevCallsSince, recordJevCall } from '../db/jev-calls.js'
import { getJevDocument } from '../db/jev-documents.js'
import { askQuestions, JevApiError } from './client.js'
import { defaultJevDocument } from './documents.js'
import { buildJevQuestions, readJevAnswers } from './questions.js'
import { isConfigured } from './settings.js'

const CALL_FAILED = 'failed'

async function loadProject(project) {
  const [document, keyConfigured] = await Promise.all([getJevDocument(project), isConfigured()])

  return {
    keyConfigured,
    set: { ...defaultJevDocument(project).set, ...document?.data?.set },
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

async function findBlocker(project, { keyConfigured, set }, { stateChars, questionCount }) {
  if (!keyConfigured) return 'No API key saved'
  if (questionCount === 0) return 'No questions in the set'
  if (set.minConfidence === null) return 'No min confidence set'
  if (set.maxCharacters && stateChars > set.maxCharacters) {
    return `Too large for Jev (${describeSize(stateChars)} characters, max ${describeSize(set.maxCharacters)})`
  }
  if (await isOverDailyLimit(project, set.dailyLimit)) return `Daily limit exceeded (${set.dailyLimit} calls)`

  return null
}

function unavailable({ setVersion }, reason) {
  return { status: JEV_CHECK_UNAVAILABLE, setVersion, model: JEV_LATEST_MODEL, reason }
}

function askJevInTrace(request) {
  if (!getCurrentTrace()) return askQuestions(request)

  return withGenerationSpan(
    async span => {
      const response = await askQuestions(request)
      span.spanData.model = response.model
      span.spanData.output = [{ answers: response.answers }]

      return response
    },
    { data: { model: request.model, input: [{ state: request.state, questions: request.questions }] } }
  )
}

async function callJev(project, loaded, { state, questions }) {
  const { set, setVersion } = loaded
  const call = { project, setVersion, model: JEV_LATEST_MODEL }

  try {
    const response = await askJevInTrace({
      model: JEV_LATEST_MODEL,
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

export async function runJevCheck({ project, state }) {
  const loaded = await loadProject(project)
  const { questions } = loaded.set
  const blocker = await findBlocker(project, loaded, {
    stateChars: JSON.stringify(state).length,
    questionCount: questions.length,
  })
  if (blocker) return unavailable(loaded, blocker)

  return callJev(project, loaded, { state, questions })
}
