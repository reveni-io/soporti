import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@openai/agents', () => ({
  tool: vi.fn(opts => ({ ...opts, _isTool: true })),
}))

vi.mock('../db/users.js', () => ({
  findUserById: vi.fn(),
}))

const { findUserById } = await import('../db/users.js')
const { buildCodeChangeTools } = await import('./code-change-tools.js')
const { REPO_WRITE_TOOL_NAMES } = await import('./sources.js')

function buildSession() {
  return {
    pendingPath: vi.fn(() => null),
    editFile: vi.fn(),
    writeFile: vi.fn(),
    deleteFile: vi.fn(),
    continuePullRequest: vi.fn(),
    openPullRequest: vi.fn(),
  }
}

function findTool(tools, name) {
  return tools.find(candidate => candidate.name === name)
}

describe('buildCodeChangeTools', () => {
  let session

  beforeEach(() => {
    vi.clearAllMocks()
    session = buildSession()
  })

  it('builds the five repository write tools, in the order the source policy lists them', () => {
    const tools = buildCodeChangeTools({ session })

    expect(tools.map(candidate => candidate.name)).toEqual(REPO_WRITE_TOOL_NAMES)
  })

  it('says in every description that the tool changes something or what it is for', () => {
    const tools = buildCodeChangeTools({ session })

    expect(findTool(tools, 'edit_file').description).toContain('This CHANGES CODE')
    expect(findTool(tools, 'write_file').description).toContain('This CHANGES CODE')
    expect(findTool(tools, 'delete_file').description).toContain('This CHANGES CODE')
    expect(findTool(tools, 'open_pull_request').description).toContain('This WRITES to GitHub')
    expect(findTool(tools, 'open_pull_request').description).toContain('DRAFT pull request')
    expect(findTool(tools, 'continue_pull_request').description).toContain('soporti/')
  })

  it('warns the model that .github cannot be written', () => {
    const tools = buildCodeChangeTools({ session })

    expect(findTool(tools, 'edit_file').description).toContain('.github/')
    expect(findTool(tools, 'write_file').description).toContain('.github/')
    expect(findTool(tools, 'delete_file').description).toContain('.github/')
  })

  it('stages an edit in the session and returns its preview', async () => {
    session.editFile.mockResolvedValue({ path: 'src/a.js', replacements: 1, preview: '12: const a = 2' })
    const edit = findTool(buildCodeChangeTools({ session }), 'edit_file')

    const input = edit.parameters.parse({ repo: 'org/app', path: 'src/a.js', oldText: 'a = 1', newText: 'a = 2' })
    const result = await edit.execute(input)

    expect(JSON.parse(result)).toEqual({ path: 'src/a.js', replacements: 1, preview: '12: const a = 2' })
    expect(session.editFile).toHaveBeenCalledTimes(1)
    expect(session.editFile).toHaveBeenCalledWith('org/app', 'src/a.js', {
      oldText: 'a = 1',
      newText: 'a = 2',
      replaceAll: false,
    })
  })

  it('forwards replaceAll when the model asks for every occurrence', async () => {
    session.editFile.mockResolvedValue({ path: 'src/a.js', replacements: 3, preview: '' })
    const edit = findTool(buildCodeChangeTools({ session }), 'edit_file')

    await edit.execute({ repo: 'org/app', path: 'src/a.js', oldText: 'foo', newText: 'bar', replaceAll: true })

    expect(session.editFile).toHaveBeenCalledWith('org/app', 'src/a.js', {
      oldText: 'foo',
      newText: 'bar',
      replaceAll: true,
    })
  })

  it('writes a whole file through the session', async () => {
    session.writeFile.mockResolvedValue({ path: 'src/new.js', created: true })
    const write = findTool(buildCodeChangeTools({ session }), 'write_file')

    const result = await write.execute({ repo: 'org/app', path: 'src/new.js', content: 'export {}\n' })

    expect(JSON.parse(result)).toEqual({ path: 'src/new.js', created: true })
    expect(session.writeFile).toHaveBeenCalledTimes(1)
    expect(session.writeFile).toHaveBeenCalledWith('org/app', 'src/new.js', 'export {}\n')
  })

  it('deletes a file through the session', async () => {
    session.deleteFile.mockResolvedValue({ path: 'src/old.js' })
    const remove = findTool(buildCodeChangeTools({ session }), 'delete_file')

    const result = await remove.execute({ repo: 'org/app', path: 'src/old.js' })

    expect(JSON.parse(result)).toEqual({ path: 'src/old.js' })
    expect(session.deleteFile).toHaveBeenCalledTimes(1)
    expect(session.deleteFile).toHaveBeenCalledWith('org/app', 'src/old.js')
  })

  it('picks up an earlier Soporti pull request by its number', async () => {
    const pullRequest = { number: 42, url: 'https://github.com/org/app/pull/42', title: 'fix: x', branch: 'soporti/x' }
    session.continuePullRequest.mockResolvedValue(pullRequest)
    const resume = findTool(buildCodeChangeTools({ session }), 'continue_pull_request')

    const result = await resume.execute({ repo: 'org/app', number: 42 })

    expect(JSON.parse(result)).toEqual(pullRequest)
    expect(session.continuePullRequest).toHaveBeenCalledTimes(1)
    expect(session.continuePullRequest).toHaveBeenCalledWith('org/app', 42)
  })

  it('only accepts a positive whole pull request number', () => {
    const resume = findTool(buildCodeChangeTools({ session }), 'continue_pull_request')

    expect(() => resume.parameters.parse({ repo: 'org/app', number: 0 })).toThrow()
    expect(() => resume.parameters.parse({ repo: 'org/app', number: 4.5 })).toThrow()
    expect(resume.parameters.parse({ repo: 'org/app', number: 7 })).toEqual({ repo: 'org/app', number: 7 })
  })

  it('opens the pull request on behalf of the Soporti user, resolved when the tool runs', async () => {
    findUserById.mockResolvedValue({ id: 7, name: 'Ana Ruiz' })
    const opened = {
      number: 43,
      url: 'https://github.com/org/app/pull/43',
      title: 'fix(api): handle empty carts',
      branch: 'soporti/handle-empty-carts',
      draft: true,
      created: true,
      files: [{ path: 'src/cart.js', status: 'modified' }],
    }
    session.openPullRequest.mockResolvedValue(opened)
    const open = findTool(buildCodeChangeTools({ session, userId: 7 }), 'open_pull_request')

    expect(findUserById).not.toHaveBeenCalled()

    const result = await open.execute({
      repo: 'org/app',
      title: 'fix(api): handle empty carts',
      body: 'Nothing was run.',
    })

    expect(JSON.parse(result)).toEqual(opened)
    expect(findUserById).toHaveBeenCalledTimes(1)
    expect(findUserById).toHaveBeenCalledWith(7)
    expect(session.openPullRequest).toHaveBeenCalledTimes(1)
    expect(session.openPullRequest).toHaveBeenCalledWith('org/app', {
      title: 'fix(api): handle empty carts',
      body: 'Nothing was run.',
      requestedBy: 'Ana Ruiz',
    })
  })

  it('opens the pull request without a requester when there is no user to name', async () => {
    session.openPullRequest.mockResolvedValue({ number: 44 })
    const open = findTool(buildCodeChangeTools({ session }), 'open_pull_request')

    await open.execute({ repo: 'org/app', title: 'fix: x', body: 'y' })

    expect(findUserById).not.toHaveBeenCalled()
    expect(session.openPullRequest).toHaveBeenCalledWith('org/app', { title: 'fix: x', body: 'y', requestedBy: null })
  })

  it('opens the pull request without a requester when the user has no name or no longer exists', async () => {
    session.openPullRequest.mockResolvedValue({ number: 45 })
    const open = findTool(buildCodeChangeTools({ session, userId: 7 }), 'open_pull_request')

    findUserById.mockResolvedValueOnce({ id: 7, name: null })
    await open.execute({ repo: 'org/app', title: 'fix: x', body: 'y' })
    findUserById.mockResolvedValueOnce(null)
    await open.execute({ repo: 'org/app', title: 'fix: x', body: 'y' })

    expect(session.openPullRequest).toHaveBeenCalledTimes(2)
    expect(session.openPullRequest).toHaveBeenNthCalledWith(1, 'org/app', {
      title: 'fix: x',
      body: 'y',
      requestedBy: null,
    })
    expect(session.openPullRequest).toHaveBeenNthCalledWith(2, 'org/app', {
      title: 'fix: x',
      body: 'y',
      requestedBy: null,
    })
  })

  it('refuses every write on a repository outside the selected sources without touching the session', async () => {
    const tools = buildCodeChangeTools({ session, allowedRepos: ['org/allowed'], userId: 7 })
    const input = { repo: 'org/other', path: 'a.js', oldText: 'a', newText: 'b', content: 'c', number: 1, title: 't' }

    for (const candidate of tools) {
      const result = JSON.parse(await candidate.execute(input))

      expect(result.error).toContain('Repository "org/other" is not among the sources selected')
      expect(result.error).toContain('org/allowed')
    }
    expect(session.editFile).not.toHaveBeenCalled()
    expect(session.writeFile).not.toHaveBeenCalled()
    expect(session.deleteFile).not.toHaveBeenCalled()
    expect(session.continuePullRequest).not.toHaveBeenCalled()
    expect(session.openPullRequest).not.toHaveBeenCalled()
    expect(findUserById).not.toHaveBeenCalled()
  })

  it('lets a write through on a selected repository', async () => {
    session.writeFile.mockResolvedValue({ path: 'a.js', created: false })
    const write = findTool(buildCodeChangeTools({ session, allowedRepos: ['org/allowed'] }), 'write_file')

    const result = await write.execute({ repo: 'org/allowed', path: 'a.js', content: 'x' })

    expect(JSON.parse(result)).toEqual({ path: 'a.js', created: false })
    expect(session.writeFile).toHaveBeenCalledWith('org/allowed', 'a.js', 'x')
  })

  it('lets the session error reach the model as it is', async () => {
    session.editFile.mockRejectedValue(new Error('oldText was not found in src/a.js.'))
    const edit = findTool(buildCodeChangeTools({ session }), 'edit_file')

    await expect(
      edit.execute({ repo: 'org/app', path: 'src/a.js', oldText: 'x', newText: 'y', replaceAll: false })
    ).rejects.toThrow('oldText was not found in src/a.js.')
  })
})
