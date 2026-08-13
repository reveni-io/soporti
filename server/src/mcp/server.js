import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { isConfigured } from '../llm/model.js'
import { VALID_PROFILES } from '../agent/system-prompt.js'
import { listSkills } from '../db/skills.js'
import { MAX_SOURCES, MAX_SOURCE_LENGTH, MAX_SKILLS_PER_REQUEST } from '../constants.js'
import { appendFollowUpHint, executeAskSoporti, resolveScopedSources } from './ask-soporti.js'
import { executeListSources } from './list-sources.js'

const SERVER_INFO = { name: 'soporti', version: '1.0.0' }
const MAX_QUESTION_LENGTH = 10_000
const PROGRESS_HEARTBEAT_MS = 15_000
const NOT_CONFIGURED_ERROR = 'The assistant is not configured. Ask an admin to set the API key and model in /admin.'
const ANSWER_FAILED_ERROR = 'An internal error occurred while answering the question.'

const ASK_SOPORTI_CONFIG = {
  title: 'Ask Soporti',
  description:
    'Ask Soporti, the support engineering assistant, a question. It investigates across the configured sources ' +
    '(GitHub repos, Notion, Sentry, logs, the customer database...) and answers with a synthesis plus the sources ' +
    'it consulted. Long questions can take minutes; progress notifications are streamed while it works. The answer ' +
    'ends with the conversationId of the thread it opened, so pass that to follow_up to keep asking about it.',
  inputSchema: {
    question: z.string().min(1).max(MAX_QUESTION_LENGTH).describe('The question to investigate and answer.'),
    sources: z
      .array(z.string().min(1).max(MAX_SOURCE_LENGTH))
      .max(MAX_SOURCES)
      .optional()
      .describe(
        'Sources to restrict the investigation to: repo full names ("org/repo") or integration ids prefixed ' +
          'with "integration:" ("integration:sentry"). Call list_sources to see what is available. Omit to let ' +
          'the agent pick from every configured source.'
      ),
    profile: z
      .enum(VALID_PROFILES)
      .optional()
      .describe('Answer profile: "tech" for engineers, "support" for support agents (the default).'),
    skillIds: z
      .array(z.number().int().positive())
      .max(MAX_SKILLS_PER_REQUEST)
      .optional()
      .describe('IDs of stored skills to apply to this question. Call list_skills to see what is available.'),
  },
  annotations: { readOnlyHint: true },
}

const FOLLOW_UP_CONFIG = {
  title: 'Follow up on a Soporti thread',
  description:
    'Continue a Soporti thread with a follow-up question, so the assistant keeps everything it already ' +
    'investigated instead of starting over. Pass the conversationId that ask_soporti returned. The skills of the ' +
    'thread stay applied, but the follow-up may consult any source the API key allows, not only the ones the first ' +
    'question was restricted to.',
  inputSchema: {
    conversationId: z.uuid().describe('The conversationId of the thread to continue, as returned by ask_soporti.'),
    message: z.string().min(1).max(MAX_QUESTION_LENGTH).describe('The follow-up message for the assistant.'),
  },
  annotations: { readOnlyHint: true },
}

const LIST_SOURCES_CONFIG = {
  title: 'List the available sources',
  description:
    'List the sources Soporti can investigate: the GitHub repositories and the configured integrations. Use it to ' +
    'pick the "sources" argument of ask_soporti — for example only the repos and the issue tracker when drafting ' +
    'release notes. Only what this API key is allowed to reach is listed.',
  inputSchema: {},
  outputSchema: {
    repos: z.array(
      z.object({
        source: z.string().describe('The value to pass in the "sources" argument of ask_soporti.'),
        description: z.string(),
        language: z.string().nullable(),
      })
    ),
    integrations: z.array(
      z.object({
        source: z.string().describe('The value to pass in the "sources" argument of ask_soporti.'),
        name: z.string(),
        description: z.string(),
      })
    ),
  },
  annotations: { readOnlyHint: true },
}

