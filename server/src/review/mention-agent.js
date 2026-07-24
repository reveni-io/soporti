import { Agent, run } from '@openai/agents'
import config from '../config.js'
import { resolveModelForAgent } from '../openai/client.js'
import { buildRepoTools, buildDataTools, reasoningModelSettings, inline } from './agent.js'
import { buildMentionInstructions } from './prompt.js'

const MAX_PR_BODY_CHARS = 4000
const MAX_COMMENT_CHARS = 2000
const MAX_THREAD_COMMENTS = 30

export async function createMentionAgent(repoFullName, { rootPath = null } = {}) {
  const model = await resolveModelForAgent()
  return new Agent({
    name: 'Soporti Mention Responder',
    model,
    instructions: buildMentionInstructions(repoFullName),
    tools: [...buildRepoTools(repoFullName, rootPath), ...(await buildDataTools())],
    ...reasoningModelSettings(model),
  })
}

export function buildMentionInput({ mention, pr, thread = [] }) {
  const parts = []

  parts.push(`# Mention on Pull Request #${mention.prNumber} — ${inline(pr?.title)}`)
  parts.push(
    [
      `Repository: ${mention.repoFullName}`,
      `PR author: ${inline(pr?.user?.login)}`,
      `PR state: ${pr?.state ?? 'unknown'}`,
      `Base: ${pr?.base?.ref ?? ''} ← head ${pr?.head?.ref ?? ''} (${pr?.head?.sha ?? ''})`,
    ].join('\n')
  )

  const body = (pr?.body ?? '').trim()
  parts.push(`## PR description\n\n${body ? body.slice(0, MAX_PR_BODY_CHARS) : '(no description)'}`)

  if (mention.channel === 'review_thread') {
    const location = `File: ${inline(mention.path)}${mention.line ? `, line ${mention.line}` : ''}`
    parts.push(
      `## Review thread location\n\n${location}\n\n\`\`\`diff\n${(mention.diffHunk ?? '').slice(0, MAX_COMMENT_CHARS)}\n\`\`\``
    )
  }

  const comments = thread.slice(-MAX_THREAD_COMMENTS)
  if (comments.length > 0) {
    const rendered = comments
      .map(c => `**@${inline(c.user?.login)}**:\n${(c.body ?? '').slice(0, MAX_COMMENT_CHARS)}`)
      .join('\n\n---\n\n')
    parts.push(`## Conversation so far (oldest first)\n\n${rendered}`)
  }

  parts.push(
    `## The mention to answer\n\n**@${inline(mention.commentAuthor)}** mentioned you:\n${mention.commentBody.slice(0, MAX_COMMENT_CHARS)}\n\nWrite your reply to this comment now.`
  )

  return parts.join('\n\n')
}

export async function runMentionAgent({ mention, pr, thread, rootPath = null }) {
  const agent = await createMentionAgent(mention.repoFullName, { rootPath })
  const input = buildMentionInput({ mention, pr, thread })
  const result = await run(agent, input, { maxTurns: config.agent.maxIterations })
  return result.finalOutput
}
