import { LangfuseClient } from '@langfuse/client'
import { configureGlobalLogger, LogLevel } from '@langfuse/core'

export const EXPERIMENT_PROMPT_NAME = 'soporti-system'

const REQUEST_TIMEOUT_SECONDS = 20
const PROMPT_FETCH_TIMEOUT_MS = 20_000
const PROMPT_FETCH_RETRIES = 1
const DATASET_PAGE_LIMIT = 100
const NOT_FOUND_STATUS = 404
const GENERIC_ERROR_NAME = 'Error'

export function createLangfuseClient({ publicKey, secretKey, host }) {
  configureGlobalLogger({ level: LogLevel.NONE })

  return new LangfuseClient({ publicKey, secretKey, baseUrl: host })
}

export async function fetchExperimentPrompt(client, { label, version }) {
  const prompt = await client.prompt.get(EXPERIMENT_PROMPT_NAME, {
    label,
    version,
    type: 'text',
    cacheTtlSeconds: 0,
    fetchTimeoutMs: PROMPT_FETCH_TIMEOUT_MS,
    maxRetries: PROMPT_FETCH_RETRIES,
  })

  return { version: prompt.version, config: prompt.config ?? null }
}

export async function listDatasetItems(client, datasetName) {
  const page = await client.api.datasetItems.list(
    { datasetName, limit: DATASET_PAGE_LIMIT },
    { timeoutInSeconds: REQUEST_TIMEOUT_SECONDS }
  )

  return { items: page.data ?? [], hasMorePages: (page.meta?.totalPages ?? 1) > 1 }
}

export async function linkDatasetRunItem(client, { runName, datasetItemId, traceId, metadata }) {
  await client.api.datasetRunItems.create(
    { runName, datasetItemId, traceId, metadata },
    { timeoutInSeconds: REQUEST_TIMEOUT_SECONDS, maxRetries: 0 }
  )
}

export function isLangfuseNotFound(err) {
  return err?.statusCode === NOT_FOUND_STATUS
}

function errorName(err) {
  if (err?.name && err.name !== GENERIC_ERROR_NAME) return err.name

  return err?.constructor?.name ?? GENERIC_ERROR_NAME
}

export function describeError(err) {
  return [errorName(err), err?.statusCode].filter(Boolean).join(' ')
}
