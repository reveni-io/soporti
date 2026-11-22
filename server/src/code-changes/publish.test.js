import { describe, it, expect, vi, beforeEach } from 'vitest'

const getAuthenticatedUser = vi.fn()
const getPullRequest = vi.fn()
const createPullRequest = vi.fn()
vi.mock('../github/client.js', () => ({ getAuthenticatedUser, getPullRequest, createPullRequest }))

const getGithubToken = vi.fn()
const areGithubWritesEnabled = vi.fn()
vi.mock('../github/settings.js', () => ({ getGithubToken, areGithubWritesEnabled }))

const commitAll = vi.fn()
const hasUncommittedChanges = vi.fn()
const listChangedFiles = vi.fn()
const pushHead = vi.fn()
const readHead = vi.fn()
vi.mock('./git.js', async () => {
  const actual = await vi.importActual('./git.js')
  return { ...actual, commitAll, hasUncommittedChanges, listChangedFiles, pushHead, readHead }
})

const { publishChange, loadContinuablePullRequest, noEditsMessage, readClosedState } = await import('./publish.js')

const TOKEN = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789'
const BRANCH_RE = /^soporti\/fix-the-greeting-[a-z0-9]{6}$/
const FILES = [{ path: 'src/app.js', status: 'modified' }]

function newChange(overrides = {}) {
  return {
    repo: 'acme/app',
    localPath: '/work/acme--app--change-abc',
    baseBranch: 'main',
    startSha: 'sha-start',
    pushedSha: 'sha-start',
    branch: null,
    pr: null,
    ...overrides,
  }
}

function gitFailure(stderr) {
  return Object.assign(new Error('Command failed: git push'), { stderr })
}

beforeEach(() => {
  vi.clearAllMocks()
  getGithubToken.mockResolvedValue(TOKEN)
  areGithubWritesEnabled.mockResolvedValue(true)
  getAuthenticatedUser.mockResolvedValue({ login: 'soporti-bot', id: 42, name: 'Soporti Bot' })
  hasUncommittedChanges.mockResolvedValue(true)
  commitAll.mockResolvedValue(undefined)
  readHead.mockResolvedValue('sha-new')
  listChangedFiles.mockResolvedValue(FILES)
  pushHead.mockResolvedValue(undefined)
  createPullRequest.mockImplementation(async (repo, { title }) => ({
    number: 12,
    url: 'https://github.com/acme/app/pull/12',
    title,
    draft: true,
  }))
})

