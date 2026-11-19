const QUESTION_CHOICE = 'choice'
const SCORE_SCALE = 100

function describeQuestion({ text, instructions, criteria }) {
  return Object.fromEntries(
    Object.entries({ question: text, instructions, criteria }).filter(([, value]) => value.length > 0)
  )
}

function toApiQuestion(question) {
  if (question.type === QUESTION_CHOICE) {
    return {
      type: QUESTION_CHOICE,
      instructions: describeQuestion(question),
      criteria: Object.fromEntries(question.answers.map(answer => [answer.label, answer.criteria || null])),
    }
  }

  return { type: question.type, instructions: describeQuestion(question), criteria: null }
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
  const read = question.type === QUESTION_CHOICE ? readChoice(question, answer) : readNoul(question, answer)
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
