import { Agent, MaxTurnsExceededError, run, tool } from '@openai/agents'
import { z } from 'zod'
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
  gitDiffAt,
  pageLines,
} from '../repo-pool/index.js'
import * as shortcut from '../shortcut/client.js'
import * as sentry from '../sentry/client.js'
import * as postgres from '../postgres/client.js'
import * as betterstack from '../betterstack/client.js'
import {
  getShortcutStoryTool,
  searchShortcutStoriesTool,
  getSentryIssueTool,
  searchSentryIssuesTool,
  listDatabaseSchemasTool,
  listDatabaseTablesTool,
  describeDatabaseTableTool,
  queryDatabaseTool,
  BETTERSTACK_TOOLS,
} from '../agent/tools.js'
import { resolveModelForAgent } from '../llm/model.js'
import { trackAgentRun } from '../agent/run-tracking.js'
import {
  DEFAULT_CONTEXT_LINES,
  DEFAULT_FILE_LINES,
  DEFAULT_FIND_RESULTS,
  MAX_FILE_LINES,
  MAX_FIND_RESULTS,
  MAX_SEARCH_RESULTS,
  REVIEW_TURN_LIMIT_ERROR,
} from '../constants.js'
import { renderNumberedPatch } from './diff.js'

const DEFAULT_DIFF_LINES = 1000
const OUTSIDE_PR_ERROR =
  'This path is not one of the files changed by this PR. Use a path from the "Files changed" list.'
const NO_DIFF_ERROR =
  'GitHub returned no patch for this file and there is no checkout of the PR head to diff it locally, so its diff cannot be read.'
const NOT_CHANGED_SINCE_ERROR =
  'This file did not change since your last review. Its full diff is inlined in the message or readable with get_file_diff.'
const NO_PATCH_SINCE_ERROR =
  'GitHub returned no patch for the changes to this file since your last review. Use its full diff instead: inlined in the message or readable with get_file_diff.'
const NO_OUTPUT_ERROR = 'The agent produced no output: the run most likely hit its turn limit.'

const findingSchema = z.object({
  path: z.string(),
  startLine: z.number().int().nullable(),
  line: z.number().int().nullable(),
  severity: z.enum(['critical', 'major', 'minor', 'nit']),
  category: z.enum(['bug', 'security', 'performance', 'maintainability', 'tests', 'standards', 'spec']),
  title: z.string(),
  body: z.string(),
  suggestion: z.string().nullable(),
  fixPrompt: z.string(),
})

export const overviewOutputSchema = z.object({
  walkthrough: z.string(),
  changes: z.array(z.object({ label: z.string(), files: z.array(z.string()), summary: z.string() })),
  effort: z.number().int(),
  reviewMinutes: z.number().int(),
  diagram: z.string().nullable(),
  previousFindings: z.string().nullable(),
  fixedThreads: z.array(z.string()),
  verdict: z.enum(['comment', 'approve']),
})

export const finderOutputSchema = z.object({
  findings: z.array(findingSchema),
  note: z.string(),
})

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
      description: `Read the contents of a file. Prefer a targeted window over a whole file: pass centerLine (a diff hunk line, a search_code match, a stacktrace frame) to get that line with contextLines on each side. Without centerLine it returns up to \`limit\` lines from \`offset\`, defaulting to the first ${DEFAULT_FILE_LINES}. The response includes totalLines, truncated and nextOffset to page when more is genuinely needed.`,
      parameters: z.object({
        path: z.string(),
        centerLine: z.number().int().min(1).nullable().default(null),
        contextLines: z.number().int().min(0).max(MAX_FILE_LINES).default(DEFAULT_CONTEXT_LINES),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(MAX_FILE_LINES).default(DEFAULT_FILE_LINES),
      }),
      execute: async input =>
        JSON.stringify(
          await ops.getFileContents(input.path, {
            offset: input.offset,
            limit: input.limit,
            centerLine: input.centerLine,
            contextLines: input.contextLines,
          })
        ),
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
        maxResults: z.number().int().min(1).max(MAX_SEARCH_RESULTS).default(MAX_SEARCH_RESULTS),
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
        maxResults: z.number().int().min(1).max(MAX_FIND_RESULTS).default(DEFAULT_FIND_RESULTS),
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

