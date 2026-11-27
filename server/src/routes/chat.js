import { Router } from 'express'
import { run } from '@openai/agents'
import { traceAgentRun } from '../agent/run-tracking.js'
import { createAgent } from '../agent/assistant.js'
import { buildUserTurn } from '../agent/user-turn.js'
import config from '../config.js'
import { isValidTimezone } from '../schedules/next-run.js'
import { searchSimilarCases, isKnowledgeBaseConfigured } from '../knowledge/client.js'
import { storePendingFeedback } from '../knowledge/feedback.js'
import { YOLO_SOURCE, buildSourcesFooter, isYoloMode } from '../agent/sources.js'
import { getCustomInstructions } from '../db/users.js'
import { getSkillsByIds } from '../db/skills.js'
import { getBot } from '../db/bots.js'
import { withConversationLock } from '../sessions/conversation-lock.js'
import { isTurnStopped, releaseTurn, stopTurn, trackTurn } from '../sessions/turn-stops.js'
import { isConfigured } from '../llm/model.js'
import { extractUsage, formatUsage, sumUsage } from '../llm/usage.js'
import { UNKNOWN_TOOL, toolCallFromRawItem, toolNames } from '../agent/run-items.js'
import { recordAgentRun } from '../db/agent-runs.js'
import { carriesImage, isValidAttachmentName } from '../documents/attachments.js'
import { buildAgentInput } from '../agent/agent-input.js'
import { getAttachmentImages } from '../db/attachment-images.js'
import { toGuardPart } from '../guards/check.js'
import { botTarget, conversationTarget, notifyUser } from '../push/notify.js'
import {
  AGENT_CHANNEL_WEB,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_CHARS,
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_SKILLS_PER_REQUEST,
  RUN_STATUS_ERROR,
  RUN_STATUS_OK,
  UUID_RE,
  TOOL_NOT_FOUND_BEHAVIOR,
} from '../constants.js'

const router = Router()

