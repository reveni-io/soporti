import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { isConfigured } from '../llm/model.js'
import { VALID_PROFILES } from '../agent/system-prompt.js'
import { MAX_SOURCES, MAX_SOURCE_LENGTH, MAX_SKILLS_PER_REQUEST } from '../constants.js'
import { executeAskSoporti, resolveScopedSources } from './ask-soporti.js'

const SERVER_INFO = { name: 'soporti', version: '1.0.0' }
const MAX_QUESTION_LENGTH = 10_000
const PROGRESS_HEARTBEAT_MS = 15_000

const ASK_SOPORTI_CONFIG = {
  title: 'Ask Soporti',
  description:
    'Ask Soporti, the support engineering assistant, a question. It investigates across the configured sources ' +
    '(GitHub repos, Notion, Sentry, logs, the customer database...) and answers with a synthesis plus the sources ' +
    'it consulted. Long questions can take minutes; progress notifications are streamed while it works.',
  inputSchema: {
    question: z.string().min(1).max(MAX_QUESTION_LENGTH).describe('The question to investigate and answer.'),
    sources: z
      .array(z.string().min(1).max(MAX_SOURCE_LENGTH))
      .max(MAX_SOURCES)
      .optional()
      .describe(
        'Sources to restrict the investigation to: repo full names ("org/repo") or integration ids prefixed ' +
          'with "integration:" ("integration:sentry"). Omit to let the agent pick from every configured source.'
      ),
    profile: z
      .enum(VALID_PROFILES)
      .optional()
      .describe('Answer profile: "tech" for engineers, "support" for support agents (the default).'),
    skillIds: z
      .array(z.number().int().positive())
      .max(MAX_SKILLS_PER_REQUEST)
      .optional()
      .describe('IDs of stored skills to apply to this question.'),
  },
  annotations: { readOnlyHint: true },
}

function errorResult(text) {
  return { isError: true, content: [{ type: 'text', text }] }
}

function startProgress(ctx) {
  const progressToken = ctx.mcpReq._meta?.progressToken

  if (progressToken === undefined) {
    return { report: () => {}, stop: () => {} }
  }

  let step = 0
  let streamGone = false

  async function send(message) {
    if (streamGone) return

    step += 1
    try {
      await ctx.mcpReq.notify({
        method: 'notifications/progress',
        params: { progressToken, progress: step, message },
      })
    } catch (err) {
      streamGone = true
      clearInterval(heartbeat)
      console.error('Failed to send MCP progress, stopping notifications:', err.message)
    }
  }

  const heartbeat = setInterval(() => {
    send('Still working...')
  }, PROGRESS_HEARTBEAT_MS)

  return { report: send, stop: () => clearInterval(heartbeat) }
}

export function createSoportiMcpServer({ user, apiKey } = {}) {
  const server = new McpServer(SERVER_INFO)

  server.registerTool('ask_soporti', ASK_SOPORTI_CONFIG, async (args, ctx) => {
    const question = args.question.trim()
    if (question.length === 0) return errorResult('Question cannot be empty.')

    if (!(await isConfigured())) {
      return errorResult('The assistant is not configured. Ask an admin to set the API key and model in /admin.')
    }

    const { sources, denied } = resolveScopedSources(args.sources, apiKey?.sources)
    if (denied) return errorResult(`Sources not allowed for this API key: ${denied.join(', ')}.`)

    const progress = startProgress(ctx)

    try {
      const answer = await executeAskSoporti({
        question,
        sources,
        profile: args.profile,
        skillIds: args.skillIds ?? [],
        userId: user.id,
        onProgress: progress.report,
        signal: ctx.mcpReq.signal,
      })

      return { content: [{ type: 'text', text: answer }] }
    } catch (err) {
      console.error('Failed to answer an MCP question:', err)
      return errorResult('An internal error occurred while answering the question.')
    } finally {
      progress.stop()
    }
  })

  return server
}
