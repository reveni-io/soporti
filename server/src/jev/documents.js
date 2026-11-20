import {
  AUTO_APPROVE_DOCUMENT,
  JEV_GITHUB_DOCUMENT,
  JEV_LEGAL_DOCUMENT,
  JEV_QUESTION_CHOICE,
  JEV_QUESTION_NOUL,
} from '../constants.js'
import { describeGithubChanges, findGithubSaveError, parseGithubRepos } from './github-project.js'

const DEFAULT_TIMEOUT_SECONDS = 30
const DEFAULT_DAILY_LIMIT = 0
const DEFAULT_MAX_CHARACTERS = 100_000
const MAX_TIMEOUT_SECONDS = 600
const MAX_QUESTIONS = 50
const MIN_ANSWERS = 2
const MAX_ANSWERS = 255
const MAX_SCORE = 100
const MAX_QUESTION_CHARS = 500
const MAX_LABEL_CHARS = 200
const MAX_NAME_CHARS = 60
const CUSTOM_GUARD_RE = /^guard-[0-9a-f]{8}$/
const MAX_ID_CHARS = 64
const EMPTY_VALUE = '(empty)'
const VERSIONED_FIELDS = ['minConfidence', 'questions']
const LEGACY_GUARD_IDS = new Set([JEV_LEGAL_DOCUMENT, JEV_GITHUB_DOCUMENT])

const DEFAULT_SET = {
  minConfidence: null,
  timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
  dailyLimit: DEFAULT_DAILY_LIMIT,
  maxCharacters: DEFAULT_MAX_CHARACTERS,
  questions: [],
}

const SCALAR_CHANGES = [
  ['minConfidence', 'Min confidence'],
  ['timeoutSeconds', 'Timeout'],
  ['dailyLimit', 'Daily limit'],
  ['maxCharacters', 'Max characters'],
]

function parseText(value, { label, max, required = false }) {
  if (value === undefined || value === null) return required ? { error: `${label} is required.` } : { value: '' }
  if (typeof value !== 'string') return { error: `${label} must be text.` }

  const text = value.trim()
  if (required && text.length === 0) return { error: `${label} is required.` }
  if (text.length > max) return { error: `${label} is too long (max ${max} characters).` }

  return { value: text }
}

function parseWholeNumber(value, { min, max, error }) {
  if (!Number.isInteger(value) || value < min || value > max) return { error }

  return { value }
}

function parseMinConfidence(value) {
  if (value === undefined || value === null) return { value: null }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    return { error: 'Min confidence must be a number between 0 and 1.' }
  }

  return { value }
}

function parseFlagAt(value) {
  if (value === undefined || value === null) return { value: null }

  return parseWholeNumber(value, {
    min: 0,
    max: MAX_SCORE,
    error: `The score threshold must be a whole number from 0 to ${MAX_SCORE}.`,
  })
}

function parseFields(source, parsers) {
  const value = {}

  for (const [field, parse] of parsers) {
    const result = parse(source?.[field])
    if (result.error) return { error: result.error }

    value[field] = result.value
  }

  return { value }
}

const COMMON_QUESTION_PARSERS = [
  ['id', value => parseText(value, { label: 'The question id', max: MAX_ID_CHARS, required: true })],
  ['text', value => parseText(value, { label: 'The question', max: MAX_QUESTION_CHARS, required: true })],
]

const ANSWER_PARSERS = [
  ['label', value => parseText(value, { label: 'Each answer', max: MAX_LABEL_CHARS, required: true })],
]

function parseAnswer(answer) {
  const fields = parseFields(answer, ANSWER_PARSERS)
  if (fields.error) return fields

  return { value: { ...fields.value, flag: answer.flag === true } }
}

function parseChoiceDetails({ answers }) {
  if (!Array.isArray(answers) || answers.length < MIN_ANSWERS) {
    return { error: 'A choice question needs at least two answers.' }
  }
  if (answers.length > MAX_ANSWERS) return { error: `A choice question can have at most ${MAX_ANSWERS} answers.` }

  const parsed = []
  for (const answer of answers) {
    const result = parseAnswer(answer)
    if (result.error) return result

    parsed.push(result.value)
  }

  if (new Set(parsed.map(answer => answer.label)).size !== parsed.length) {
    return { error: 'Two answers have the same text.' }
  }

  return { value: { answers: parsed } }
}

function parseNoulDetails({ flagAt }) {
  const result = parseFlagAt(flagAt)
  if (result.error) return result

  return { value: { flagAt: result.value } }
}

const QUESTION_DETAIL_PARSERS = new Map([
  [JEV_QUESTION_CHOICE, parseChoiceDetails],
  [JEV_QUESTION_NOUL, parseNoulDetails],
])

function parseQuestion(question) {
  const parseDetails = QUESTION_DETAIL_PARSERS.get(question?.type)
  if (!parseDetails) return { error: 'The type must be choice or noul.' }

  const common = parseFields(question, COMMON_QUESTION_PARSERS)
  if (common.error) return common

  const details = parseDetails(question)
  if (details.error) return details

  return { value: { ...common.value, type: question.type, ...details.value } }
}