function sendEvent(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

function log(icon, ...args) {
  const timestamp = new Date().toISOString().slice(11, 23)
  console.log(`[${timestamp}] ${icon}`, ...args)
}

const SAFE_INPUT_FIELDS = ['repo', 'path', 'query']
const MAX_BOT_ID = 999_999_999
const INTERNAL_ERROR_EVENT = { type: 'error', message: 'An internal error occurred.' }
const ANSWER_READY_TITLE = 'Your answer is ready'

const TOOL_START = '  →'
const TOOL_DONE = '  ✓'
const NESTED_START = '    ↳'
const NESTED_DONE = '    ✓'

function sanitizeInput(rawArgs) {
  if (!rawArgs || typeof rawArgs !== 'string') return {}
  try {
    const args = JSON.parse(rawArgs)
    const safe = {}
    for (const key of SAFE_INPUT_FIELDS) {
      if (key in args) safe[key] = args[key]
    }
    return safe
  } catch {
    return {}
  }
}

function parseTimezone(value) {
  if (value === null || value === undefined) return { value: null }
  if (!isValidTimezone(value)) return { error: 'Timezone must be a valid IANA time zone name.' }

  return { value }
}

function parseMessage(message) {
  if (!message || typeof message !== 'string') return { error: 'A "message" string is required.' }

  const trimmed = message.trim()
  if (trimmed.length === 0) return { error: 'Message cannot be empty.' }
  if (trimmed.length > MAX_CHAT_MESSAGE_LENGTH) {
    return { error: `Message is too long (max ${MAX_CHAT_MESSAGE_LENGTH} characters).` }
  }

  return { value: trimmed }
}

function trimmedString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function parseAttachment(item) {
  const name = trimmedString(item?.name)
  const text = trimmedString(item?.text)
  const imageId = trimmedString(item?.imageId)

  if (!name) return { error: 'Each attachment needs a "name".' }
  if (!isValidAttachmentName(name)) return { error: `Attachment "${name}" has an invalid file name.` }
  if (!text && !imageId) return { error: `Attachment "${name}" needs its extracted "text" or an "imageId".` }
  if (imageId && !UUID_RE.test(imageId)) return { error: `Attachment "${name}" has an invalid image ID.` }
  if (imageId) return { value: { name, imageId } }
  if (text.length > MAX_ATTACHMENT_CHARS) {
    return { error: `Attachment "${name}" is too long (max ${MAX_ATTACHMENT_CHARS} characters).` }
  }

  return { value: { name, text, truncated: Boolean(item.truncated) } }
}

function parseAttachments(value) {
  if (value === undefined || value === null) return { value: [] }
  if (!Array.isArray(value)) return { error: 'Attachments must be an array.' }
  if (value.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return { error: `Too many attachments (max ${MAX_ATTACHMENTS_PER_MESSAGE} per message).` }
  }

  const parsed = []
  for (const item of value) {
    const attachment = parseAttachment(item)
    if (attachment.error) return attachment

    parsed.push(attachment.value)
  }

  return { value: parsed }
}

function parseSources(selectedSources, selectedRepos) {
  const rawSources = Array.isArray(selectedSources) ? selectedSources : selectedRepos

  return Array.isArray(rawSources) ? rawSources : []
}

function parseBotId(value) {
  if (value === undefined || value === null) return { value: null }
  if (!Number.isInteger(value) || value <= 0 || value > MAX_BOT_ID) return { error: 'Invalid bot ID.' }

  return { value }
}

function parseSkillIds(skillIds) {
  return (Array.isArray(skillIds) ? skillIds : [])
    .filter(id => Number.isInteger(id) && id > 0)
    .slice(0, MAX_SKILLS_PER_REQUEST)
}

function parseRequestId(value) {
  if (value === undefined || value === null) return { value: null }
  if (typeof value !== 'string' || !UUID_RE.test(value)) return { error: 'Invalid request ID.' }

  return { value }
}

function parseChatRequest(body) {
  const { sessionId, message, selectedSources, selectedRepos, profile, skillIds, attachments, timezone, botId } = body

  const parsedMessage = parseMessage(message)
  if (parsedMessage.error) return parsedMessage
  if (sessionId && !UUID_RE.test(sessionId)) return { error: 'Invalid session ID.' }

  const parsedTimezone = parseTimezone(timezone)
  if (parsedTimezone.error) return parsedTimezone

  const parsedAttachments = parseAttachments(attachments)
  if (parsedAttachments.error) return parsedAttachments

  const parsedBotId = parseBotId(botId)
  if (parsedBotId.error) return parsedBotId

  const parsedRequestId = parseRequestId(body.requestId)
  if (parsedRequestId.error) return parsedRequestId

  return {
    value: {
      requestId: parsedRequestId.value,
      sessionId,
      message: parsedMessage.value,
      sources: parseSources(selectedSources, selectedRepos),
      profile,
      skillIds: parseSkillIds(skillIds),
      attachments: parsedAttachments.value,
      timezone: parsedTimezone.value,
      botId: parsedBotId.value,
    },
  }
}

async function resolveAttachmentImages(attachments, userId) {
  const withImage = attachments.filter(carriesImage)
  if (withImage.length === 0) return { images: [] }

  const stored = await getAttachmentImages(
    withImage.map(a => a.imageId),
    userId
  )
  const missing = withImage.find(a => !stored.has(a.imageId))
  if (missing) {
    return { error: `The image "${missing.name}" is no longer available. Attach it again.` }
  }

  return { images: withImage.map(a => stored.get(a.imageId)) }
}

function describeAttachment(attachment) {
  if (carriesImage(attachment)) return `${attachment.name} (image)`

  return `${attachment.name} (${attachment.text.length} chars${attachment.truncated ? ', truncated' : ''})`
}

function collectText(parts) {
  return parts
    .filter(p => p.type === 'text')
    .map(p => p.content)
    .join('')
}

function lastText(parts) {
  const last = parts.findLast(p => p.type === 'text' && p.content.trim().length > 0)

  return last?.content ?? ''
}

function watchClientDisconnect(res) {
  let disconnected = false
  res.on('close', () => {
    if (!res.writableEnded) disconnected = true
  })

  return () => disconnected
}

function describeAnswerNotification({ bot, conversationId }) {
  if (bot) return { title: bot.name, ...botTarget(bot.id) }

  return { title: ANSWER_READY_TITLE, ...conversationTarget(conversationId) }
}

function notifyIfClientLeft(turnContext, answer) {
  if (!turnContext.hasClientLeft() || isTurnStopped(turnContext.turnKey)) return

  notifyUser(turnContext.userId, { ...describeAnswerNotification(turnContext), body: answer })
}

function appendText(parts, text) {
  const last = parts[parts.length - 1]
  if (last && last.type === 'text') {
    last.content += text
  } else {
    parts.push({ type: 'text', content: text })
  }
}

async function loadInvokedSkills(skillIds, userId) {
  if (skillIds.length === 0) return []

  return getSkillsByIds(skillIds, userId).catch(err => {
    console.error('Failed to load skills:', err)
    return []
  })
}

function logIncomingMessage(request, { conversationId, similarCases, customInstructions, invokedSkills, newSkills }) {
  console.log(`\n${'─'.repeat(60)}`)
  log('📩', `New message: "${request.message.slice(0, 120)}"`)
  log('📂', `Sources: ${request.sources.length > 0 ? request.sources.join(', ') : '(none selected)'}`)
  log('💬', `Conversation: ${conversationId}`)
  if (similarCases.length > 0) {
    log('📚', `Found ${similarCases.length} similar case(s)`)
  }
  if (customInstructions) {
    log('🧭', `Custom instructions applied (${customInstructions.length} chars)`)
  }
  if (request.attachments.length > 0) {
    log('📎', `Attachment(s): ${request.attachments.map(describeAttachment).join(', ')}`)
  }
  if (invokedSkills.length > 0) {
    const described = invokedSkills.map(s => (newSkills.includes(s) ? s.name : `${s.name} (carried over)`))
    log('⚡', `Skill(s) applied: ${described.join(', ')}`)
  }
}

function markToolCallDone(parts, { toolName, parent, durationMs }) {
  const part = parts.findLast(p => p.type === 'tool_call' && p.tool === toolName && p.parent === parent && !p.done)
  if (!part) return

  part.done = true
  if (durationMs) part.durationMs = durationMs
}

function createTurnStream(res) {
  const parts = []
  const toolCalls = []
  const nestedUsage = []
  const pendingArtifacts = []
  const pendingParts = []
  const toolStartTimes = new Map()
  const callIdToName = new Map()
  let sentContent = false

  function sendText(text) {
    sentContent = true
    appendText(parts, text)
    sendEvent(res, { type: 'text_delta', text })
  }

  function startToolCall({ name, arguments: rawArgs, callId, parent = null }) {
    const toolName = name || UNKNOWN_TOOL
    const toolArgs = rawArgs || '{}'

    if (callId) {
      toolStartTimes.set(callId, Date.now())
      callIdToName.set(callId, toolName)
    }

    toolCalls.push({ name: toolName, arguments: toolArgs })
    const input = sanitizeInput(toolArgs)
    parts.push({ type: 'tool_call', tool: toolName, input, done: false, parent })

    sentContent = true
    log(parent ? NESTED_START : TOOL_START, `${toolName}(${toolArgs.slice(0, 100)})`)
    sendEvent(res, { type: 'tool_start', tool: toolName, input, parent })
  }

  function finishToolCall({ name, callId, parent = null }) {
    const toolName = name || callIdToName.get(callId) || UNKNOWN_TOOL
    const startTime = callId ? toolStartTimes.get(callId) : undefined
    const durationMs = startTime ? Date.now() - startTime : undefined

    markToolCallDone(parts, { toolName, parent, durationMs })

    log(
      parent ? NESTED_DONE : TOOL_DONE,
      durationMs ? `${toolName} completed in ${durationMs}ms` : `${toolName} completed`
    )
    sendEvent(res, { type: 'tool_end', tool: toolName, parent })
  }

  function flushArtifacts() {
    while (pendingArtifacts.length > 0) {
      const artifact = pendingArtifacts.shift()
      parts.push({ type: 'artifact', ...artifact })
      sendEvent(res, { type: 'artifact', ...artifact })
    }
    while (pendingParts.length > 0) {
      const part = pendingParts.shift()
      parts.push(part)
      sendEvent(res, { type: 'part', part })
    }
  }

  return {
    parts,
    toolCalls,
    nestedUsage,
    sendText,
    startToolCall,
    finishToolCall,
    flushArtifacts,
    queueArtifact: artifact => pendingArtifacts.push(artifact),
    queueGuardResult: result => pendingParts.push(toGuardPart(result)),
    hasSentContent: () => sentContent,
  }
}

function forwardStreamEvent(event, turn) {
  if (event.type === 'raw_model_stream_event') {
    if (event.data.type === 'output_text_delta') turn.sendText(event.data.delta)
    return
  }
  if (event.type !== 'run_item_stream_event') return

  const item = event.item
  if (item.type === 'tool_call_item') {
    turn.startToolCall(toolCallFromRawItem(item.rawItem))
    return
  }
  if (item.type !== 'tool_call_output_item') return

  turn.finishToolCall(toolCallFromRawItem(item.rawItem))
  turn.flushArtifacts()
}

async function runAgentTurn(agent, agentInput, { session, previousResponseId, turn, trace }) {
  const stream = await traceAgentRun({ ...trace, name: agent.name, channel: AGENT_CHANNEL_WEB }, () =>
    run(agent, agentInput, {
      stream: true,
      maxTurns: config.agent.maxIterations,
      toolNotFoundBehavior: TOOL_NOT_FOUND_BEHAVIOR,
      session,
      previousResponseId,
    })
  )

  for await (const event of stream.toStream()) {
    forwardStreamEvent(event, turn)
  }

  await stream.completed

  const usage = formatUsage(stream.state?.usage)
  if (usage) log('📊', usage)

  return {
    lastResponseId: stream.lastResponseId,
    usage: sumUsage([extractUsage(stream.state?.usage), ...turn.nestedUsage]),
    unpersistedItems: previousResponseId ? stream.history : null,
  }
}

async function runAgentTurnWithRetry(agent, agentInput, { session, previousResponseId, turn, trace }) {
  try {
    return await runAgentTurn(agent, agentInput, { session, previousResponseId, turn, trace })
  } catch (err) {
    if (!previousResponseId || turn.hasSentContent()) throw err

    log('♻️', `Retrying without previousResponseId (${err.message})`)
    return runAgentTurn(agent, agentInput, { session, previousResponseId: undefined, turn, trace })
  }
}

function buildUserParts(request, newSkills) {
  return [
    ...newSkills.map(s => ({ type: 'skill', skillId: s.id, name: s.name })),
    ...request.attachments.map(a => ({
      type: 'attachment',
      name: a.name,
      truncated: Boolean(a.truncated),
      imageId: a.imageId ?? null,
    })),
    { type: 'text', content: request.message },
  ]
}

async function loadRequestedBot(botId, userId) {
  if (!botId) return { bot: null }

  try {
    const bot = await getBot(botId, userId)
    if (!bot) return { status: 404, error: 'Bot not found.' }

    return { bot }
  } catch (err) {
    console.error('Failed to load the bot:', err)
    return { status: 500, error: 'Failed to load the bot.' }
  }
}

function applyBot(request, bot) {
  if (!bot) return request

  return { ...request, sources: [YOLO_SOURCE], profile: bot.profile }
}

function describeBot(bot) {
  return bot ? { id: bot.id, name: bot.name, description: bot.description } : null
}

function resolveConversation(conversationStore, request, { bot, userId }) {
  if (bot) return conversationStore.resolveBot(bot.id, userId)

  return conversationStore.resolveWeb(request.sessionId, userId)
}

function resumeBotConversation(conversationStore, { bot, userId }) {
  return conversationStore.resolveBot(bot.id, userId).catch(err => {
    console.error('Failed to resume the bot conversation:', err)
    return null
  })
}

function inConversation(conversationStore, { bot, userId, resolved, res }, task) {
  if (!bot) return task(resolved)

  return withConversationLock(resolved.conversationId, async () => {
    const conversation = await resumeBotConversation(conversationStore, { bot, userId })
    if (!conversation) return sendEvent(res, INTERNAL_ERROR_EVENT)

    return task(conversation)
  })
}

async function loadTurnContext(conversationStore, request, { conversationId, isNewConversation, userId }) {
  const [similarCases, customInstructions, carriedSkillIds] = await Promise.all([
    isNewConversation ? searchSimilarCases(request.message) : [],
    getCustomInstructions(userId).catch(err => {
      console.error('Failed to load custom instructions:', err)
      return null
    }),
    conversationStore.getInvokedSkillIds(conversationId).catch(err => {
      console.error('Failed to load conversation skills:', err)
      return []
    }),
  ])

  const activeSkillIds = [...new Set([...carriedSkillIds, ...request.skillIds])].slice(0, MAX_SKILLS_PER_REQUEST)
  const invokedSkills = await loadInvokedSkills(activeSkillIds, userId)
  const newSkills = invokedSkills.filter(s => request.skillIds.includes(s.id))

  return { similarCases, customInstructions, invokedSkills, newSkills }
}

async function runChatTurn(turnContext, { session, previousResponseId }) {
  const { res, conversationStore, request, bot, userId, conversationId, agentInput, turn, context, sender } =
    turnContext

  try {
    const agent = await createAgent(request.sources, request.profile, {
      customInstructions: context.customInstructions ?? '',
      skills: context.invokedSkills,
      skillArguments: request.message,
      userId,
      conversationId,
      onArtifactPublished: turn.queueArtifact,
      guardCases: {
        conversationId,
        onChecked: turn.queueGuardResult,
        sendable: !sender.apiKey,
        turnStartedAt: sender.turnStartedAt,
        completedTurns: await conversationStore.countTurns(conversationId),
      },
      onNestedToolCall: turn.startToolCall,
      onNestedToolResult: turn.finishToolCall,
      onNestedUsage: usage => turn.nestedUsage.push(usage),
      timezone: request.timezone,
      bot: describeBot(bot),
    })
    const agentStart = Date.now()

    log('🚀', 'Agent started')

    const { lastResponseId, usage, unpersistedItems } = await runAgentTurnWithRetry(agent, agentInput, {
      session,
      previousResponseId,
      turn,
      trace: { sessionId: conversationId, userId, question: request.message },
    })

    const totalMs = Date.now() - agentStart
    log('✅', `Done in ${totalMs}ms`)

    const answer = lastText(turn.parts)
    const footer = isYoloMode(request.sources) ? buildSourcesFooter(turn.toolCalls) : null
    if (footer) turn.sendText(footer)

    const finalText = collectText(turn.parts)
    if (await isKnowledgeBaseConfigured()) {
      const feedbackId = storePendingFeedback(request.message, finalText)
      sendEvent(res, { type: 'feedback_id', feedbackId })
    }

    await conversationStore.saveTurn(conversationId, {
      lastResponseId,
      session,
      unpersistedItems,
      uiMessages: [
        { role: 'user', parts: buildUserParts(request, context.newSkills) },
        { role: 'assistant', parts: turn.parts },
      ],
    })
    notifyIfClientLeft(turnContext, answer)

    await recordAgentRun({
      channel: AGENT_CHANNEL_WEB,
      status: RUN_STATUS_OK,
      userId,
      usage,
      durationMs: totalMs,
      tools: toolNames(turn.toolCalls),
    })
  } catch (err) {
    console.error('❌ Error:', err)
    await recordAgentRun({ channel: AGENT_CHANNEL_WEB, status: RUN_STATUS_ERROR, userId })
    sendEvent(res, INTERNAL_ERROR_EVENT)
  }
}

async function loadPrerequisites(request, userId) {
  try {
    const [configured, resolvedImages] = await Promise.all([
      isConfigured(),
      resolveAttachmentImages(request.attachments, userId),
    ])
    if (!configured) {
      return {
        status: 503,
        error: 'The assistant is not configured. Ask an admin to set the API key and model in the admin panel.',
      }
    }
    if (resolvedImages.error) return { status: 400, error: resolvedImages.error }

    return { images: resolvedImages.images }
  } catch (err) {
    console.error('Failed to load the attached images:', err)
    return { status: 500, error: 'Failed to load the attached images.' }
  }
}

function openEventStream(res, conversationId) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  sendEvent(res, { type: 'session_id', sessionId: conversationId })
}

