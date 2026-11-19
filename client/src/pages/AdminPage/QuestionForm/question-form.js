const MIN_ANSWERS = 2
const MAX_SCORE = 100
const SCORE_RE = /^\d+$/

export const QUESTION_CHOICE = 'choice'
export const QUESTION_NOUL = 'noul'

export function blankAnswer() {
  return { label: '', criteria: '', flag: false }
}

export function toForm(question) {
  return {
    id: question?.id ?? '',
    type: question?.type ?? QUESTION_CHOICE,
    text: question?.text ?? '',
    instructions: question?.instructions ?? '',
    criteria: question?.criteria ?? '',
    answers: question?.answers ?? [blankAnswer(), blankAnswer()],
    flagAt: question?.flagAt === null || question?.flagAt === undefined ? '' : String(question.flagAt),
  }
}

function readAnswers(answers) {
  const filled = answers
    .map(answer => ({ label: answer.label.trim(), criteria: answer.criteria.trim(), flag: answer.flag }))
    .filter(answer => answer.label)

  if (filled.length < MIN_ANSWERS) return { error: 'A choice question needs at least two answers.' }
  if (new Set(filled.map(answer => answer.label)).size !== filled.length) {
    return { error: 'Two answers have the same text.' }
  }

  return { value: { answers: filled } }
}

function readFlagAt(flagAt) {
  const text = flagAt.trim()
  if (text === '') return { value: { flagAt: null } }
  if (!SCORE_RE.test(text) || Number(text) > MAX_SCORE) {
    return { error: `The score threshold must be a whole number from 0 to ${MAX_SCORE}.` }
  }

  return { value: { flagAt: Number(text) } }
}

export function fromForm(form) {
  const text = form.text.trim()
  if (!text) return { error: 'Write the question.' }

  const details = form.type === QUESTION_CHOICE ? readAnswers(form.answers) : readFlagAt(form.flagAt)
  if (details.error) return details

  return {
    value: {
      id: form.id || crypto.randomUUID(),
      type: form.type,
      text,
      instructions: form.instructions.trim(),
      criteria: form.criteria.trim(),
      ...details.value,
    },
  }
}
