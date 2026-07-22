import { Agent, run, tool } from '@openai/agents'
import { z } from 'zod'
import config from '../config.js'
import {
  getDirectoryContents,
  getFileContents,
  searchCode,
  findFiles,
  gitLogFile,
  gitBlame,
  getDirectoryContentsAt,
  getFileContentsAt,
  searchCodeAt,
  findFilesAt,
  gitLogFileAt,
  gitBlameAt,
} from '../repo-pool/index.js'
import * as shortcut from '../shortcut/client.js'
import * as sentry from '../sentry/client.js'
import * as postgres from '../postgres/client.js'
import {
  getShortcutStoryTool,
  searchShortcutStoriesTool,
  getSentryIssueTool,
  searchSentryIssuesTool,
  listDatabaseSchemasTool,
  listDatabaseTablesTool,
  describeDatabaseTableTool,
  queryDatabaseTool,
} from '../agent/tools.js'
import { resolveModelForAgent, codexModelSettings } from '../openai/client.js'
import { buildReviewerInstructions } from './prompt.js'

const MAX_PR_BODY_CHARS = 4000
const MAX_INLINE_CHARS = 300
const REASONING_MODELS = /^(gpt-5|o\d)/i

// PR titles, author logins and file names are author-controlled. They are
// interpolated into Markdown structure (headings, metadata lines), so flatten
// whitespace to keep a crafted value from fabricating new sections.
export function inline(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_INLINE_CHARS)
}

export const reviewOutputSchema = z.object({
  summary: z.string(),
  verdict: z.enum(['comment', 'approve']),
  findings: z.array(
    z.object({
      path: z.string(),
      line: z.number().int().nullable(),
      severity: z.enum(['critical', 'major', 'minor', 'nit']),
      axis: z.enum(['correctness', 'standards', 'spec']),
      body: z.string(),
    })
  ),
})

