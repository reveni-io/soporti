import {
  getPullRequest,
  listIssueComments,
  listReviewComments,
  createIssueComment,
  createReviewCommentReply,
} from '../github/client.js'
import { acquireWorkspace } from './workspace.js'
import { runMentionAgent } from './mention-agent.js'
import { redactSecrets } from './output-guard.js'

// Runs one Mention reply end to end: exactly one reply in
// the thread where Soporti was mentioned, never a review. Never throws —
// someone asked Soporti something, silence would be worse.
export async function runMention(mention, { logger = console } = {}) {
  const { repoFullName, prNumber, dedupeKey } = mention
  logger.log(`[review] Replying to ${dedupeKey} (${mention.channel})`)

  let workspace = null
  try {
    const pr = await getPullRequest(repoFullName, prNumber)
    workspace = await acquireWorkspace(repoFullName, prNumber, logger)
    const thread = await loadThread(mention, logger)

    const reply = await runMentionAgent({
      mention,
      pr,
      thread,
      rootPath: workspace?.localPath ?? null,
    })

    // Replies land at the bottom of the conversation, away from what they
    // answer: quoting the triggering comment pins the reply to it. The whole
    // body goes through the output guard — a mention is attacker-writable
    // input, and this is the exfiltration channel.
    const body = redactSecrets(`${quoteTrigger(mention)}\n\n${reply}`)
    if (mention.channel === 'review_thread') {
      await createReviewCommentReply(repoFullName, prNumber, mention.commentId, body)
    } else {
      await createIssueComment(repoFullName, prNumber, body)
    }

    logger.log(`[review] Replied to ${dedupeKey}`)
  } catch (err) {
    logger.error(`[review] Failed to reply to ${dedupeKey}:`, err)
    await postFailureNotice(mention, logger)
  } finally {
    await workspace?.release()
  }
}

// A Mention gets exactly one reply in its own thread — the
// failure notice honors that too: a review-thread mention is answered in the
// thread, not dropped into the PR conversation.
async function postFailureNotice(mention, logger) {
  const { repoFullName, prNumber, channel, commentId, dedupeKey } = mention
  const notice = '⚠️ Soporti could not reply to the mention. Mention it again to retry.'
  try {
    if (channel === 'review_thread') {
      await createReviewCommentReply(repoFullName, prNumber, commentId, notice)
    } else {
      await createIssueComment(repoFullName, prNumber, notice)
    }
  } catch (commentErr) {
    logger.error(`[review] Could not post the mention-failure notice for ${dedupeKey}:`, commentErr)
  }
}

// The quote identifies the comment, it doesn't reproduce it.
const MAX_QUOTE_CHARS = 300

function quoteTrigger(mention) {
  let text = mention.commentBody.replace(/\r\n/g, '\n').trim()
  if (text.length > MAX_QUOTE_CHARS) text = `${text.slice(0, MAX_QUOTE_CHARS)}…`
  // The author is named without an @ so the quote never re-notifies them.
  const [first, ...rest] = text.split('\n')
  return [`> **${mention.commentAuthor}**: ${first}`, ...rest.map(line => `> ${line}`)].join('\n')
}

// The GitHub thread is the conversation memory: replies stay coherent without
// any session state. Failures degrade to answering from the mention alone.
async function loadThread(mention, logger) {
  try {
    if (mention.channel === 'review_thread') {
      const all = await listReviewComments(mention.repoFullName, mention.prNumber)
      const rootId = mention.inReplyToId ?? mention.commentId
      return all.filter(c => (c.id === rootId || c.in_reply_to_id === rootId) && c.id !== mention.commentId)
    }

    const all = await listIssueComments(mention.repoFullName, mention.prNumber)
    return all.filter(c => c.id !== mention.commentId)
  } catch (err) {
    logger.warn(
      `[review] Could not load the thread for ${mention.dedupeKey} (${err.message}); replying from the mention alone`
    )
    return []
  }
}