function parseQuestions(value) {
  if (!Array.isArray(value)) return { error: 'Questions must be a list.' }
  if (value.length > MAX_QUESTIONS) return { error: `A set can have at most ${MAX_QUESTIONS} questions.` }

  const questions = []
  for (const [index, question] of value.entries()) {
    const result = parseQuestion(question)
    if (result.error) return { error: `Question ${index + 1}: ${result.error}` }

    questions.push(result.value)
  }

  if (new Set(questions.map(question => question.id)).size !== questions.length) {
    return { error: 'Two questions have the same id.' }
  }

  return { value: questions }
}

function parseTimeoutSeconds(value) {
  return parseWholeNumber(value, {
    min: 1,
    max: MAX_TIMEOUT_SECONDS,
    error: 'Timeout must be a whole number of seconds.',
  })
}

function parseDailyLimit(value) {
  return parseWholeNumber(value, {
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    error: 'Daily limit must be a whole number. Use 0 for no limit.',
  })
}

function parseMaxCharacters(value = DEFAULT_MAX_CHARACTERS) {
  return parseWholeNumber(value, {
    min: 1,
    max: Number.MAX_SAFE_INTEGER,
    error: 'Max characters sent to Jev must be a positive whole number.',
  })
}

const SET_PARSERS = [
  ['minConfidence', parseMinConfidence],
  ['timeoutSeconds', parseTimeoutSeconds],
  ['dailyLimit', parseDailyLimit],
  ['maxCharacters', parseMaxCharacters],
  ['questions', parseQuestions],
]

export function parseGuardName(value, { required = false } = {}) {
  if ((value === undefined || value === null) && !required) return { value: undefined }

  return parseText(value, { label: 'The name', max: MAX_NAME_CHARS, required: true })
}

function parseGuard(data, { nameRequired }) {
  const name = parseGuardName(data?.name, { required: nameRequired })
  if (name.error) return name

  const set = parseFields(data?.set, SET_PARSERS)
  if (set.error) return set

  return { value: name.value === undefined ? { set: set.value } : { name: name.value, set: set.value } }
}

function parseAutoApprove(data) {
  const repos = parseGithubRepos(data?.repos ?? [])
  if (repos.error) return repos

  return { value: { repos: repos.value } }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value === null || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, canonical(value[key])])
  )
}

function isSameValue(a, b) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
}

function showValue(value) {
  return value === null || value === undefined || value === '' ? EMPTY_VALUE : String(value)
}

function describeScalarChange(label, before, after) {
  return `${label} ${showValue(before)} → ${showValue(after)}`
}

function describeSetChanges(previous, next) {
  const changes = []

  if (!isSameValue(previous.questions, next.questions)) changes.push('Questions')

  const scalars = SCALAR_CHANGES.filter(([field]) => previous[field] !== next[field]).map(([field, label]) =>
    describeScalarChange(label, previous[field], next[field])
  )

  return [...changes, ...scalars]
}

function describeNameChange(previous, next) {
  return next.name !== undefined && previous.name !== next.name ? [`Name ${next.name}`] : []
}

function describeChanges(previous, next) {
  if (next.repos) return describeGithubChanges(previous, next)

  return [...describeNameChange(previous, next), ...describeSetChanges(previous.set, next.set)]
}

function versionedSet(data) {
  if (!data.set) return null

  return Object.fromEntries(VERSIONED_FIELDS.filter(field => field in data.set).map(field => [field, data.set[field]]))
}

function findSaveError(previous, next) {
  return next.repos ? findGithubSaveError(previous, next) : null
}

export function isCustomGuardId(id) {
  return CUSTOM_GUARD_RE.test(id)
}

export function isGuardId(id) {
  return LEGACY_GUARD_IDS.has(id) || isCustomGuardId(id)
}

export function isJevDocument(id) {
  return id === AUTO_APPROVE_DOCUMENT || isGuardId(id)
}

export function defaultJevDocument(id) {
  if (id === AUTO_APPROVE_DOCUMENT) return { repos: [] }
  if (isCustomGuardId(id)) return structuredClone({ name: '', set: DEFAULT_SET })

  return LEGACY_GUARD_IDS.has(id) ? structuredClone({ set: DEFAULT_SET }) : null
}

export function parseJevDocument(id, data) {
  if (id === AUTO_APPROVE_DOCUMENT) return parseAutoApprove(data)
  if (!isGuardId(id)) return { error: 'Unknown document.' }

  return parseGuard(data, { nameRequired: isCustomGuardId(id) })
}

export function planJevSave(current, next, { restoredFrom = null } = {}) {
  const changes = describeChanges(current.data, next)
  if (changes.length === 0) return null

  const error = findSaveError(current.data, next)
  if (error) return { error }

  const snapshot = versionedSet(next)
  const bumpsSet = snapshot !== null && !isSameValue(versionedSet(current.data), snapshot)
  const prefix = [current.rev === 0 && 'Created', restoredFrom && `Restored v${restoredFrom}`].filter(Boolean)

  return { data: next, change: [...prefix, ...changes].join('; '), set: bumpsSet ? snapshot : null }
}
