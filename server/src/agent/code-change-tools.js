import { z } from 'zod'
import { tool } from '@openai/agents'
import { findUserById } from '../db/users.js'
import { guardRepoSelection, OPEN_PULL_REQUEST_TOOL_NAME } from './sources.js'

const REPO_PARAM = z.string().describe('Full repository name "owner/repo".')
const PATH_PARAM = z.string().describe('File path inside the repo, from its root (e.g. "src/routes/orders.js").')

const WORKING_COPY_NOTE =
  'The change is staged in your private working copy of the latest default branch: nothing reaches GitHub until open_pull_request, and until then get_file_contents, search_code and the other read tools show your pending edits.'

const BLOCKED_PATHS_NOTE =
  'Files under .github/ (workflows and CI) cannot be written, and neither can .env files, .git or node_modules.'

async function resolveRequester(userId) {
  if (!userId) return null

  const user = await findUserById(userId)

  return user?.name || null
}

export function buildCodeChangeTools({ session, allowedRepos = null, userId = null }) {
  const guard = guardRepoSelection(allowedRepos)

  return [
    tool({
      name: 'edit_file',
      description: `Replace an exact piece of text in a file of a repository. This CHANGES CODE: only call it when the request you are answering asks for a code change. ${WORKING_COPY_NOTE}

Read the lines first with get_file_contents and copy oldText from it verbatim — whitespace and indentation included. oldText must appear exactly once in the file unless replaceAll is true; when it appears more than once, add surrounding lines until it is unique. The response gives the number of replacements and a preview of the edited lines: check it before moving on. ${BLOCKED_PATHS_NOTE}`,
      parameters: z.object({
        repo: REPO_PARAM,
        path: PATH_PARAM,
        oldText: z.string().describe('The exact text to replace, copied verbatim from the file.'),
        newText: z.string().describe('The text that takes its place. An empty string deletes oldText.'),
        replaceAll: z
          .boolean()
          .default(false)
          .describe('True to replace every occurrence of oldText instead of requiring exactly one.'),
      }),
      execute: guard(async input => {
        const result = await session.editFile(input.repo, input.path, {
          oldText: input.oldText,
          newText: input.newText,
          replaceAll: input.replaceAll,
        })
        return JSON.stringify(result)
      }),
    }),
    tool({
      name: 'write_file',
      description: `Create a file, or replace the whole content of one, in a repository. This CHANGES CODE: only call it when the request you are answering asks for a code change. ${WORKING_COPY_NOTE}

Use it for new files. To change part of an existing file use edit_file instead: rewriting a whole file loses every line you did not reproduce exactly. The response says whether the file was created. ${BLOCKED_PATHS_NOTE}`,
      parameters: z.object({
        repo: REPO_PARAM,
        path: PATH_PARAM,
        content: z.string().describe('The complete content of the file, ending with a newline.'),
      }),
      execute: guard(async input => {
        const result = await session.writeFile(input.repo, input.path, input.content)
        return JSON.stringify(result)
      }),
    }),
    tool({
      name: 'delete_file',
      description: `Delete a file from a repository. This CHANGES CODE: only call it when the request you are answering asks for it, and search for anything that still imports or references the file first. ${WORKING_COPY_NOTE} ${BLOCKED_PATHS_NOTE}`,
      parameters: z.object({
        repo: REPO_PARAM,
        path: PATH_PARAM,
      }),
      execute: guard(async input => {
        const result = await session.deleteFile(input.repo, input.path)
        return JSON.stringify(result)
      }),
    }),
    tool({
      name: 'continue_pull_request',
      description:
        'Pick up an open pull request that Soporti opened earlier — its branch starts with "soporti/" — so the edits you make next land on top of it and the next open_pull_request pushes a new commit to that same pull request instead of opening another. Call it before your first edit whenever the request is a follow-up to an existing pull request: one opened in an earlier turn, another thread or another conversation. It changes nothing on GitHub by itself. Pull requests opened by people or by other tools cannot be continued. Returns the number, url, title and branch.',
      parameters: z.object({
        repo: REPO_PARAM,
        number: z
          .number()
          .int()
          .min(1)
          .describe('Pull request number, e.g. 42 for https://github.com/org/app/pull/42.'),
      }),
      execute: guard(async input => {
        const result = await session.continuePullRequest(input.repo, input.number)
        return JSON.stringify(result)
      }),
    }),
    tool({
      name: OPEN_PULL_REQUEST_TOOL_NAME,
      description:
        'Publish your pending edits to a repository as a DRAFT pull request. This WRITES to GitHub: it commits every pending edit on the repo, pushes a new "soporti/…" branch and opens a draft pull request against the default branch. When a pull request is already loaded for the repo — opened by an earlier open_pull_request of this conversation or picked up with continue_pull_request — it pushes the new commit to that pull request instead. Call it once the change is complete and you have re-read the edited lines. Returns the number, url, title, branch, `draft`, `created` (false when the commit went to an existing pull request) and the files it touched with their status. A person still has to review the pull request and mark it ready: share its url.',
      parameters: z.object({
        repo: REPO_PARAM,
        title: z
          .string()
          .describe(
            'Pull request title, following the repository\'s convention (e.g. Conventional Commits like "fix(api): handle empty carts" when its history uses them). It is also the commit message, so for a follow-up to an existing pull request, whose title and body stay as they are, write a one-line summary of the follow-up change.'
          ),
        body: z
          .string()
          .describe(
            "Markdown body: the repository's .github/pull_request_template.md filled in when it has one, otherwise what changed and why. Always say that nothing was run and that CI will check it."
          ),
      }),
      execute: guard(async input => {
        const requestedBy = await resolveRequester(userId)
        const result = await session.openPullRequest(input.repo, { title: input.title, body: input.body, requestedBy })
        return JSON.stringify(result)
      }),
    }),
  ]
}
