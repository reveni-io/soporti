import { Router } from 'express'
import { run } from '@openai/agents'
import { createAgent } from '../agent/assistant.js'
import config from '../config.js'
import { searchSimilarCases, isKnowledgeBaseConfigured } from '../knowledge/client.js'
import { storePendingFeedback } from '../knowledge/feedback.js'
import { buildSourcesFooter, isYoloMode } from '../agent/sources.js'
import { getCustomInstructions } from '../db/users.js'
import { getOpenAIClient } from '../openai/client.js'

const router = Router()

function sendEvent(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

function log(icon, ...args) {
  const timestamp = new Date().toISOString().slice(11, 23)
  console.log(`[${timestamp}] ${icon}`, ...args)
}

const SAFE_INPUT_FIELDS = ['repo', 'path', 'query']

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

// Appends a text chunk to the running parts array, merging into the trailing
// text part so the persisted history mirrors what useChat builds in the browser.
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
    // "selectedRepos" is the legacy field name, still accepted for clients
    // loaded before the rename to "selectedSources".
    const { sessionId, message, selectedSources, selectedRepos, profile } = req.body

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

    if (sessionId && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID.' })
    }

    const rawSources = Array.isArray(selectedSources) ? selectedSources : selectedRepos
    const sources = Array.isArray(rawSources) ? rawSources : []

    // Resolve (and register as the Agents SDK default) the DB-configured OpenAI
    // client before building the session: the compaction session constructs its
    // client eagerly, so a missing key must fail cleanly here rather than throw
    // while resolving the session — which, before the SSE headers are sent,
    // would hang the request.
    if (!(await getOpenAIClient())) {
      return res
        .status(503)
        .json({ error: 'OpenAI is not configured. Ask an admin to set the API key in the admin panel.' })
    }

    const { conversationId, session, previousResponseId } = await conversationStore.resolveWeb(sessionId, req.user.id)

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    sendEvent(res, { type: 'session_id', sessionId: conversationId })

    const [items, similarCases, customInstructions] = await Promise.all([
      session.getItems(),
      searchSimilarCases(trimmedMessage),
      getCustomInstructions(req.user.id).catch(err => {
        console.error('Failed to load custom instructions:', err)
        return null
      }),
    ])
    console.log(`\n${'─'.repeat(60)}`)
    log('📩', `New message: "${trimmedMessage.slice(0, 120)}"`)
    log('📂', `Sources: ${sources.length > 0 ? sources.join(', ') : '(none selected)'}`)
    log('💬', `Conversation: ${conversationId} (history: ${items.length} items)`)
    if (similarCases.length > 0) {
      log('📚', `Found ${similarCases.length} similar case(s)`)
    }
    if (customInstructions) {
      log('🧭', `Custom instructions applied (${customInstructions.length} chars)`)
    }

    const assistantParts = []
    let lastResponseId

    try {
      const agent = await createAgent(sources, profile, similarCases, {
        customInstructions: customInstructions ?? '',
      })
      const agentStart = Date.now()

      log('🚀', 'Agent started')

      const toolStartTimes = new Map()
      const callIdToName = new Map()
      const toolCalls = []
      let sentContent = false

      // Runs one streaming turn. On the first attempt we chain the persisted
      // previousResponseId; if OpenAI has expired it (and nothing has been sent
      // to the client yet) we retry once without it, relying on the items in DB.
      async function runTurn(prevResponseId) {
        // Keep the SDK default reasoningItemIdPolicy ('preserve') — reasoning
        // items must stay paired with their function_call. Rationale lives on
        // PostgresSession.getItems, which sanitizes replayed history.
        const stream = await run(agent, trimmedMessage, {
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
              const toolName = item.rawItem?.name || 'unknown'
              const toolArgs = item.rawItem?.arguments || '{}'
              const callId = item.rawItem?.callId || item.rawItem?.id

              if (callId) {
                toolStartTimes.set(callId, Date.now())
                callIdToName.set(callId, toolName)
              }

              toolCalls.push({ name: toolName, arguments: toolArgs })
              const input = sanitizeInput(toolArgs)
              assistantParts.push({ type: 'tool_call', tool: toolName, input, done: false })

              sentContent = true
              log('  →', `${toolName}(${toolArgs.slice(0, 100)})`)
              sendEvent(res, { type: 'tool_start', tool: toolName, input })
            } else if (item.type === 'tool_call_output_item') {
              const callId = item.rawItem?.callId
              const toolName = item.rawItem?.name || callIdToName.get(callId) || 'unknown'
              const startTime = callId ? toolStartTimes.get(callId) : undefined
              const durationMs = startTime ? Date.now() - startTime : undefined

              for (let i = assistantParts.length - 1; i >= 0; i--) {
                const p = assistantParts[i]
                if (p.type === 'tool_call' && p.tool === toolName && !p.done) {
                  p.done = true
                  if (durationMs) p.durationMs = durationMs
                  break
                }
              }

              if (durationMs) {
                log('  ✓', `${toolName} completed in ${durationMs}ms`)
              } else {
                log('  ✓', `${toolName} completed`)
              }

              sendEvent(res, { type: 'tool_end', tool: toolName })
            }
          }
        }

        await stream.completed
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
      // Only offer the 👍/👎 feedback when the knowledge base is configured —
      // a saved case needs a vector store to land in, so without one the
      // thumbs would lead nowhere.
      if (await isKnowledgeBaseConfigured()) {
        const feedbackId = storePendingFeedback(trimmedMessage, finalText)
        sendEvent(res, { type: 'feedback_id', feedbackId })
      }

      await conversationStore.saveTurn(conversationId, {
        lastResponseId,
        uiMessages: [
          { role: 'user', parts: [{ type: 'text', content: trimmedMessage }] },
          { role: 'assistant', parts: assistantParts },
        ],
      })
    } catch (err) {
      console.error('❌ Error:', err)
      sendEvent(res, { type: 'error', message: 'An internal error occurred.' })
    }

    sendEvent(res, { type: 'done' })
    res.end()
  })

  return router
}
