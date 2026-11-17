import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { BOT_GREETING_TURN, VALID_PROFILES } from '../agent/system-prompt.js'
import { BOT_DESCRIPTION_MAX_LENGTH, BOT_NAME_MAX_LENGTH, MAX_BOTS_PER_USER } from '../constants.js'
import { countBots, createBot, deleteBot, getBot, listBots, markBotRead, updateBot } from '../db/bots.js'
import { deleteRoutine, getRoutine, listRoutines, setRoutinePaused } from '../db/routines.js'
import { appendToBotChat, buildBotTurnItems } from '../bots/bot-chat.js'
import { generateGreeting } from '../bots/greeting.js'
import { parseRequiredText } from '../bots/input.js'
import { computeNextRun } from '../schedules/next-run.js'

const ID_RE = /^\d{1,9}$/
const AVATAR_SEED_RE = /^[A-Za-z0-9-]{1,64}$/
const BOT_NOT_FOUND = 'Bot not found.'
const ROUTINE_NOT_FOUND = 'Routine not found.'

function parseAvatarSeed(avatarSeed) {
  if (avatarSeed === undefined || avatarSeed === null) return { value: null }
  if (typeof avatarSeed !== 'string' || !AVATAR_SEED_RE.test(avatarSeed)) {
    return { error: 'The avatar seed must be 1 to 64 letters, digits or hyphens.' }
  }

  return { value: avatarSeed }
}

function parseBotInput(body) {
  const { name, description, profile, avatarSeed } = body ?? {}

  const parsedName = parseRequiredText(name, { label: 'The name', maxLength: BOT_NAME_MAX_LENGTH })
  if (parsedName.error) return parsedName

  const parsedDescription = parseRequiredText(description, {
    label: 'The description',
    maxLength: BOT_DESCRIPTION_MAX_LENGTH,
  })
  if (parsedDescription.error) return parsedDescription

  if (!VALID_PROFILES.includes(profile)) {
    return { error: `Profile must be one of: ${VALID_PROFILES.join(', ')}.` }
  }

  const parsedSeed = parseAvatarSeed(avatarSeed)
  if (parsedSeed.error) return parsedSeed

  return {
    value: { name: parsedName.value, description: parsedDescription.value, profile, avatarSeed: parsedSeed.value },
  }
}

function parseIdParam(error, key) {
  return (req, res, next, raw) => {
    if (!ID_RE.test(raw)) return res.status(400).json({ error })

    req[key] = Number(raw)
    next()
  }
}

async function loadBot(req, res, next) {
  try {
    req.bot = await getBot(req.botId, req.user.id)
    if (!req.bot) return res.status(404).json({ error: BOT_NOT_FOUND })

    next()
  } catch (err) {
    console.error('Failed to load a bot:', err)
    res.status(500).json({ error: 'Failed to load the bot.' })
  }
}

async function storeGreeting(conversationStore, bot, userId) {
  try {
    const conversation = await conversationStore.resolveBot(bot.id, userId)
    const greeting = await generateGreeting(bot)

    await appendToBotChat(conversationStore, conversation, {
      parts: [{ type: 'text', content: greeting }],
      items: buildBotTurnItems(BOT_GREETING_TURN, greeting),
    })
  } catch (err) {
    console.error('Failed to store the greeting of a new bot:', err)
  }
}

function routineScope(req) {
  return { botId: req.botId, userId: req.user.id }
}

function resumedRunAt(routine, paused) {
  return paused ? routine.nextRunAt : computeNextRun(routine)
}

