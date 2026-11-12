import { countCards } from '../db/analytics-cards.js'
import { countActiveGenerations } from './generator.js'
import { isConfigured as isLlmConfigured } from '../llm/model.js'
import { isPostgresConfigured } from '../postgres/settings.js'
import {
  MAX_ANALYTICS_CARDS_PER_DASHBOARD,
  MAX_ANALYTICS_GENERATIONS_PER_DASHBOARD,
  MAX_ANALYTICS_GENERATIONS_PER_USER,
} from '../constants.js'

const DATABASE_NOT_CONFIGURED_ERROR = 'Connect a database in /admin (Database section) first.'
const LLM_NOT_CONFIGURED_ERROR =
  'The assistant is not configured yet. Ask an admin to set it up in /admin (LLM section).'
const TOO_MANY_CARDS_ERROR = `A dashboard can only have ${MAX_ANALYTICS_CARDS_PER_DASHBOARD} charts. Delete one first.`
const TOO_MANY_GENERATIONS_ERROR = `A dashboard can only generate ${MAX_ANALYTICS_GENERATIONS_PER_DASHBOARD} charts at a time. Wait for one to finish.`
const TOO_MANY_USER_GENERATIONS_ERROR = `You can only generate ${MAX_ANALYTICS_GENERATIONS_PER_USER} charts at a time. Wait for one to finish.`

export async function findGenerationRefusal(dashboardId, userId, { creating = false } = {}) {
  if (!(await isPostgresConfigured())) return DATABASE_NOT_CONFIGURED_ERROR
  if (!(await isLlmConfigured())) return LLM_NOT_CONFIGURED_ERROR
  if (countActiveGenerations(userId) >= MAX_ANALYTICS_GENERATIONS_PER_USER) return TOO_MANY_USER_GENERATIONS_ERROR

  const { total, generating } = await countCards(dashboardId, userId)
  if (creating && total >= MAX_ANALYTICS_CARDS_PER_DASHBOARD) return TOO_MANY_CARDS_ERROR
  if (generating >= MAX_ANALYTICS_GENERATIONS_PER_DASHBOARD) return TOO_MANY_GENERATIONS_ERROR

  return null
}