async function answerChat(conversationStore, { req, res, parsedRequest, turnKey }) {
  const sender = { apiKey: Boolean(req.apiKey), turnStartedAt: new Date() }
  const hasClientLeft = watchClientDisconnect(res)
  const userId = req.user.id
  const prerequisites = await loadPrerequisites(parsedRequest, userId)
  if (prerequisites.error) return res.status(prerequisites.status).json({ error: prerequisites.error })

  const requested = await loadRequestedBot(parsedRequest.botId, userId)
  if (requested.error) return res.status(requested.status).json({ error: requested.error })

  const { bot } = requested
  const request = applyBot(parsedRequest, bot)
  const resolved = await resolveConversation(conversationStore, request, { bot, userId })
  const { conversationId } = resolved

  openEventStream(res, conversationId)

  const context = await loadTurnContext(conversationStore, request, {
    conversationId,
    isNewConversation: resolved.isNewConversation,
    userId,
  })

  logIncomingMessage(request, { conversationId, ...context })

  const agentInput = buildAgentInput(
    buildUserTurn(request.message, {
      similarCases: context.similarCases,
      commands: context.newSkills.map(s => s.name),
      attachments: request.attachments,
    }),
    prerequisites.images
  )

  const turnContext = {
    res,
    conversationStore,
    request,
    bot,
    userId,
    conversationId,
    agentInput,
    turn: createTurnStream(res),
    context,
    hasClientLeft,
    turnKey,
    sender,
  }
  await inConversation(conversationStore, { bot, userId, resolved, res }, conversation => {
    return runChatTurn(turnContext, conversation)
  })

  sendEvent(res, { type: 'done' })
  res.end()
}

export default function chatRoute(conversationStore) {
  router.post('/', async (req, res) => {
    const { error, value: parsedRequest } = parseChatRequest(req.body)
    if (error) return res.status(400).json({ error })

    const turnKey = trackTurn(parsedRequest.requestId, req.user.id)
    try {
      await answerChat(conversationStore, { req, res, parsedRequest, turnKey })
    } finally {
      releaseTurn(turnKey)
    }
  })

  router.post('/stop', (req, res) => {
    const parsed = parseRequestId(req.body?.requestId)
    if (parsed.error || !parsed.value) return res.status(400).json({ error: 'Invalid request ID.' })

    stopTurn(parsed.value, req.user.id)
    res.status(204).end()
  })

  return router
}