describe('publishChange', () => {
  it('commits as the token account, pushes a new soporti branch and opens a draft pull request', async () => {
    const change = newChange()

    const result = await publishChange(change, { title: 'Fix the greeting', body: 'Says hi.', requestedBy: 'Ana' })

    expect(commitAll).toHaveBeenCalledTimes(1)
    expect(commitAll).toHaveBeenCalledWith('/work/acme--app--change-abc', {
      message: 'Fix the greeting',
      name: 'Soporti Bot',
      email: '42+soporti-bot@users.noreply.github.com',
    })
    expect(listChangedFiles).toHaveBeenCalledWith('/work/acme--app--change-abc', 'sha-start')
    expect(pushHead).toHaveBeenCalledTimes(1)
    const [, push] = pushHead.mock.calls[0]
    expect(push.url).toBe(`https://x-access-token:${TOKEN}@github.com/acme/app.git`)
    expect(push.branch).toMatch(BRANCH_RE)
    expect(createPullRequest).toHaveBeenCalledTimes(1)
    expect(createPullRequest).toHaveBeenCalledWith('acme/app', {
      title: 'Fix the greeting',
      body: 'Says hi.\n\n---\n_Opened by Soporti for Ana._',
      head: push.branch,
      base: 'main',
    })
    expect(result).toEqual({
      number: 12,
      url: 'https://github.com/acme/app/pull/12',
      title: 'Fix the greeting',
      branch: push.branch,
      draft: true,
      created: true,
      files: FILES,
    })
    expect(change).toMatchObject({ branch: push.branch, pushedSha: 'sha-new', pr: { number: 12 } })
  })

  it('signs with the login when the account has no name and leaves the requester out when unknown', async () => {
    getAuthenticatedUser.mockResolvedValue({ login: 'soporti-bot', id: 42, name: null })

    await publishChange(newChange(), { title: 'Fix the greeting', body: '', requestedBy: null })

    expect(commitAll.mock.calls[0][1].name).toBe('soporti-bot')
    expect(createPullRequest.mock.calls[0][1].body).toBe('\n\n---\n_Opened by Soporti._')
  })

  it('redacts secrets from the title and body and keeps the title on one line', async () => {
    await publishChange(newChange(), {
      title: `Rotate ${TOKEN}\nnow`,
      body: 'Use postgres://admin:hunter2@db.internal/app',
      requestedBy: 'Ana',
    })

    expect(commitAll.mock.calls[0][1].message).toBe('Rotate [redacted] now')
    expect(createPullRequest.mock.calls[0][1].title).toBe('Rotate [redacted] now')
    expect(createPullRequest.mock.calls[0][1].body).toBe(
      'Use postgres://[redacted]@db.internal/app\n\n---\n_Opened by Soporti for Ana._'
    )
  })

  it('adds a new commit to the pull request it already opened', async () => {
    const pr = { number: 12, url: 'https://github.com/acme/app/pull/12', title: 'Fix', branch: 'soporti/fix-abc123' }
    const change = newChange({ branch: 'soporti/fix-abc123', pushedSha: 'sha-pushed', pr: { ...pr, draft: true } })

    const result = await publishChange(change, { title: 'Also fix the footer', body: 'ignored', requestedBy: 'Ana' })

    expect(listChangedFiles).toHaveBeenCalledWith('/work/acme--app--change-abc', 'sha-pushed')
    expect(pushHead).toHaveBeenCalledTimes(1)
    expect(pushHead.mock.calls[0][1].branch).toBe('soporti/fix-abc123')
    expect(createPullRequest).not.toHaveBeenCalled()
    expect(result).toEqual({ ...pr, draft: true, created: false, files: FILES })
    expect(change.pushedSha).toBe('sha-new')
  })

  it('opens the pull request for a branch it already pushed when GitHub refused it before', async () => {
    const change = newChange({ branch: 'soporti/fix-the-greeting-abc123', pushedSha: 'sha-new' })
    hasUncommittedChanges.mockResolvedValue(false)

    const result = await publishChange(change, { title: 'Fix the greeting', body: '', requestedBy: null })

    expect(pushHead).not.toHaveBeenCalled()
    expect(createPullRequest.mock.calls[0][1].head).toBe('soporti/fix-the-greeting-abc123')
    expect(listChangedFiles).toHaveBeenCalledWith('/work/acme--app--change-abc', 'sha-start')
    expect(result.created).toBe(true)
  })

  it('pushes the commit it could not push before without committing again', async () => {
    hasUncommittedChanges.mockResolvedValue(false)

    const result = await publishChange(newChange(), { title: 'Fix the greeting', body: '', requestedBy: null })

    expect(commitAll).not.toHaveBeenCalled()
    expect(pushHead).toHaveBeenCalledTimes(1)
    expect(result.created).toBe(true)
  })

  it('refuses when there is nothing to publish', async () => {
    hasUncommittedChanges.mockResolvedValue(false)
    readHead.mockResolvedValue('sha-start')

    await expect(publishChange(newChange(), { title: 'Fix', body: '', requestedBy: null })).rejects.toThrow(
      'There are no edits to publish in acme/app. Make them with edit_file, write_file or delete_file first.'
    )
    expect(pushHead).not.toHaveBeenCalled()
  })

  it('refuses a pull request it already updated when nothing new was edited', async () => {
    hasUncommittedChanges.mockResolvedValue(false)
    readHead.mockResolvedValue('sha-pushed')
    const pr = { number: 12, url: 'u', title: 'Fix', branch: 'soporti/fix-abc123', draft: true }

    await expect(
      publishChange(newChange({ branch: pr.branch, pushedSha: 'sha-pushed', pr }), { title: 'Fix', body: '' })
    ).rejects.toThrow('There are no edits to publish in acme/app.')
  })

  it('refuses before committing when GitHub writes are turned off', async () => {
    areGithubWritesEnabled.mockResolvedValue(false)

    await expect(publishChange(newChange(), { title: 'Fix', body: '', requestedBy: null })).rejects.toThrow(
      'Opening pull requests is turned off. An admin can enable GitHub writes in /admin → GitHub.'
    )
    expect(commitAll).not.toHaveBeenCalled()
  })

  it.each([
    { kind: 'a missing title', title: undefined, message: 'A pull request needs a title.' },
    { kind: 'a blank title', title: '  \n ', message: 'A pull request needs a title.' },
    { kind: 'a title that is too long', title: 'x'.repeat(257), message: 'The pull request title is too long' },
  ])('refuses $kind', async ({ title, message }) => {
    await expect(publishChange(newChange(), { title, body: '', requestedBy: null })).rejects.toThrow(message)
    expect(commitAll).not.toHaveBeenCalled()
  })

  it('refuses to push to a branch that is not a soporti branch', async () => {
    const pr = { number: 3, url: 'u', title: 'Main', branch: 'main', draft: false }

    await expect(
      publishChange(newChange({ branch: 'main', pushedSha: 'sha-old', pr }), { title: 'Fix', body: '' })
    ).rejects.toThrow('Refusing to push to "main"')
    expect(pushHead).not.toHaveBeenCalled()
  })

  it('refuses to push when the soporti branch is the default branch', async () => {
    const pr = { number: 3, url: 'u', title: 'X', branch: 'soporti/main', draft: false }
    const change = newChange({ baseBranch: 'soporti/main', branch: 'soporti/main', pushedSha: 'sha-old', pr })

    await expect(publishChange(change, { title: 'Fix', body: '' })).rejects.toThrow(
      'Refusing to push to "soporti/main"'
    )
    expect(pushHead).not.toHaveBeenCalled()
  })

  it('explains the token needs write access when GitHub refuses the push', async () => {
    pushHead.mockRejectedValue(gitFailure('remote: Permission to acme/app.git denied to soporti-bot.\nfatal: 403'))

    await expect(publishChange(newChange(), { title: 'Fix', body: '' })).rejects.toThrow(
      'GitHub refused the change: the GitHub token needs write access to this repository (Contents and Pull requests: read and write). Update it in /admin → GitHub.'
    )
    expect(createPullRequest).not.toHaveBeenCalled()
  })

  it('reports other push failures without the token', async () => {
    pushHead.mockRejectedValue(
      gitFailure(`error: failed to push to https://x-access-token:${TOKEN}@github.com/acme/app`)
    )

    const failure = await publishChange(newChange(), { title: 'Fix', body: '' }).catch(err => err)

    expect(failure.message).toMatch(/^Pushing to soporti\/fix-[a-z0-9]{6} failed: error: failed to push to https:\/\//)
    expect(failure.message).not.toContain(TOKEN)
  })

  it('hides a token that does not look like a GitHub token', async () => {
    getGithubToken.mockResolvedValue('plain-secret-value')
    pushHead.mockRejectedValue(gitFailure('fatal: unable to reach plain-secret-value'))

    const failure = await publishChange(newChange(), { title: 'Fix', body: '' }).catch(err => err)

    expect(failure.message).toContain('fatal: unable to reach ***')
    expect(failure.message).not.toContain('plain-secret-value')
  })

  it('fails clearly when the GitHub token was removed', async () => {
    getGithubToken.mockResolvedValue(null)

    await expect(publishChange(newChange(), { title: 'Fix', body: '' })).rejects.toThrow(
      'GitHub token not configured. Set it in the admin panel (GitHub section).'
    )
    expect(pushHead).not.toHaveBeenCalled()
  })

  it('explains the token needs write access when GitHub refuses the pull request', async () => {
    createPullRequest.mockRejectedValue(Object.assign(new Error('Resource not accessible'), { status: 403 }))
    const change = newChange()

    await expect(publishChange(change, { title: 'Fix', body: '' })).rejects.toThrow('needs write access')
    expect(change.branch).toMatch(/^soporti\/fix-/)
    expect(change.pr).toBeNull()
  })

  it('reports why GitHub refused the pull request', async () => {
    createPullRequest.mockRejectedValue(Object.assign(new Error('Validation Failed: no commits'), { status: 422 }))

    await expect(publishChange(newChange(), { title: 'Fix', body: '' })).rejects.toThrow(
      'GitHub refused to open the pull request: Validation Failed: no commits'
    )
  })

  it('reports when the token account cannot be read', async () => {
    getAuthenticatedUser.mockRejectedValue(new Error('Bad credentials'))

    await expect(publishChange(newChange(), { title: 'Fix', body: '' })).rejects.toThrow(
      'Could not read the GitHub account behind the token: Bad credentials'
    )
  })

  it('reports when git cannot commit', async () => {
    commitAll.mockRejectedValue(gitFailure('fatal: unable to write new index file'))

    await expect(publishChange(newChange(), { title: 'Fix', body: '' })).rejects.toThrow(
      'Committing the edits failed: fatal: unable to write new index file'
    )
  })
})

describe('noEditsMessage', () => {
  it('names the repository and the edit tools', () => {
    expect(noEditsMessage('acme/app')).toBe(
      'There are no edits to publish in acme/app. Make them with edit_file, write_file or delete_file first.'
    )
  })
})

describe('loadContinuablePullRequest', () => {
  const OPEN_PR = {
    number: 5,
    state: 'open',
    merged_at: null,
    html_url: 'https://github.com/acme/app/pull/5',
    title: 'Fix the greeting',
    draft: true,
    head: { ref: 'soporti/fix-the-greeting-abc123', repo: { full_name: 'Acme/App' } },
  }

  it('returns an open pull request on a soporti branch of the same repository', async () => {
    getPullRequest.mockResolvedValue(OPEN_PR)

    expect(await loadContinuablePullRequest('acme/app', 5)).toEqual({
      number: 5,
      url: 'https://github.com/acme/app/pull/5',
      title: 'Fix the greeting',
      branch: 'soporti/fix-the-greeting-abc123',
      draft: true,
    })
    expect(getPullRequest).toHaveBeenCalledWith('acme/app', 5)
  })

  it.each([
    {
      kind: 'a closed pull request',
      pr: { ...OPEN_PR, state: 'closed' },
      message: 'Pull request #5 in acme/app is closed. Open a new pull request instead.',
    },
    {
      kind: 'a merged pull request',
      pr: { ...OPEN_PR, state: 'closed', merged_at: '2026-11-20T10:00:00Z' },
      message: 'Pull request #5 in acme/app is already merged. Open a new pull request instead.',
    },
    {
      kind: 'a pull request from a fork',
      pr: { ...OPEN_PR, head: { ...OPEN_PR.head, repo: { full_name: 'someone/app' } } },
      message:
        'Pull request #5 comes from a fork. Soporti can only continue pull requests whose branch lives in acme/app.',
    },
    {
      kind: 'a pull request whose fork was deleted',
      pr: { ...OPEN_PR, head: { ...OPEN_PR.head, repo: null } },
      message: 'Pull request #5 comes from a fork.',
    },
    {
      kind: 'a pull request opened by a person',
      pr: { ...OPEN_PR, head: { ref: 'feature/greeting', repo: { full_name: 'acme/app' } } },
      message:
        'Pull request #5 was not opened by Soporti: its branch "feature/greeting" doesn\'t start with soporti/. Soporti only adds commits to its own pull requests.',
    },
  ])('refuses $kind', async ({ pr, message }) => {
    getPullRequest.mockResolvedValue(pr)

    await expect(loadContinuablePullRequest('acme/app', 5)).rejects.toThrow(message)
  })

  it('says when the pull request does not exist', async () => {
    getPullRequest.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }))

    await expect(loadContinuablePullRequest('acme/app', 99)).rejects.toThrow(
      'Pull request #99 was not found in acme/app.'
    )
  })

  it('reports other lookup failures', async () => {
    getPullRequest.mockRejectedValue(Object.assign(new Error('Server Error'), { status: 502 }))

    await expect(loadContinuablePullRequest('acme/app', 5)).rejects.toThrow(
      'Could not read pull request #5 of acme/app: Server Error'
    )
  })
})

describe('readClosedState', () => {
  it.each([
    { kind: 'an open pull request', pr: { state: 'open', merged_at: null }, expected: null },
    { kind: 'a closed pull request', pr: { state: 'closed', merged_at: null }, expected: 'closed' },
    {
      kind: 'a merged pull request',
      pr: { state: 'closed', merged_at: '2026-11-20T10:00:00Z' },
      expected: 'already merged',
    },
  ])('returns $expected for $kind', async ({ pr, expected }) => {
    getPullRequest.mockResolvedValue(pr)

    expect(await readClosedState('acme/app', 5)).toBe(expected)
    expect(getPullRequest).toHaveBeenCalledWith('acme/app', 5)
  })

  it('reports a failed lookup instead of guessing the state', async () => {
    getPullRequest.mockRejectedValue(Object.assign(new Error('Server Error'), { status: 502 }))

    await expect(readClosedState('acme/app', 5)).rejects.toThrow(
      'Could not read pull request #5 of acme/app: Server Error'
    )
  })
})