const LIST_SKILLS_CONFIG = {
  title: 'List the invokable skills',
  description:
    'List the stored skills that can be applied to a question: reusable instructions that shape how Soporti ' +
    'investigates and answers. Pass the ids you want in the "skillIds" argument of ask_soporti.',
  inputSchema: {},
  outputSchema: {
    skills: z.array(
      z.object({
        id: z.number().int().describe('The value to pass in the "skillIds" argument of ask_soporti.'),
        name: z.string(),
        description: z.string(),
      })
    ),
  },
  annotations: { readOnlyHint: true },
}

function errorResult(text) {
  return { isError: true, content: [{ type: 'text', text }] }
}

function jsonResult(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }], structuredContent: payload }
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

export function createSoportiMcpServer({ user, apiKey, conversationStore } = {}) {
  const server = new McpServer(SERVER_INFO)

  async function answerTurn(ctx, { question, sources, profile, openThread }) {
    const progress = startProgress(ctx)

    try {
      const thread = await openThread()
      if (!thread) return errorResult('Conversation not found.')

      const { conversation, skillIds } = thread
      const { answer, lastResponseId, unpersistedItems, skills } = await executeAskSoporti({
        question,
        sources,
        profile,
        skillIds,
        userId: user.id,
        conversation,
        onProgress: progress.report,
        signal: ctx.mcpReq.signal,
      })

      await conversationStore.saveTurn(conversation.conversationId, {
        lastResponseId,
        session: conversation.session,
        unpersistedItems,
        uiMessages: [
          {
            role: 'user',
            parts: [
              ...skills.map(skill => ({ type: 'skill', skillId: skill.id, name: skill.name })),
              { type: 'text', content: question },
            ],
          },
          { role: 'assistant', parts: [{ type: 'text', content: answer }] },
        ],
      })

      return { content: [{ type: 'text', text: appendFollowUpHint(answer, conversation.conversationId) }] }
    } catch (err) {
      console.error('Failed to answer an MCP question:', err)
      return errorResult(ANSWER_FAILED_ERROR)
    } finally {
      progress.stop()
    }
  }

  server.registerTool('ask_soporti', ASK_SOPORTI_CONFIG, async (args, ctx) => {
    const question = args.question.trim()
    if (question.length === 0) return errorResult('Question cannot be empty.')

    if (!(await isConfigured())) return errorResult(NOT_CONFIGURED_ERROR)

    const { sources, denied } = resolveScopedSources(args.sources, apiKey?.sources)
    if (denied) return errorResult(`Sources not allowed for this API key: ${denied.join(', ')}.`)

    async function openThread() {
      return { conversation: await conversationStore.resolveWeb(null, user.id), skillIds: args.skillIds ?? [] }
    }

    return answerTurn(ctx, { question, sources, profile: args.profile, openThread })
  })

  server.registerTool('follow_up', FOLLOW_UP_CONFIG, async (args, ctx) => {
    const message = args.message.trim()
    if (message.length === 0) return errorResult('Message cannot be empty.')

    if (!(await isConfigured())) return errorResult(NOT_CONFIGURED_ERROR)

    const { sources } = resolveScopedSources(undefined, apiKey?.sources)

    async function openThread() {
      const conversation = await conversationStore.resolveExistingWeb(args.conversationId, user.id)
      if (!conversation) return null

      return { conversation, skillIds: await conversationStore.getInvokedSkillIds(conversation.conversationId) }
    }

    return answerTurn(ctx, { question: message, sources, openThread })
  })

  server.registerTool('list_sources', LIST_SOURCES_CONFIG, async () => {
    try {
      return jsonResult(await executeListSources({ userId: user.id, scope: apiKey?.sources }))
    } catch (err) {
      console.error('Failed to list the MCP sources:', err)
      return errorResult('An internal error occurred while listing the sources.')
    }
  })

  server.registerTool('list_skills', LIST_SKILLS_CONFIG, async () => {
    try {
      const skills = await listSkills(user.id)

      return jsonResult({
        skills: skills.map(skill => ({ id: skill.id, name: skill.name, description: skill.description ?? '' })),
      })
    } catch (err) {
      console.error('Failed to list the MCP skills:', err)
      return errorResult('An internal error occurred while listing the skills.')
    }
  })

  return server
}
