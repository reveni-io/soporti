import { JEV_GITHUB_DOCUMENT, JEV_LEGAL_DOCUMENT, JEV_SETTINGS_DOCUMENT } from '../constants.js'
import {
  DEFAULT_GITHUB_RULES,
  describeGithubChanges,
  findGithubSaveError,
  parseGithubRepos,
  parseGithubRules,
} from './github-project.js'

const QUESTION_CHOICE = 'choice'
const QUESTION_NOUL = 'noul'
const DEFAULT_TIMEOUT_SECONDS = 30
const DEFAULT_DAILY_LIMIT = 0
const DEFAULT_MAX_CHARACTERS = 100_000
const MAX_TIMEOUT_SECONDS = 600
const MAX_QUESTIONS = 50
const MIN_ANSWERS = 2
const MAX_ANSWERS = 255
const MAX_SCORE = 100
const MAX_DESCRIPTION_CHARS = 500
const MAX_QUESTION_CHARS = 500
const MAX_GUIDANCE_CHARS = 4_000
const MAX_LABEL_CHARS = 200
const MAX_ID_CHARS = 64
const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/
const EMPTY_VALUE = '(empty)'
const VERSIONED_FIELDS = ['model', 'minConfidence', 'questions', 'rules']

const DEFAULT_SET = {
  description: '',
  model: '',
  minConfidence: null,
  timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
  dailyLimit: DEFAULT_DAILY_LIMIT,
  questions: [],
}

const DEFAULT_DOCUMENTS = {
  [JEV_SETTINGS_DOCUMENT]: { enabled: false },
  [JEV_GITHUB_DOCUMENT]: {
    set: { ...DEFAULT_SET, maxCharacters: DEFAULT_MAX_CHARACTERS, rules: DEFAULT_GITHUB_RULES },
    repos: [],
  },
  [JEV_LEGAL_DOCUMENT]: { set: DEFAULT_SET },
}

const SCALAR_CHANGES = [
  ['model', 'Model'],
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

function parseModel(value) {
  if (value === undefined || value === null || value === '') return { value: '' }
  if (typeof value !== 'string' || !MODEL_RE.test(value)) return { error: 'That does not look like a Jev model name.' }

  return { value }
}

function parseMinConfidence(value) {
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
  ['instructions', value => parseText(value, { label: 'The instructions', max: MAX_GUIDANCE_CHARS })],
  ['criteria', value => parseText(value, { label: 'The criteria', max: MAX_GUIDANCE_CHARS })],
]

const ANSWER_PARSERS = [
  ['label', value => parseText(value, { label: 'Each answer', max: MAX_LABEL_CHARS, required: true })],
  ['criteria', value => parseText(value, { label: 'The answer criteria', max: MAX_GUIDANCE_CHARS })],
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

const QUESTION_DETAIL_PARSERS = {
  [QUESTION_CHOICE]: parseChoiceDetails,
  [QUESTION_NOUL]: parseNoulDetails,
}

function parseQuestion(question) {
  const parseDetails = QUESTION_DETAIL_PARSERS[question?.type]
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

const SET_PARSERS = [
  ['description', value => parseText(value, { label: 'The set description', max: MAX_DESCRIPTION_CHARS })],
  ['model', parseModel],
  ['minConfidence', parseMinConfidence],
  [
    'timeoutSeconds',
    value =>
      parseWholeNumber(value, {
        min: 1,
        max: MAX_TIMEOUT_SECONDS,
        error: 'Timeout must be a whole number of seconds.',
      }),
  ],
  [
    'dailyLimit',
    value =>
      parseWholeNumber(value, {
        min: 0,
        max: Number.MAX_SAFE_INTEGER,
        error: 'Daily limit must be a whole number. Use 0 for no limit.',
      }),
  ],
  ['questions', parseQuestions],
]

const GITHUB_SET_PARSERS = [
  ...SET_PARSERS,
  [
    'maxCharacters',
    value =>
      parseWholeNumber(value, {
        min: 1,
        max: Number.MAX_SAFE_INTEGER,
        error: 'Max characters sent to Jev must be a positive whole number.',
      }),
  ],
  ['rules', parseGithubRules],
]

function parseJevSettings(data) {
  if (typeof data?.enabled !== 'boolean') return { error: '"enabled" must be true or false.' }

  return { value: { enabled: data.enabled } }
}

function parseProject(data, setParsers) {
  const set = parseFields(data?.set, setParsers)
  if (set.error) return set

  return { value: { set: set.value } }
}

function parseGithubProject(data) {
  const project = parseProject(data, GITHUB_SET_PARSERS)
  if (project.error) return project

  const repos = parseGithubRepos(data.repos)
  if (repos.error) return repos

  return { value: { ...project.value, repos: repos.value } }
}

const DOCUMENT_PARSERS = {
  [JEV_SETTINGS_DOCUMENT]: parseJevSettings,
  [JEV_GITHUB_DOCUMENT]: parseGithubProject,
  [JEV_LEGAL_DOCUMENT]: data => parseProject(data, SET_PARSERS),
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

function describeSetChanges(previous, next) {
  const changes = []

  if (previous.description !== next.description) changes.push('Set description')
  if (!isSameValue(previous.questions, next.questions)) changes.push('Questions')

  const scalars = SCALAR_CHANGES.filter(([field]) => previous[field] !== next[field]).map(
    ([field, label]) => `${label} ${showValue(previous[field])} → ${showValue(next[field])}`
  )

  return [...changes, ...scalars]
}

function describeChanges(previous, next) {
  if (next.repos) return [...describeGithubChanges(previous, next), ...describeSetChanges(previous.set, next.set)]
  if (next.set) return describeSetChanges(previous.set, next.set)

  return previous.enabled === next.enabled ? [] : [`Jev calls ${next.enabled ? 'on' : 'off'}`]
}

function versionedSet(data) {
  if (!data.set) return null

  return Object.fromEntries(VERSIONED_FIELDS.filter(field => field in data.set).map(field => [field, data.set[field]]))
}

function describeQueriesInUse(count) {
  const queries = count === 1 ? '1 scheduled query has' : `${count} scheduled queries have`

  return `Cannot delete the set: ${queries} Legal review on. They must turn it off first.`
}

function findSaveError(previous, next, inUseQueries) {
  if (next.repos) return findGithubSaveError(previous, next)
  if (next.set && next.set.questions.length === 0 && inUseQueries > 0) return describeQueriesInUse(inUseQueries)

  return null
}

export function isJevDocument(id) {
  return Object.hasOwn(DOCUMENT_PARSERS, id)
}

export function defaultJevDocument(id) {
  return structuredClone(DEFAULT_DOCUMENTS[id])
}

export function parseJevDocument(id, data) {
  return DOCUMENT_PARSERS[id](data)
}

export function planJevSave(current, next, { restoredFrom = null, inUseQueries = 0 } = {}) {
  const changes = describeChanges(current.data, next)
  if (changes.length === 0) return null

  const error = findSaveError(current.data, next, inUseQueries)
  if (error) return { error }

  const snapshot = versionedSet(next)
  const bumpsSet = snapshot !== null && !isSameValue(versionedSet(current.data), snapshot)
  const prefix = [current.rev === 0 && 'Created', restoredFrom && `Restored v${restoredFrom}`].filter(Boolean)

  return { data: next, change: [...prefix, ...changes].join('; '), set: bumpsSet ? snapshot : null }
}
