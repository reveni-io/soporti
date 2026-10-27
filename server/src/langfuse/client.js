import { createHash } from 'node:crypto'
import { getLangfuseConfig, isLangfuseConfigured } from './settings.js'
import { redactSecrets } from '../review/output-guard.js'

const OTLP_TRACES_PATH = '/api/public/otel/v1/traces'
const EXPORT_TIMEOUT_MS = 15_000
const FAILURE_PAUSE_MS = 60_000
const MAX_CONTENT_CHARS = 32_000
const MAX_SPANS_PER_REQUEST = 20
const TRUNCATION_MARKER = '\n… [truncated] …\n'
const KEPT_HALF_CHARS = MAX_CONTENT_CHARS / 2
const GENERIC_SPAN_ERROR = 'Span failed'
const SERVICE_NAME = 'soporti'
const SPAN_KIND_INTERNAL = 1
const STATUS_CODE_ERROR = 2
const TRACE_ID_HEX_LENGTH = 32
const SPAN_ID_HEX_LENGTH = 16
const NANOS_PER_MILLI = 1_000_000n
const JSON_CONTAINER_RE = /^\s*[[{]/
const INGESTION_VERSION_HEADER = 'x-langfuse-ingestion-version'
const INGESTION_VERSION = '4'

const NETWORK_FAILURE_STATUS = 0
const MAX_TRACKED_ANSWERS = 100
const MAX_TRACE_ID_CHARS = 200
const TRACE_ID_ATTRIBUTES = [
  ['session.id', 'sessionId'],
  ['user.id', 'userId'],
]

const OBSERVATION_FIELDS = {
  agent: agentFields,
  function: functionFields,
  generation: generationFields,
  response: responseFields,
}

let lastExportError = null
let pausedUntil = 0
const traceAnswers = new Map()

function agentFields(data) {
  return { name: data.name, type: 'agent' }
}

function functionFields(data) {
  return { name: data.name, type: 'tool', input: data.input, output: data.output }
}

function stripProviderPrefix(model) {
  if (typeof model !== 'string') return null
  return model.slice(model.indexOf(':') + 1)
}

function generationFields(data) {
  const model = stripProviderPrefix(data.model)

  return {
    name: model ?? data.type,
    type: 'generation',
    model,
    usage: data.usage,
    input: data.input,
    output: data.output,
  }
}

function responseInput(data) {
  const instructions = data._response?.instructions
  if (!instructions) return data._input

  const messages = typeof data._input === 'string' ? [{ role: 'user', content: data._input }] : (data._input ?? [])
  return [{ role: 'system', content: instructions }, ...messages]
}

function responseFields(data) {
  const model = data._response?.model ?? null

  return {
    name: model ?? data.type,
    type: 'generation',
    model,
    usage: data._response?.usage,
    input: responseInput(data),
    output: data._response?.output,
  }
}

function observationFields(data) {
  const build = OBSERVATION_FIELDS[data.type]
  if (!build) return { name: data.type, type: 'span' }

  return build(data)
}

function redactText(text) {
  if (!JSON_CONTAINER_RE.test(text)) return redactSecrets(text)

  try {
    return JSON.stringify(redactValue(JSON.parse(text)))
  } catch {
    return redactSecrets(text)
  }
}

function redactValue(value) {
  if (typeof value === 'string') return redactText(value)
  if (Array.isArray(value)) return value.map(redactValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redactValue(entry)]))
  }

  return value
}

function toPlainJson(value) {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return null
  }
}

function contentText(value) {
  if (value === undefined || value === null) return null

  const plain = typeof value === 'string' ? value : toPlainJson(value)
  if (plain === null) return null

  const redacted = redactValue(plain)
  const text = typeof redacted === 'string' ? redacted : JSON.stringify(redacted)
  if (text.length <= MAX_CONTENT_CHARS) return text

  return `${text.slice(0, KEPT_HALF_CHARS)}${TRUNCATION_MARKER}${text.slice(-KEPT_HALF_CHARS)}`
}

function stringAttribute(key, value) {
  return { key, value: { stringValue: value } }
}

function intAttribute(key, value) {
  return { key, value: { intValue: value } }
}

function contentAttributes(fields, metadataOnly) {
  if (metadataOnly) return []

  return [
    ['langfuse.observation.input', contentText(fields.input)],
    ['langfuse.observation.output', contentText(fields.output)],
  ]
    .filter(([, text]) => text !== null)
    .map(([key, text]) => stringAttribute(key, text))
}

function usageAttributes(usage) {
  return [
    ['gen_ai.usage.input_tokens', usage?.input_tokens],
    ['gen_ai.usage.output_tokens', usage?.output_tokens],
  ]
    .filter(([, tokens]) => Number.isInteger(tokens))
    .map(([key, tokens]) => intAttribute(key, tokens))
}

function errorMessage(error, metadataOnly) {
  if (!error) return null
  if (metadataOnly) return GENERIC_SPAN_ERROR

  return contentText(error.message) || GENERIC_SPAN_ERROR
}

function errorAttributes(message) {
  if (message === null) return []

  return [
    stringAttribute('langfuse.observation.level', 'ERROR'),
    stringAttribute('langfuse.observation.status_message', message),
  ]
}

function generationOutput(data) {
  if (data.type === 'generation') return data.output
  if (data.type === 'response') return data._response?.output

  return null
}

function assistantText(output) {
  if (!Array.isArray(output)) return ''

  return output
    .filter(item => item?.type === 'message' && item.role === 'assistant' && Array.isArray(item.content))
    .flatMap(item => item.content)
    .filter(part => part?.type === 'output_text' && typeof part.text === 'string')
    .map(part => part.text)
    .join('\n')
    .trim()
}

