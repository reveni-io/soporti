import { z } from 'zod'
import { INTEGRATION_SECTION_IDS, PROMPT_SECTIONS } from '../agent/system-prompt.js'
import { SELECTABLE_TOOL_NAMES } from '../agent/tools.js'
import { TIME_TOOL_NAMES } from '../agent/time-tools.js'
import { INTEGRATION_PREFIX, INTEGRATION_TOOL_NAMES, WRITE_TOOL_NAMES } from '../agent/sources.js'
import { EXPERIMENT_PROMPT_NAME, fetchExperimentPrompt, isLangfuseNotFound } from '../langfuse/sdk.js'

export const BASELINE_VARIANT_KEY = 'baseline'
export const VERSION_KEY_PREFIX = 'v'

const USER_SCOPED_INTEGRATIONS = ['zendesk', 'granola']
const USER_SCOPED_TOOL_NAMES = new Set(USER_SCOPED_INTEGRATIONS.flatMap(id => INTEGRATION_TOOL_NAMES[id]))
const USER_SCOPED_SECTION_IDS = new Set(USER_SCOPED_INTEGRATIONS.map(id => `${INTEGRATION_PREFIX}${id}`))

const OVERRIDABLE_SECTION_IDS = [
  ...Object.keys(PROMPT_SECTIONS),
  ...INTEGRATION_SECTION_IDS.filter(id => !USER_SCOPED_SECTION_IDS.has(id)),
]
const OVERRIDABLE_TOOL_NAMES = [...SELECTABLE_TOOL_NAMES, ...TIME_TOOL_NAMES].filter(
  name => !WRITE_TOOL_NAMES.has(name) && !USER_SCOPED_TOOL_NAMES.has(name)
)

const OVERRIDE_TEXT = z.string().trim().min(1)
const PROMPT_CONFIG_SCHEMA = z
  .object({
    sections: z.partialRecord(z.enum(OVERRIDABLE_SECTION_IDS), OVERRIDE_TEXT).optional(),
    tools: z.partialRecord(z.enum(OVERRIDABLE_TOOL_NAMES), OVERRIDE_TEXT).optional(),
  })
  .strict()

export function variantKey(variant) {
  if (variant.baseline) return BASELINE_VARIANT_KEY
  if (variant.label) return variant.label

  return `${VERSION_KEY_PREFIX}${variant.version}`
}

function promptFetchFailure(err, key) {
  if (isLangfuseNotFound(err)) {
    return { status: 404, error: `Prompt ${EXPERIMENT_PROMPT_NAME} has no ${key} in Langfuse.` }
  }

  return { status: 502, error: `Could not read prompt ${EXPERIMENT_PROMPT_NAME} (${key}) from Langfuse.` }
}

function parseOverrides(config, key) {
  const parsed = PROMPT_CONFIG_SCHEMA.safeParse(config ?? {})
  if (!parsed.success) {
    return {
      error: `The config of prompt ${EXPERIMENT_PROMPT_NAME} (${key}) is invalid: ${z.prettifyError(parsed.error)}`,
    }
  }

  const overrides = { sections: parsed.data.sections ?? {}, tools: parsed.data.tools ?? {} }
  const count = Object.keys(overrides.sections).length + Object.keys(overrides.tools).length
  if (count === 0) {
    return { error: `Prompt ${EXPERIMENT_PROMPT_NAME} (${key}) overrides nothing, so it equals the baseline.` }
  }

  return { value: overrides }
}

export async function resolveVariant(client, variant) {
  const key = variantKey(variant)
  if (variant.baseline) return { value: { key, promptVersion: null, overrides: null } }

  let prompt
  try {
    prompt = await fetchExperimentPrompt(client, variant)
  } catch (err) {
    return promptFetchFailure(err, key)
  }

  const parsed = parseOverrides(prompt.config, key)
  if (parsed.error) return { status: 400, error: parsed.error }

  return { value: { key, promptVersion: prompt.version, overrides: parsed.value } }
}
