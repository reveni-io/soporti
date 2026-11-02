import { Router } from 'express'
import { listProviders } from '../llm/registry.js'
import { EXTENDED_REASONING_EFFORT_LEVELS } from '../constants.js'
import {
  getVideoModel,
  getVideoModelSelection,
  isVideoConfigured,
  parseVideoEffort,
  parseVideoModel,
  parseVideoProvider,
  setVideoEffort,
  setVideoModel,
  setVideoProvider,
} from '../video/settings.js'

const router = Router()

function saveSettingHandler({ field, label, parse, save }) {
  return async function handleSave(req, res) {
    const { error, value } = parse(req.body?.[field])
    if (error) return res.status(400).json({ error })

    try {
      await save(value)
      res.json({ [field]: value, configured: await isVideoConfigured() })
    } catch (err) {
      console.error(`Failed to save the video ${label}:`, err)
      res.status(500).json({ error: `Failed to save the video ${label}.` })
    }
  }
}

router.get('/', async (_req, res) => {
  try {
    const [{ provider, effort }, model, configured] = await Promise.all([
      getVideoModelSelection(),
      getVideoModel(),
      isVideoConfigured(),
    ])
    res.json({
      provider,
      model: model ?? '',
      effort,
      providers: listProviders(),
      effortLevels: EXTENDED_REASONING_EFFORT_LEVELS,
      configured,
    })
  } catch (err) {
    console.error('Failed to load the video settings:', err)
    res.status(500).json({ error: 'Failed to load the video settings.' })
  }
})

router.put(
  '/provider',
  saveSettingHandler({ field: 'provider', label: 'provider', parse: parseVideoProvider, save: setVideoProvider })
)

router.put(
  '/model',
  saveSettingHandler({ field: 'model', label: 'model', parse: parseVideoModel, save: setVideoModel })
)

router.put(
  '/effort',
  saveSettingHandler({ field: 'effort', label: 'reasoning effort', parse: parseVideoEffort, save: setVideoEffort })
)

export default router
