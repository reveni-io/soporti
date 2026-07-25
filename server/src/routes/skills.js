import { Router } from 'express'
import { listSkills, getSkillById, createSkill, updateSkill, deleteSkill } from '../db/skills.js'
import { MAX_DESCRIPTION_LENGTH, MAX_INSTRUCTIONS_LENGTH } from '../constants.js'

const router = Router()

const NAME_RE = /^[a-z0-9-]{1,50}$/
const ID_RE = /^\d{1,9}$/

function parseSkillInput(body) {
  const { name, description, instructions } = body ?? {}
  if (typeof name !== 'string' || !NAME_RE.test(name)) {
    return { error: 'Name must be 1-50 characters using lowercase letters, numbers, and hyphens only.' }
  }
  if (description != null && typeof description !== 'string') {
    return { error: 'Description must be a string.' }
  }
  const normalizedDescription = description?.trim() || null
  if (normalizedDescription && normalizedDescription.length > MAX_DESCRIPTION_LENGTH) {
    return { error: `Description is too long (max ${MAX_DESCRIPTION_LENGTH} characters).` }
  }
  if (typeof instructions !== 'string' || instructions.trim().length === 0) {
    return { error: 'Instructions are required.' }
  }
  if (instructions.length > MAX_INSTRUCTIONS_LENGTH) {
    return { error: `Instructions are too long (max ${MAX_INSTRUCTIONS_LENGTH} characters).` }
  }
  return { skill: { name, description: normalizedDescription, instructions } }
}

router.get('/', async (req, res) => {
  try {
    res.json({ skills: await listSkills(req.user.id) })
  } catch (err) {
    console.error('Failed to list skills:', err)
    res.status(500).json({ error: 'Failed to list skills.' })
  }
})

router.get('/:id', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'Invalid skill ID.' })

  try {
    const skill = await getSkillById(Number(req.params.id), req.user.id)
    if (!skill) return res.status(404).json({ error: 'Skill not found.' })
    res.json({ skill })
  } catch (err) {
    console.error('Failed to load skill:', err)
    res.status(500).json({ error: 'Failed to load the skill.' })
  }
})

router.post('/', async (req, res) => {
  const { error, skill: input } = parseSkillInput(req.body)
  if (error) return res.status(400).json({ error })

  try {
    const skill = await createSkill(req.user.id, input)
    res.status(201).json({ skill })
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A skill with this name already exists.' })
    console.error('Failed to create skill:', err)
    res.status(500).json({ error: 'Failed to create the skill.' })
  }
})

router.put('/:id', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'Invalid skill ID.' })

  const { error, skill: input } = parseSkillInput(req.body)
  if (error) return res.status(400).json({ error })

  try {
    const skill = await updateSkill(Number(req.params.id), req.user.id, input)
    if (!skill) return res.status(404).json({ error: 'Skill not found.' })
    res.json({ skill })
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A skill with this name already exists.' })
    console.error('Failed to update skill:', err)
    res.status(500).json({ error: 'Failed to update the skill.' })
  }
})

router.delete('/:id', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'Invalid skill ID.' })

  try {
    const removed = await deleteSkill(Number(req.params.id), req.user.id)
    if (!removed) return res.status(404).json({ error: 'Skill not found.' })
    res.json({ ok: true })
  } catch (err) {
    console.error('Failed to delete skill:', err)
    res.status(500).json({ error: 'Failed to delete the skill.' })
  }
})

export default router
