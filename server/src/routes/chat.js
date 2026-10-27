import { Router } from 'express'
import { run } from '@openai/agents'
import { traceAgentRun } from '../agent/run-tracking.js'
import { createAgent } from '../agent/assistant.js'
import { buildUserTurn } from '../agent/user-turn.js'
import config from '../config.js'
import { isValidTimezone } from '../schedules/next-run.js'
import { searchSimilarCases, isKnowledgeBaseConfigured } from '../knowledge/client.js'
import { storePendingFeedback } from '../knowledge/feedback.js'
import { buildSourcesFooter, isYoloMode } from '../agent/sources.js'
import { getCustomInstructions } from '../db/users.js'
import { getSkillsByIds } from '../db/skills.js'
import { isConfigured } from '../llm/model.js'
import { extractUsage, formatUsage, sumUsage } from '../llm/usage.js'
import { UNKNOWN_TOOL, toolCallFromRawItem, toolNames } from '../agent/run-items.js'
import { recordAgentRun } from '../db/agent-runs.js'
import { carriesImage, isValidAttachmentName } from '../documents/attachments.js'
import { buildAgentInput } from '../agent/agent-input.js'
import { getAttachmentImages } from '../db/attachment-images.js'
import {
  AGENT_CHANNEL_WEB,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_CHARS,
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_SKILLS_PER_REQUEST,
  RUN_STATUS_ERROR,
  RUN_STATUS_OK,
  UUID_RE,
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

function parseSkillIds(skillIds) {
  return (Array.isArray(skillIds) ? skillIds : [])
    .filter(id => Number.isInteger(id) && id > 0)
    .slice(0, MAX_SKILLS_PER_REQUEST)
}

function parseChatRequest(body) {
  const { sessionId, message, selectedSources, selectedRepos, profile, skillIds, attachments, timezone } = body

  const parsedMessage = parseMessage(message)
  if (parsedMessage.error) return parsedMessage
  if (sessionId && !UUID_RE.test(sessionId)) return { error: 'Invalid session ID.' }

  const parsedTimezone = parseTimezone(timezone)
  if (parsedTimezone.error) return parsedTimezone

  const parsedAttachments = parseAttachments(attachments)
  if (parsedAttachments.error) return parsedAttachments

  return {
    value: {
      sessionId,
      message: parsedMessage.value,
      sources: parseSources(selectedSources, selectedRepos),
      profile,
      skillIds: parseSkillIds(skillIds),
      attachments: parsedAttachments.value,
      timezone: parsedTimezone.value,
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
  const stream = await traceAgentRun(trace, () =>
    run(agent, agentInput, {
      stream: true,
      maxTurns: config.agent.maxIterations,
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

export default function chatRoute(conversationStore) {
  router.post('/', async (req, res) => {
    const { error, value: request } = parseChatRequest(req.body)
    if (error) return res.status(400).json({ error })

    let configured
    let resolvedImages
    try {
      ;[configured, resolvedImages] = await Promise.all([
        isConfigured(),
        resolveAttachmentImages(request.attachments, req.user.id),
      ])
    } catch (err) {
      console.error('Failed to load the attached images:', err)
      return res.status(500).json({ error: 'Failed to load the attached images.' })
    }

    if (!configured) {
      return res.status(503).json({
        error: 'The assistant is not configured. Ask an admin to set the API key and model in the admin panel.',
      })
    }
    if (resolvedImages.error) return res.status(400).json({ error: resolvedImages.error })

    const { conversationId, session, previousResponseId, isNewConversation } = await conversationStore.resolveWeb(
      request.sessionId,
      req.user.id
    )

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    sendEvent(res, { type: 'session_id', sessionId: conversationId })

    const [similarCases, customInstructions, carriedSkillIds] = await Promise.all([
      isNewConversation ? searchSimilarCases(request.message) : [],
      getCustomInstructions(req.user.id).catch(err => {
        console.error('Failed to load custom instructions:', err)
        return null
      }),
      conversationStore.getInvokedSkillIds(conversationId).catch(err => {
        console.error('Failed to load conversation skills:', err)
        return []
      }),
    ])

    const activeSkillIds = [...new Set([...carriedSkillIds, ...request.skillIds])].slice(0, MAX_SKILLS_PER_REQUEST)
    const invokedSkills = await loadInvokedSkills(activeSkillIds, req.user.id)
    const newSkills = invokedSkills.filter(s => request.skillIds.includes(s.id))

    logIncomingMessage(request, { conversationId, similarCases, customInstructions, invokedSkills, newSkills })

    const agentInput = buildAgentInput(
      buildUserTurn(request.message, {
        similarCases,
        commands: newSkills.map(s => s.name),
        attachments: request.attachments,
      }),
      resolvedImages.images
    )

    const turn = createTurnStream(res)

    try {
      const agent = await createAgent(request.sources, request.profile, {
        customInstructions: customInstructions ?? '',
        skills: invokedSkills,
        skillArguments: request.message,
        userId: req.user.id,
        conversationId,
        onArtifactPublished: turn.queueArtifact,
        onNestedToolCall: turn.startToolCall,
        onNestedToolResult: turn.finishToolCall,
        onNestedUsage: usage => turn.nestedUsage.push(usage),
        timezone: request.timezone,
      })
      const agentStart = Date.now()

      log('🚀', 'Agent started')

      const { lastResponseId, usage, unpersistedItems } = await runAgentTurnWithRetry(agent, agentInput, {
        session,
        previousResponseId,
        turn,
        trace: { sessionId: conversationId, userId: req.user.id, question: request.message },
      })

      const totalMs = Date.now() - agentStart
      log('✅', `Done in ${totalMs}ms`)

      const footer = isYoloMode(request.sources) ? buildSourcesFooter(turn.toolCalls) : null
      if (footer) turn.sendText(footer)

      const finalText = turn.parts
        .filter(p => p.type === 'text')
        .map(p => p.content)
        .join('')
      if (await isKnowledgeBaseConfigured()) {
        const feedbackId = storePendingFeedback(request.message, finalText)
        sendEvent(res, { type: 'feedback_id', feedbackId })
      }

      await conversationStore.saveTurn(conversationId, {
        lastResponseId,
        session,
        unpersistedItems,
        uiMessages: [
          { role: 'user', parts: buildUserParts(request, newSkills) },
          { role: 'assistant', parts: turn.parts },
        ],
      })

      await recordAgentRun({
        channel: AGENT_CHANNEL_WEB,
        status: RUN_STATUS_OK,
        userId: req.user.id,
        usage,
        durationMs: totalMs,
        tools: toolNames(turn.toolCalls),
      })
    } catch (err) {
      console.error('❌ Error:', err)
      await recordAgentRun({ channel: AGENT_CHANNEL_WEB, status: RUN_STATUS_ERROR, userId: req.user.id })
      sendEvent(res, { type: 'error', message: 'An internal error occurred.' })
    }

    sendEvent(res, { type: 'done' })
    res.end()
  })

  return router
}