function rememberAnswer(span) {
  const text = assistantText(generationOutput(span.spanData))
  if (!text) return

  traceAnswers.delete(span.traceId)
  traceAnswers.set(span.traceId, contentText(text))
  if (traceAnswers.size > MAX_TRACKED_ANSWERS) traceAnswers.delete(traceAnswers.keys().next().value)
}

function isRootAgent(span) {
  return span.spanData.type === 'agent' && !span.parentId
}

function rootContentAttributes(span, metadataOnly) {
  if (metadataOnly || !isRootAgent(span)) return []

  const answer = span.error ? null : traceAnswers.get(span.traceId)
  traceAnswers.delete(span.traceId)

  return [
    ['langfuse.observation.input', contentText(span.traceMetadata?.question)],
    ['langfuse.observation.output', answer],
  ]
    .filter(([, text]) => Boolean(text))
    .map(([key, text]) => stringAttribute(key, text))
}

function traceIdAttributes(span, metadataOnly) {
  if (metadataOnly) return []

  return TRACE_ID_ATTRIBUTES.map(([key, field]) => [key, String(span.traceMetadata?.[field] ?? '').trim()])
    .filter(([, value]) => value.length > 0)
    .map(([key, value]) => stringAttribute(key, value.slice(0, MAX_TRACE_ID_CHARS)))
}

function hexId(id, length) {
  return createHash('sha256').update(id).digest('hex').slice(0, length)
}

function toUnixNanos(iso) {
  return String(BigInt(Date.parse(iso)) * NANOS_PER_MILLI)
}

function toOtlpSpan(span, metadataOnly) {
  const fields = observationFields(span.spanData)
  const endedAt = span.endedAt ?? span.startedAt
  const failure = errorMessage(span.error, metadataOnly)
  const attributes = [
    stringAttribute('langfuse.observation.type', fields.type),
    ...(fields.model ? [stringAttribute('langfuse.observation.model.name', fields.model)] : []),
    ...usageAttributes(fields.usage),
    ...contentAttributes(fields, metadataOnly),
    ...rootContentAttributes(span, metadataOnly),
    ...traceIdAttributes(span, metadataOnly),
    ...errorAttributes(failure),
  ]

  return {
    traceId: hexId(span.traceId, TRACE_ID_HEX_LENGTH),
    spanId: hexId(span.spanId, SPAN_ID_HEX_LENGTH),
    parentSpanId: span.parentId ? hexId(span.parentId, SPAN_ID_HEX_LENGTH) : undefined,
    name: fields.name ?? fields.type,
    kind: SPAN_KIND_INTERNAL,
    startTimeUnixNano: toUnixNanos(span.startedAt ?? endedAt),
    endTimeUnixNano: toUnixNanos(endedAt),
    attributes,
    status: failure === null ? undefined : { code: STATUS_CODE_ERROR, message: failure },
  }
}

function buildOtlpPayload(spans, { metadataOnly }) {
  return {
    resourceSpans: [
      {
        resource: { attributes: [stringAttribute('service.name', SERVICE_NAME)] },
        scopeSpans: [{ scope: { name: SERVICE_NAME }, spans: spans.map(span => toOtlpSpan(span, metadataOnly)) }],
      },
    ],
  }
}

function isExportableSpan(item) {
  return item.type === 'trace.span' && Boolean(item.endedAt ?? item.startedAt)
}

function recordFailure(status) {
  lastExportError = { status, at: new Date().toISOString() }
  pausedUntil = Date.now() + FAILURE_PAUSE_MS
}

function postPayload(body, { config, signal }) {
  const credentials = Buffer.from(`${config.publicKey}:${config.secretKey}`).toString('base64')

  return fetch(`${config.host}${OTLP_TRACES_PATH}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
      [INGESTION_VERSION_HEADER]: INGESTION_VERSION,
    },
    body,
    redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(EXPORT_TIMEOUT_MS)].filter(Boolean)),
  })
}

async function readExportConfig() {
  try {
    const config = await getLangfuseConfig()
    return { config: isLangfuseConfigured(config) ? config : null }
  } catch (err) {
    console.error('Failed to read the Langfuse settings for a trace export:', err.name)
    return null
  }
}

async function deliver(body, { config, signal }) {
  try {
    const res = await postPayload(body, { config, signal })
    if (res.ok) {
      lastExportError = null
      return
    }

    console.error(`Failed to export traces to Langfuse: status ${res.status}`)
    recordFailure(res.status)
  } catch (err) {
    console.error('Failed to export traces to Langfuse:', err.name)
    recordFailure(NETWORK_FAILURE_STATUS)
  }
}

export async function exportSpans(items, signal) {
  const spans = items.filter(isExportableSpan)

  spans.forEach(rememberAnswer)

  if (spans.length === 0 || Date.now() < pausedUntil) return

  const read = await readExportConfig()
  if (!read) return

  const { config } = read
  if (!config || config.metadataOnly) traceAnswers.clear()
  if (!config) return

  for (let start = 0; start < spans.length && Date.now() >= pausedUntil; start += MAX_SPANS_PER_REQUEST) {
    const body = JSON.stringify(buildOtlpPayload(spans.slice(start, start + MAX_SPANS_PER_REQUEST), config))
    await deliver(body, { config, signal })
  }
}

export function getLastExportError() {
  return lastExportError
}

export function resetExportFailure() {
  lastExportError = null
  pausedUntil = 0
  traceAnswers.clear()
}