export default function botsRoute(conversationStore) {
  const router = Router()

  router.param('id', parseIdParam('Invalid bot ID.', 'botId'))
  router.param('routineId', parseIdParam('Invalid routine ID.', 'routineId'))

  router.get('/', async (req, res) => {
    try {
      res.json({ bots: await listBots(req.user.id) })
    } catch (err) {
      console.error('Failed to list bots:', err)
      res.status(500).json({ error: 'Failed to list the bots.' })
    }
  })

  router.post('/', async (req, res) => {
    const { error, value } = parseBotInput(req.body)
    if (error) return res.status(400).json({ error })

    try {
      if ((await countBots(req.user.id)) >= MAX_BOTS_PER_USER) {
        return res.status(422).json({ error: `You can only have ${MAX_BOTS_PER_USER} bots.` })
      }

      const bot = await createBot(req.user.id, { ...value, avatarSeed: value.avatarSeed ?? randomUUID() })
      await storeGreeting(conversationStore, bot, req.user.id)

      res.status(201).json({ bot })
    } catch (err) {
      console.error('Failed to create a bot:', err)
      res.status(500).json({ error: 'Failed to create the bot.' })
    }
  })

  router.put('/:id', async (req, res) => {
    const { error, value } = parseBotInput(req.body)
    if (error) return res.status(400).json({ error })

    try {
      const bot = await updateBot(req.botId, req.user.id, value)
      if (!bot) return res.status(404).json({ error: BOT_NOT_FOUND })

      res.json({ bot })
    } catch (err) {
      console.error('Failed to update a bot:', err)
      res.status(500).json({ error: 'Failed to update the bot.' })
    }
  })

  router.delete('/:id', async (req, res) => {
    try {
      const removed = await deleteBot(req.botId, req.user.id)
      if (!removed) return res.status(404).json({ error: BOT_NOT_FOUND })

      res.json({ ok: true })
    } catch (err) {
      console.error('Failed to delete a bot:', err)
      res.status(500).json({ error: 'Failed to delete the bot.' })
    }
  })

  router.get('/:id/messages', loadBot, async (req, res) => {
    try {
      res.json({ messages: await conversationStore.getBotMessages(req.bot.id, req.user.id) })
    } catch (err) {
      console.error('Failed to load the messages of a bot:', err)
      res.status(500).json({ error: 'Failed to load the messages of the bot.' })
    }
  })

  router.post('/:id/read', async (req, res) => {
    try {
      const marked = await markBotRead(req.botId, req.user.id)
      if (!marked) return res.status(404).json({ error: BOT_NOT_FOUND })

      res.json({ ok: true })
    } catch (err) {
      console.error('Failed to mark a bot as read:', err)
      res.status(500).json({ error: 'Failed to mark the bot as read.' })
    }
  })

  router.get('/:id/routines', loadBot, async (req, res) => {
    try {
      res.json({ routines: await listRoutines(routineScope(req)) })
    } catch (err) {
      console.error('Failed to list the routines of a bot:', err)
      res.status(500).json({ error: 'Failed to list the routines.' })
    }
  })

  router.patch('/:id/routines/:routineId', async (req, res) => {
    const { paused } = req.body ?? {}
    if (typeof paused !== 'boolean') return res.status(400).json({ error: 'Paused must be true or false.' })

    try {
      const routine = await getRoutine(req.routineId, routineScope(req))
      if (!routine) return res.status(404).json({ error: ROUTINE_NOT_FOUND })

      const updated = await setRoutinePaused(req.routineId, routineScope(req), {
        paused,
        nextRunAt: resumedRunAt(routine, paused),
      })
      if (!updated) return res.status(404).json({ error: ROUTINE_NOT_FOUND })

      res.json({ routine: updated })
    } catch (err) {
      console.error('Failed to pause or resume a routine:', err)
      res.status(500).json({ error: 'Failed to update the routine.' })
    }
  })

  router.delete('/:id/routines/:routineId', async (req, res) => {
    try {
      const removed = await deleteRoutine(req.routineId, routineScope(req))
      if (!removed) return res.status(404).json({ error: ROUTINE_NOT_FOUND })

      res.json({ ok: true })
    } catch (err) {
      console.error('Failed to delete a routine:', err)
      res.status(500).json({ error: 'Failed to delete the routine.' })
    }
  })

  return router
}
