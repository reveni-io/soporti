import { Router } from 'express'
import {
  claimExperimentSlot,
  prepareExperiment,
  releaseExperimentSlot,
  startExperiment,
} from '../experiments/runner.js'
import { BASELINE_VARIANT_KEY, VERSION_KEY_PREFIX, variantKey } from '../experiments/variants.js'
import { describeError } from '../langfuse/sdk.js'

const router = Router()

const RUN_NAME_RE = /^[A-Za-z0-9 _.-]{1,80}$/
const LABEL_RE = /^[a-z0-9_.-]{1,64}$/
const MAX_DATASET_NAME_LENGTH = 200
const MAX_VARIANTS = 2
const RESERVED_LABEL_RE = new RegExp(`^(${BASELINE_VARIANT_KEY}|${VERSION_KEY_PREFIX}\\d+)$`)

function parseLabel(label) {
  if (typeof label !== 'string' || !LABEL_RE.test(label)) {
    return { error: 'A label is lowercase letters, digits, dots, dashes or underscores.' }
  }
  if (RESERVED_LABEL_RE.test(label)) {
    return { error: `A label cannot be ${BASELINE_VARIANT_KEY} or look like a version (${VERSION_KEY_PREFIX}3).` }
  }

  return { value: { label } }
}

function parseVariant(variant) {
  if (!variant || typeof variant !== 'object') {
    return { error: 'Each variant is { baseline: true }, { label } or { version }.' }
  }

  const { baseline, label, version } = variant
  const given = [baseline === true, label !== undefined, version !== undefined].filter(Boolean).length
  if (given !== 1) return { error: 'Each variant sets exactly one of baseline, label or version.' }
  if (baseline === true) return { value: { baseline: true } }
  if (label !== undefined) return parseLabel(label)

  return Number.isInteger(version) && version > 0
    ? { value: { version } }
    : { error: 'A version is a positive whole number.' }
}

function parseVariants(variants) {
  if (!Array.isArray(variants) || variants.length === 0 || variants.length > MAX_VARIANTS) {
    return { error: `Variants must be a list of 1 to ${MAX_VARIANTS} entries.` }
  }

  const parsed = variants.map(parseVariant)
  const failure = parsed.find(result => result.error)
  if (failure) return failure

  const value = parsed.map(result => result.value)
  if (new Set(value.map(variantKey)).size !== value.length) {
    return { error: 'Variants must be different from each other.' }
  }

  return { value }
}

function parseExperimentRequest(body) {
  const { dataset, runName, variants } = body ?? {}

  if (typeof dataset !== 'string' || dataset.trim().length === 0 || dataset.length > MAX_DATASET_NAME_LENGTH) {
    return { error: 'Dataset name is required.' }
  }
  if (typeof runName !== 'string' || !RUN_NAME_RE.test(runName)) {
    return { error: 'Run name is 1 to 80 letters, digits, spaces, dots, dashes or underscores.' }
  }

  const parsedVariants = parseVariants(variants)
  if (parsedVariants.error) return parsedVariants

  return { value: { dataset: dataset.trim(), runName, variants: parsedVariants.value } }
}

function describePlan({ dataset, runs, items, skipped }) {
  return {
    dataset,
    items: items.length,
    skippedItems: skipped,
    runs: runs.map(({ runName, key, promptVersion, overrides }) => ({
      runName,
      variant: key,
      promptVersion,
      overriddenSections: Object.keys(overrides?.sections ?? {}),
      overriddenTools: Object.keys(overrides?.tools ?? {}),
    })),
  }
}

router.post('/', async (req, res) => {
  if (req.apiKey) return res.status(403).json({ error: 'Experiments cannot be started with an API key.' })

  const parsed = parseExperimentRequest(req.body)
  if (parsed.error) return res.status(400).json({ error: parsed.error })
  if (!claimExperimentSlot()) return res.status(409).json({ error: 'An experiment is already running.' })

  try {
    const prepared = await prepareExperiment(parsed.value)
    if (prepared.error) {
      releaseExperimentSlot()
      return res.status(prepared.status).json({ error: prepared.error })
    }

    const described = describePlan(prepared.value)
    startExperiment(prepared.value)
    res.status(202).json(described)
  } catch (err) {
    releaseExperimentSlot()
    console.error('Failed to start experiment:', describeError(err))
    res.status(500).json({ error: 'Failed to start the experiment.' })
  }
})

export default router
