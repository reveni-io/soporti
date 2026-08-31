import { Router } from 'express'
import { run } from '@openai/agents'
import { createAgent } from '../agent/assistant.js'
import { buildUserTurn } from '../agent/user-turn.js'
import config from '../config.js'
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

function parseAttachments(value) {
  if (value === undefined || value === null) return { value: [] }
  if (!Array.isArray(value)) return { error: 'Attachments must be an array.' }
  if (value.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return { error: `Too many attachments (max ${MAX_ATTACHMENTS_PER_MESSAGE} per message).` }
  }

  const parsed = []
  for (const item of value) {
    const name = typeof item?.name === 'string' ? item.name.trim() : ''
    const text = typeof item?.text === 'string' ? item.text.trim() : ''
    const imageId = typeof item?.imageId === 'string' ? item.imageId.trim() : ''

    if (!name) return { error: 'Each attachment needs a "name".' }
    if (!isValidAttachmentName(name)) return { error: `Attachment "${name}" has an invalid file name.` }
    if (!text && !imageId) return { error: `Attachment "${name}" needs its extracted "text" or an "imageId".` }

    if (imageId) {
      if (!UUID_RE.test(imageId)) return { error: `Attachment "${name}" has an invalid image ID.` }

      parsed.push({ name, imageId })
      continue
    }

    if (text.length > MAX_ATTACHMENT_CHARS) {
      return { error: `Attachment "${name}" is too long (max ${MAX_ATTACHMENT_CHARS} characters).` }
    }

    parsed.push({ name, text, truncated: Boolean(item.truncated) })
  }

  return { value: parsed }
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

export default function chatRoute(conversationStore) {
  router.post('/', async (req, res) => {
    const { sessionId, message, selectedSources, selectedRepos, profile, skillIds, attachments } = req.body

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'A "message" string is required.' })
    }

    const trimmedMessage = message.trim()
    if (trimmedMessage.length === 0) {
      return res.status(400).json({ error: 'Message cannot be empty.' })
    }
    if (trimmedMessage.length > 10_000) {
      return res.status(400).json({ error: 'Message is too long (max 10,000 characters).' })
    }

    if (sessionId && !UUID_RE.test(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID.' })
    }

    const { error: attachmentsError, value: cleanAttachments } = parseAttachments(attachments)
    if (attachmentsError) return res.status(400).json({ error: attachmentsError })

    const rawSources = Array.isArray(selectedSources) ? selectedSources : selectedRepos
    const sources = Array.isArray(rawSources) ? rawSources : []

    const cleanSkillIds = (Array.isArray(skillIds) ? skillIds : [])
      .filter(id => Number.isInteger(id) && id > 0)
      .slice(0, MAX_SKILLS_PER_REQUEST)

    let configured
    let resolvedImages
    try {
      ;[configured, resolvedImages] = await Promise.all([
        isConfigured(),
        resolveAttachmentImages(cleanAttachments, req.user.id),
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

    const attachmentImages = resolvedImages.images

    const { conversationId, session, previousResponseId, isNewConversation } = await conversationStore.resolveWeb(
      sessionId,
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
      isNewConversation ? searchSimilarCases(trimmedMessage) : [],
      getCustomInstructions(req.user.id).catch(err => {
        console.error('Failed to load custom instructions:', err)
        return null
      }),
      conversationStore.getInvokedSkillIds(conversationId).catch(err => {
        console.error('Failed to load conversation skills:', err)
        return []
      }),
    ])

    const activeSkillIds = [...new Set([...carriedSkillIds, ...cleanSkillIds])].slice(0, MAX_SKILLS_PER_REQUEST)
    const invokedSkills =
      activeSkillIds.length > 0
        ? await getSkillsByIds(activeSkillIds, req.user.id).catch(err => {
            console.error('Failed to load skills:', err)
            return []
          })
        : []
    console.log(`\n${'─'.repeat(60)}`)
    log('📩', `New message: "${trimmedMessage.slice(0, 120)}"`)
    log('📂', `Sources: ${sources.length > 0 ? sources.join(', ') : '(none selected)'}`)
    log('💬', `Conversation: ${conversationId}`)
    if (similarCases.length > 0) {
      log('📚', `Found ${similarCases.length} similar case(s)`)
    }
    if (customInstructions) {
      log('🧭', `Custom instructions applied (${customInstructions.length} chars)`)
    }
    if (cleanAttachments.length > 0) {
      log('📎', `Attachment(s): ${cleanAttachments.map(describeAttachment).join(', ')}`)
    }
    const newlyInvokedSkills = invokedSkills.filter(s => cleanSkillIds.includes(s.id))
    if (invokedSkills.length > 0) {
      const described = invokedSkills.map(s => (newlyInvokedSkills.includes(s) ? s.name : `${s.name} (carried over)`))
      log('⚡', `Skill(s) applied: ${described.join(', ')}`)
    }

    const agentInput = buildAgentInput(
      buildUserTurn(trimmedMessage, {
        similarCases,
        commands: newlyInvokedSkills.map(s => s.name),
        attachments: cleanAttachments,
      }),
      attachmentImages
    )

    const assistantParts = []
    let lastResponseId
    let unpersistedItems = null
    let runUsage = null

    const publishedArtifacts = []
    const toolCalls = []
    const nestedUsage = []

    try {
      const agent = await createAgent(sources, profile, {
        customInstructions: customInstructions ?? '',
        skills: invokedSkills,
        skillArguments: trimmedMessage,
        userId: req.user.id,
        conversationId,
        onArtifactPublished: artifact => publishedArtifacts.push(artifact),
        onNestedToolCall: startToolCall,
        onNestedToolResult: finishToolCall,
        onNestedUsage: usage => nestedUsage.push(usage),
      })
      const agentStart = Date.now()

      log('🚀', 'Agent started')

      const toolStartTimes = new Map()
      const callIdToName = new Map()
      let sentContent = false

      function startToolCall({ name, arguments: rawArgs, callId, parent = null }) {
        const toolName = name || UNKNOWN_TOOL
        const toolArgs = rawArgs || '{}'

        if (callId) {
          toolStartTimes.set(callId, Date.now())
          callIdToName.set(callId, toolName)
        }

        toolCalls.push({ name: toolName, arguments: toolArgs })
        const input = sanitizeInput(toolArgs)
        assistantParts.push({ type: 'tool_call', tool: toolName, input, done: false, parent })

        sentContent = true
        log(parent ? NESTED_START : TOOL_START, `${toolName}(${toolArgs.slice(0, 100)})`)
        sendEvent(res, { type: 'tool_start', tool: toolName, input, parent })
      }

      function finishToolCall({ name, callId, parent = null }) {
        const toolName = name || callIdToName.get(callId) || UNKNOWN_TOOL
        const startTime = callId ? toolStartTimes.get(callId) : undefined
        const durationMs = startTime ? Date.now() - startTime : undefined

        for (let i = assistantParts.length - 1; i >= 0; i--) {
          const part = assistantParts[i]
          if (part.type === 'tool_call' && part.tool === toolName && part.parent === parent && !part.done) {
            part.done = true
            if (durationMs) part.durationMs = durationMs
            break
          }
        }

        log(
          parent ? NESTED_DONE : TOOL_DONE,
          durationMs ? `${toolName} completed in ${durationMs}ms` : `${toolName} completed`
        )
        sendEvent(res, { type: 'tool_end', tool: toolName, parent })
      }

      async function runTurn(prevResponseId) {
        const stream = await run(agent, agentInput, {
          stream: true,
          maxTurns: config.agent.maxIterations,
          session,
          previousResponseId: prevResponseId,
        })

        for await (const event of stream.toStream()) {
          if (event.type === 'raw_model_stream_event') {
            const data = event.data
            if (data.type === 'output_text_delta') {
              sentContent = true
              appendText(assistantParts, data.delta)
              sendEvent(res, { type: 'text_delta', text: data.delta })
            }
          } else if (event.type === 'run_item_stream_event') {
            const item = event.item

            if (item.type === 'tool_call_item') {
              startToolCall(toolCallFromRawItem(item.rawItem))
            } else if (item.type === 'tool_call_output_item') {
              finishToolCall(toolCallFromRawItem(item.rawItem))

              while (publishedArtifacts.length > 0) {
                const artifact = publishedArtifacts.shift()
                assistantParts.push({ type: 'artifact', ...artifact })
                sendEvent(res, { type: 'artifact', ...artifact })
              }
            }
          }
        }

        await stream.completed

        runUsage = sumUsage([extractUsage(stream.state?.usage), ...nestedUsage])
        const usage = formatUsage(stream.state?.usage)
        if (usage) log('📊', usage)

        unpersistedItems = prevResponseId ? stream.history : null
        return stream.lastResponseId
      }

      try {
        lastResponseId = await runTurn(previousResponseId)
      } catch (err) {
        if (previousResponseId && !sentContent) {
          log('♻️', `Retrying without previousResponseId (${err.message})`)
          lastResponseId = await runTurn(undefined)
        } else {
          throw err
        }
      }

      const totalMs = Date.now() - agentStart
      log('✅', `Done in ${totalMs}ms`)

      if (isYoloMode(sources)) {
        const footer = buildSourcesFooter(toolCalls)
        if (footer) {
          appendText(assistantParts, footer)
          sendEvent(res, { type: 'text_delta', text: footer })
        }
      }

      const finalText = assistantParts
        .filter(p => p.type === 'text')
        .map(p => p.content)
        .join('')
      if (await isKnowledgeBaseConfigured()) {
        const feedbackId = storePendingFeedback(trimmedMessage, finalText)
        sendEvent(res, { type: 'feedback_id', feedbackId })
      }

      const userParts = [
        ...newlyInvokedSkills.map(s => ({ type: 'skill', skillId: s.id, name: s.name })),
        ...cleanAttachments.map(a => ({
          type: 'attachment',
          name: a.name,
          truncated: Boolean(a.truncated),
          imageId: a.imageId ?? null,
        })),
        { type: 'text', content: trimmedMessage },
      ]

      await conversationStore.saveTurn(conversationId, {
        lastResponseId,
        session,
        unpersistedItems,
        uiMessages: [
          { role: 'user', parts: userParts },
          { role: 'assistant', parts: assistantParts },
        ],
      })

      await recordAgentRun({
        channel: AGENT_CHANNEL_WEB,
        status: RUN_STATUS_OK,
        userId: req.user.id,
        usage: runUsage,
        durationMs: totalMs,
        tools: toolNames(toolCalls),
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
