import { JEV_QUESTION_CHOICE } from '../constants.js'

const SCORE_SCALE = 100

function toApiQuestion(question) {
  if (question.type === JEV_QUESTION_CHOICE) {
    return {
      type: JEV_QUESTION_CHOICE,
      instructions: { question: question.text },
      criteria: Object.fromEntries(question.answers.map(answer => [answer.label, null])),
    }
  }

  return { type: question.type, instructions: { question: question.text }, criteria: null }
}

function readChoice(question, answer) {
  const label = typeof answer?.choice === 'string' ? answer.choice : null
  const flagged = question.answers.some(option => option.label === label && option.flag)

  return { answer: label, confidence: Number(answer?.confidence ?? 0), flagged }
}

function readNoul(question, answer) {
  const probability = Number(answer?.noul ?? Number.NaN)
  if (!Number.isFinite(probability)) return { answer: null, confidence: 0, flagged: false }

  const score = Math.round(probability * SCORE_SCALE)

  return {
    answer: String(score),
    confidence: Math.abs(2 * probability - 1),
    flagged: question.flagAt !== null && score >= question.flagAt,
  }
}

function readAnswer(question, answer, minConfidence) {
  const read = question.type === JEV_QUESTION_CHOICE ? readChoice(question, answer) : readNoul(question, answer)
  const confidence = Number.isFinite(read.confidence) ? read.confidence : 0

  return {
    questionId: question.id,
    question: question.text,
    answer: read.answer,
    confidence,
    flagged: read.flagged,
    unsure: read.answer === null || confidence < minConfidence,
  }
}

export function buildJevQuestions(questions) {
  return Object.fromEntries(questions.map(question => [question.id, toApiQuestion(question)]))
}

export function readJevAnswers(questions, answers, minConfidence) {
  return questions.map(question => readAnswer(question, answers?.[question.id], minConfidence))
}
