import { describe, it, expect } from 'vitest'
import { detectMention } from './mention-trigger.js'

function issuePayload(overrides = {}) {
  return {
    action: 'created',
    repository: { full_name: 'acme-io/app' },
    issue: { number: 7, pull_request: { url: 'https://api.github.com/repos/acme-io/app/pulls/7' } },
    comment: { id: 100, body: 'Hey @soporti-bot, does this match sc-1234?', user: { login: 'dev' } },
    ...overrides,
  }
}

function reviewCommentPayload(overrides = {}) {
  return {
    action: 'created',
    repository: { full_name: 'acme-io/app' },
    pull_request: { number: 7 },
    comment: {
      id: 200,
      body: '@Soporti-Bot why is this rounded here?',
      user: { login: 'dev' },
      path: 'src/refunds.js',
      line: 12,
      diff_hunk: '@@ -1 +1,2 @@',
      in_reply_to_id: 150,
    },
    ...overrides,
  }
}

describe('detectMention', () => {
  it('detects a mention in a PR conversation comment', () => {
    const mention = detectMention({ eventName: 'issue_comment', payload: issuePayload(), reviewerLogin: 'soporti-bot' })

    expect(mention).toEqual({
      kind: 'mention',
      channel: 'issue',
      repoFullName: 'acme-io/app',
      prNumber: 7,
      commentId: 100,
      commentBody: 'Hey @soporti-bot, does this match sc-1234?',
      commentAuthor: 'dev',
      dedupeKey: 'acme-io/app#7@mention-100',
    })
  })

  it('detects a mention in a review thread comment, case-insensitively', () => {
    const mention = detectMention({
      eventName: 'pull_request_review_comment',
      payload: reviewCommentPayload(),
      reviewerLogin: 'soporti-bot',
    })

    expect(mention).toMatchObject({
      kind: 'mention',
      channel: 'review_thread',
      repoFullName: 'acme-io/app',
      prNumber: 7,
      commentId: 200,
      path: 'src/refunds.js',
      line: 12,
      diffHunk: '@@ -1 +1,2 @@',
      inReplyToId: 150,
      dedupeKey: 'acme-io/app#7@mention-200',
    })
  })

  it('ignores comments authored by the reviewer itself (loop prevention)', () => {
    const payload = issuePayload()
    payload.comment.user.login = 'Soporti-Bot'

    expect(detectMention({ eventName: 'issue_comment', payload, reviewerLogin: 'soporti-bot' })).toBeNull()
  })

  it('ignores comments that do not really mention the login', () => {
    for (const body of [
      'no mention here',
      'ping @soporti-botX please',
      'mail me at jose@example.com',
      'ask @soporti-bot-ops about this', // hyphenated login is a different user
    ]) {
      const payload = issuePayload()
      payload.comment.body = body
      expect(detectMention({ eventName: 'issue_comment', payload, reviewerLogin: 'soporti-bot' })).toBeNull()
    }
  })

  it('ignores edited and deleted comment events (one mention, one reply)', () => {
    for (const action of ['edited', 'deleted']) {
      expect(
        detectMention({ eventName: 'issue_comment', payload: issuePayload({ action }), reviewerLogin: 'soporti-bot' })
      ).toBeNull()
    }
  })

  it('ignores comments on plain issues (not pull requests)', () => {
    const payload = issuePayload({ issue: { number: 7 } })
    expect(detectMention({ eventName: 'issue_comment', payload, reviewerLogin: 'soporti-bot' })).toBeNull()
  })

  it('ignores mentions until the reviewer login is resolved', () => {
    expect(detectMention({ eventName: 'issue_comment', payload: issuePayload(), reviewerLogin: null })).toBeNull()
  })

  it('ignores malformed repository names and unrelated events', () => {
    const payload = issuePayload({ repository: { full_name: 'not a repo' } })
    expect(detectMention({ eventName: 'issue_comment', payload, reviewerLogin: 'soporti-bot' })).toBeNull()
    expect(detectMention({ eventName: 'push', payload: issuePayload(), reviewerLogin: 'soporti-bot' })).toBeNull()
  })

  it('turns a review command from a collaborator into a review of the current head', () => {
    const payload = issuePayload()
    payload.comment.body = '@soporti-bot review'
    payload.comment.author_association = 'COLLABORATOR'

    const job = detectMention({ eventName: 'issue_comment', payload, reviewerLogin: 'soporti-bot' })

    expect(job).toEqual({
      kind: 'mention_command',
      channel: 'issue',
      commentId: 100,
      repoFullName: 'acme-io/app',
      prNumber: 7,
      headSha: 'HEAD',
      baseRef: '',
      title: '',
      body: '',
      authorLogin: '',
      draft: false,
      changedLines: 0,
      dedupeKey: 'acme-io/app#7@HEAD',
      supersedeKey: 'acme-io/app#7',
    })
  })

  it('accepts the review command in a review thread, case-insensitively and with trailing text', () => {
    const payload = reviewCommentPayload()
    payload.comment.body = '  @Soporti-Bot REVIEW please, I pushed the fix'
    payload.comment.author_association = 'OWNER'

    const job = detectMention({ eventName: 'pull_request_review_comment', payload, reviewerLogin: 'soporti-bot' })

    expect(job).toMatchObject({
      kind: 'mention_command',
      channel: 'review_thread',
      commentId: 200,
      prNumber: 7,
      dedupeKey: 'acme-io/app#7@HEAD',
      supersedeKey: 'acme-io/app#7',
    })
  })

  it('accepts the review command from an organization member', () => {
    const payload = issuePayload()
    payload.comment.body = '@soporti-bot review\nthe second commit fixes the rounding'
    payload.comment.author_association = 'MEMBER'

    expect(detectMention({ eventName: 'issue_comment', payload, reviewerLogin: 'soporti-bot' }).kind).toBe(
      'mention_command'
    )
  })

  it('sends the review command to the mention responder when the author is not a collaborator', () => {
    for (const association of ['CONTRIBUTOR', 'FIRST_TIME_CONTRIBUTOR', 'NONE', undefined]) {
      const payload = issuePayload()
      payload.comment.body = '@soporti-bot review'
      payload.comment.author_association = association

      expect(detectMention({ eventName: 'issue_comment', payload, reviewerLogin: 'soporti-bot' })).toMatchObject({
        kind: 'mention',
        dedupeKey: 'acme-io/app#7@mention-100',
      })
    }
  })

  it('sends mentions that are not the exact command to the mention responder', () => {
    for (const body of [
      '@soporti-bot can you review the rounding?',
      'please @soporti-bot review this',
      '@soporti-bot reviewer?',
      '@soporti-bot reviewed it already?',
      '@soporti-bot review-ish question',
    ]) {
      const payload = issuePayload()
      payload.comment.body = body
      payload.comment.author_association = 'OWNER'

      expect(detectMention({ eventName: 'issue_comment', payload, reviewerLogin: 'soporti-bot' }).kind).toBe('mention')
    }
  })
})