// The chat agent's repo tools accept any `repo` argument. A reviewer that
// reads author-controlled text must not be able to wander into other
// repositories the shared token can access, so these tools are pinned to the
// PR's repository — the model never supplies a repo name. When the caller
// provides a rootPath (the PR-head worktree), the tools read that checkout;
// otherwise they fall back to the pool's default-branch clone.
export function buildRepoTools(repoFullName, rootPath = null) {
  const ops = {
    getDirectoryContents: p => (rootPath ? getDirectoryContentsAt(rootPath, p) : getDirectoryContents(repoFullName, p)),
    getFileContents: (p, o) => (rootPath ? getFileContentsAt(rootPath, p, o) : getFileContents(repoFullName, p, o)),
    searchCode: (q, o) => (rootPath ? searchCodeAt(rootPath, q, o) : searchCode(repoFullName, q, o)),
    findFiles: (p, o) => (rootPath ? findFilesAt(rootPath, p, o) : findFiles(repoFullName, p, o)),
    gitLogFile: (p, o) => (rootPath ? gitLogFileAt(rootPath, p, o) : gitLogFile(repoFullName, p, o)),
    gitBlame: (p, o) => (rootPath ? gitBlameAt(rootPath, p, o) : gitBlame(repoFullName, p, o)),
  }

  return [
    tool({
      name: 'get_directory_contents',
      description: 'List files and subdirectories at a given path inside the repository. Use empty path for root.',
      parameters: z.object({ path: z.string().default('') }),
      execute: async input => JSON.stringify(await ops.getDirectoryContents(input.path)),
    }),
    tool({
      name: 'get_file_contents',
      description:
        'Read the contents of a file. Returns up to `limit` lines starting at `offset`; the response includes totalLines, truncated, and nextOffset to read more.',
      parameters: z.object({
        path: z.string(),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(5000).default(2000),
      }),
      execute: async input =>
        JSON.stringify(await ops.getFileContents(input.path, { offset: input.offset, limit: input.limit })),
    }),
    tool({
      name: 'search_code',
      description:
        'Search the repository code. Returns matching {path, line, snippet} entries. Supports literal or regex search, case-insensitive matching, and a path glob filter (e.g. "*.js").',
      parameters: z.object({
        query: z.string(),
        pathGlob: z.string().default(''),
        caseInsensitive: z.boolean().default(false),
        regex: z.boolean().default(false),
        maxResults: z.number().int().min(1).max(100).default(100),
      }),
      execute: async input =>
        JSON.stringify(
          await ops.searchCode(input.query, {
            pathGlob: input.pathGlob,
            caseInsensitive: input.caseInsensitive,
            regex: input.regex,
            maxResults: input.maxResults,
          })
        ),
    }),
    tool({
      name: 'find_files',
      description:
        'Find files by name or path pattern (shell wildcards, e.g. "auth.js", "src/*/index.ts") without reading their content.',
      parameters: z.object({
        pattern: z.string(),
        maxResults: z.number().int().min(1).max(200).default(200),
      }),
      execute: async input => JSON.stringify(await ops.findFiles(input.pattern, { maxResults: input.maxResults })),
    }),
    tool({
      name: 'git_log_file',
      description:
        'Recent git history of a file: hash, author, date and subject of the last N commits that touched it.',
      parameters: z.object({
        path: z.string(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
      execute: async input => JSON.stringify(await ops.gitLogFile(input.path, { limit: input.limit })),
    }),
    tool({
      name: 'git_blame',
      description: 'Blame a file (optionally a line range) to see who last touched each line and when.',
      parameters: z.object({
        path: z.string(),
        startLine: z.number().int().min(1).default(1),
        endLine: z.number().int().min(1).nullable().default(null),
      }),
      execute: async input =>
        JSON.stringify(await ops.gitBlame(input.path, { startLine: input.startLine, endLine: input.endLine })),
    }),
  ]
}

// Data tools shared with the chat agent: the reviewer may pull the
// referenced Shortcut story, check Sentry issues, and query the read-only
// database. Resolved per agent so configuration changes are honored. Async
// because the Shortcut token, the Sentry credentials and the Postgres
// connection now live in the database (admin panel → Shortcut / Sentry /
// Database sections) and are resolved per turn.
export async function buildDataTools() {
  const [shortcutConfigured, sentryConfigured, postgresConfigured] = await Promise.all([
    shortcut.isConfigured(),
    sentry.isConfigured(),
    postgres.isConfigured(),
  ])
  return [
    ...(shortcutConfigured ? [getShortcutStoryTool, searchShortcutStoriesTool] : []),
    ...(sentryConfigured ? [getSentryIssueTool, searchSentryIssuesTool] : []),
    ...(postgresConfigured
      ? [listDatabaseSchemasTool, listDatabaseTablesTool, describeDatabaseTableTool, queryDatabaseTool]
      : []),
  ]
}

// Reasoning is opt-in per model family: sending reasoning settings to a model
// that does not support them fails the request. `none` (and empty) means
// "omit the setting", not an effort level the API would reject.
export function reasoningModelSettings(model) {
  // Codex models only accept `medium` (reasoning + verbosity); the shared helper
  // returns the codex-safe settings and suppresses the SDK's `low` gpt-5 defaults.
  const codexSettings = codexModelSettings(model)
  if (codexSettings) return { modelSettings: codexSettings }

  const effort = config.review.reasoningEffort
  const reasoningCapable = REASONING_MODELS.test(model)
  return effort && effort !== 'none' && reasoningCapable ? { modelSettings: { reasoning: { effort } } } : {}
}

export async function createReviewerAgent(repoFullName, { rootPath = null } = {}) {
  const model = await resolveModelForAgent()
  return new Agent({
    name: 'Soporti Reviewer',
    model,
    instructions: buildReviewerInstructions(repoFullName),
    tools: [...buildRepoTools(repoFullName, rootPath), ...(await buildDataTools())],
    outputType: reviewOutputSchema,
    ...reasoningModelSettings(model),
  })
}

export function buildReviewInput({ trigger, files, omitted, empty = [], standardsFiles = [], storyId = null }) {
  const parts = []

  parts.push(`# Pull Request #${trigger.prNumber} — ${inline(trigger.title)}`)
  parts.push(
    [
      `Repository: ${trigger.repoFullName}`,
      `Author: ${inline(trigger.authorLogin)}`,
      `Base: ${trigger.baseRef} ← head ${trigger.headSha}`,
      trigger.draft ? 'Status: draft' : 'Status: ready for review',
      `Changed lines: ${trigger.changedLines}`,
    ].join('\n')
  )

  const body = (trigger.body ?? '').trim()
  parts.push(`## Description\n\n${body ? body.slice(0, MAX_PR_BODY_CHARS) : '(no description)'}`)

  if (standardsFiles.length > 0) {
    const list = standardsFiles.map(p => `- ${inline(p)}`).join('\n')
    parts.push(
      `## Coding standards documents\n\nThese files document this repository's coding standards and decisions. Read them with your tools BEFORE reviewing; every standards finding must cite the document it violates:\n\n${list}`
    )
  }

  parts.push(
    storyId
      ? `## Spec\n\nThis PR references Shortcut story sc-${storyId}. Fetch it with get_shortcut_story (id: ${storyId}) and use it as the spec for the spec axis; follow its tasks or linked stories if you need more detail.`
      : '## Spec\n\n(no story reference detected — if the description references a Shortcut story and you have Shortcut tools, fetch it and use it as the spec; otherwise skip the spec axis and say so in your summary)'
  )

  const fileSections = (files ?? []).map(
    file =>
      `### ${inline(file.filename)} (${file.status ?? 'modified'}, +${file.additions ?? 0}/-${file.deletions ?? 0})\n` +
      '```diff\n' +
      `${file.patch}\n` +
      '```'
  )
  parts.push(`## Files changed\n\n${fileSections.join('\n\n') || '(no reviewable files)'}`)

  if (empty?.length > 0) {
    const list = empty.map(f => `- ${inline(f.filename)} (${f.status})`).join('\n')
    parts.push(
      `## Empty files\n\n${list}\n\nThese files are verified empty (0 bytes) — there is nothing inside to review, so they count as reviewed: do NOT report them as unreviewed. Only judge whether an empty file makes sense at that location (an empty \`__init__.py\` usually does; an empty module that should have content does not).`
    )
  }

  if (omitted?.length > 0) {
    const list = omitted.map(o => `- ${inline(o.filename)} (${o.reason})`).join('\n')
    parts.push(
      `## Files NOT included in this review\n\n${list}\n\nMention in your summary that these were not reviewed.`
    )
  }

  return parts.join('\n\n')
}

export async function runReviewerAgent({ trigger, files, omitted, empty, standardsFiles, storyId, rootPath = null }) {
  const agent = await createReviewerAgent(trigger.repoFullName, { rootPath })
  const input = buildReviewInput({ trigger, files, omitted, empty, standardsFiles, storyId })
  const result = await run(agent, input, { maxTurns: config.agent.maxIterations })
  return result.finalOutput
}
