import { resolveReviewThread, updateReviewComment } from '../github/client.js'
import { shortSha } from '../github/sanitize.js'
import { redactSecrets } from './output-guard.js'

const ADDRESSED_NOTE = '✅ Addressed in commit'

export function selectFixedThreads(overview, history) {
  const refs = new Set(overview?.fixedThreads ?? [])

  return (history?.openThreads ?? []).filter(thread => refs.has(thread.ref))
}

export async function resolveFixedThreads({ repoFullName, prNumber, headSha, threads }, { logger = console, signal }) {
  const subject = `${repoFullName}#${prNumber}`

  for (const thread of threads) {
    if (signal?.aborted) {
      logger.log(`[review] Superseded ${subject}: leaving its fixed threads open`)
      return
    }

    await resolveFixedThread({ repoFullName, subject, headSha, thread }, logger)
  }
}

async function resolveFixedThread({ repoFullName, subject, headSha, thread }, logger) {
  try {
    if (!thread.body.includes(ADDRESSED_NOTE)) {
      await updateReviewComment(repoFullName, thread.commentId, markAddressed(thread.body, headSha))
    }

    await resolveReviewThread(thread.id)
  } catch (err) {
    logger.warn(`[review] Could not resolve the fixed thread ${thread.ref} on ${subject} (${err.message})`)
  }
}

function markAddressed(body, headSha) {
  return redactSecrets(`${body.trimEnd()}\n\n${ADDRESSED_NOTE} \`${shortSha(headSha)}\``)
}