export function buildDiffTools({ files, changes = null, rootPath = null, diffBaseSha = null, inlinedPaths = [] }) {
  const prFiles = new Map(files.map(file => [file.filename, file]))
  const filesChangedSince = new Map((changes?.files ?? []).map(file => [file.filename, file]))
  const numberedDiffs = new Map()
  const servedLines = new Map()
  const reviewedPaths = new Set(inlinedPaths)

  async function loadPrDiff(file) {
    if (typeof file.patch === 'string') return file.patch
    if (!rootPath || !diffBaseSha) return null

    return gitDiffAt(rootPath, file.filename, { baseSha: diffBaseSha })
  }

  async function loadNumberedDiff(file) {
    if (!numberedDiffs.has(file.filename)) {
      const diff = await loadPrDiff(file)
      numberedDiffs.set(file.filename, diff === null ? null : renderNumberedPatch(diff))
    }

    return numberedDiffs.get(file.filename)
  }

  function recordServed(page) {
    const served = servedLines.get(page.path) ?? new Set()
    for (let line = page.offset; line < page.offset + page.lineCount; line++) served.add(line)

    servedLines.set(page.path, served)
    if (served.size >= page.totalLines) reviewedPaths.add(page.path)
  }

  const tools = [
    tool({
      name: 'get_file_diff',
      description: `Read the unified diff of one file changed by this PR. Every line starts with its RIGHT-side (new file) line number, the number to cite in findings; removed lines have none. Only paths from the "Files changed" list are accepted. Returns up to \`limit\` lines from \`offset\` (default ${DEFAULT_DIFF_LINES}); when the response is truncated, call again with nextOffset — a diff that was not inlined in the message counts as reviewed only once all of it was returned. Call it for several files in the same turn.`,
      parameters: diffPageParameters(),
      execute: async input => {
        const file = prFiles.get(input.path)
        if (!file) return JSON.stringify({ error: OUTSIDE_PR_ERROR })

        const diff = await loadNumberedDiff(file)
        if (diff === null) return JSON.stringify({ error: NO_DIFF_ERROR })

        const page = pageDiff(input, diff)
        recordServed(page)

        return JSON.stringify(page)
      },
    }),
  ]

  if (changes?.status === 'incremental') {
    tools.push(
      tool({
        name: 'get_diff_since_last_review',
        description:
          'Read what changed in one file between the commit of your last review and the current head, numbered like get_file_diff. Only paths from the "Changed since your last review" section are accepted. Pages like get_file_diff. It does not replace the full diff: a file counts as reviewed only once its full diff was inlined in the message or read with get_file_diff.',
        parameters: diffPageParameters(),
        execute: async input => {
          const file = filesChangedSince.get(input.path)
          if (!file) return JSON.stringify({ error: NOT_CHANGED_SINCE_ERROR })
          if (typeof file.patch !== 'string') return JSON.stringify({ error: NO_PATCH_SINCE_ERROR })

          return JSON.stringify(pageDiff(input, renderNumberedPatch(file.patch)))
        },
      })
    )
  }

  return { tools, reviewedPaths }
}

function diffPageParameters() {
  return z.object({
    path: z.string(),
    offset: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(MAX_FILE_LINES).default(DEFAULT_DIFF_LINES),
  })
}

function pageDiff({ path, offset, limit }, diff) {
  return { path, ...pageLines(diff.split('\n'), { offset, limit }, 'Diff') }
}

export async function buildDataTools() {
  const [shortcutConfigured, sentryConfigured, postgresConfigured, betterstackConfigured] = await Promise.all([
    shortcut.isConfigured(),
    sentry.isConfigured(),
    postgres.isConfigured(),
    betterstack.isConfigured(),
  ])
  return [
    ...(shortcutConfigured ? [getShortcutStoryTool, searchShortcutStoriesTool] : []),
    ...(sentryConfigured ? [getSentryIssueTool, searchSentryIssuesTool] : []),
    ...(postgresConfigured
      ? [listDatabaseSchemasTool, listDatabaseTablesTool, describeDatabaseTableTool, queryDatabaseTool]
      : []),
    ...(betterstackConfigured ? BETTERSTACK_TOOLS : []),
  ]
}

export async function runReviewAgent({
  name,
  instructions,
  tools,
  outputType,
  sharedContext,
  task,
  channel,
  subject,
  maxTurns,
  signal,
}) {
  const { model, modelSettings } = await resolveModelForAgent()
  const agent = new Agent({ name, model, instructions, tools, outputType, modelSettings })
  const input = `${sharedContext.text}\n\n${task}`

  try {
    const { result } = await trackAgentRun(
      { channel, subject, failureReason: runResult => (runResult?.finalOutput ? null : NO_OUTPUT_ERROR) },
      () => run(agent, input, { maxTurns, signal })
    )

    return result.finalOutput
  } catch (err) {
    if (err instanceof MaxTurnsExceededError) throw turnLimitError(maxTurns, err)
    throw err
  }
}

function turnLimitError(maxTurns, cause) {
  const err = new Error(`The run hit the turn limit of ${maxTurns} turns.`, { cause })
  err.code = REVIEW_TURN_LIMIT_ERROR
  err.maxTurns = maxTurns

  return err
}
