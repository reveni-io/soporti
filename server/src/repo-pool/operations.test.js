import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./pool.js', () => ({
  pool: {
    acquire: vi.fn(),
  },
}))

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

import { pool } from './pool.js'
import { readdir, readFile, stat } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import {
  getDirectoryContents,
  getFileContents,
  searchCode,
  findFiles,
  gitLogFile,
  gitBlame,
  getFileContentsAt,
  findFilesAt,
} from './operations.js'

describe('path-based variants (worktrees)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getFileContentsAt reads from the given checkout without touching the pool', async () => {
    readFile.mockResolvedValue('a\nb\nc')

    const result = await getFileContentsAt('/tmp/wt-pr-7', 'src/a.js')

    expect(result.content).toBe('a\nb\nc')
    expect(readFile).toHaveBeenCalledWith('/tmp/wt-pr-7/src/a.js', 'utf-8')
    expect(pool.acquire).not.toHaveBeenCalled()
  })

  it('findFilesAt searches the given checkout without touching the pool', async () => {
    execFile.mockImplementation((cmd, args, opts, cb) => cb(null, { stdout: '/tmp/wt-pr-7/CLAUDE.md\n', stderr: '' }))

    const result = await findFilesAt('/tmp/wt-pr-7', 'CLAUDE.md')

    expect(result.items).toEqual([{ path: 'CLAUDE.md', name: 'CLAUDE.md' }])
    expect(pool.acquire).not.toHaveBeenCalled()
  })

  it('still rejects path traversal and blocked paths on checkouts', async () => {
    await expect(getFileContentsAt('/tmp/wt-pr-7', '../etc/passwd')).rejects.toThrow('Path traversal')
    await expect(getFileContentsAt('/tmp/wt-pr-7', '.env')).rejects.toThrow('not allowed')
  })
})

describe('getDirectoryContents', () => {
  const release = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    pool.acquire.mockResolvedValue({ localPath: '/tmp/repos/owner--repo', release })
    stat.mockResolvedValue({ size: 1234 })
  })

  it('lists files and directories with sizes', async () => {
    readdir.mockResolvedValue([
      { name: 'src', isDirectory: () => true },
      { name: 'index.js', isDirectory: () => false },
    ])

    const result = await getDirectoryContents('owner/repo', '')
    expect(result).toEqual([
      { name: 'src', path: 'src', type: 'dir', size: null },
      { name: 'index.js', path: 'index.js', type: 'file', size: 1234 },
    ])
    expect(release).toHaveBeenCalled()
  })

  it('filters out .git and node_modules', async () => {
    readdir.mockResolvedValue([
      { name: '.git', isDirectory: () => true },
      { name: 'node_modules', isDirectory: () => true },
      { name: 'src', isDirectory: () => true },
    ])

    const result = await getDirectoryContents('owner/repo', '')
    expect(result.map(e => e.name)).toEqual(['src'])
  })

  it('falls back to null size when stat fails', async () => {
    readdir.mockResolvedValue([{ name: 'broken.js', isDirectory: () => false }])
    stat.mockRejectedValue(new Error('EACCES'))

    const result = await getDirectoryContents('owner/repo', '')
    expect(result[0].size).toBeNull()
  })

  it('includes subpath in entry paths', async () => {
    readdir.mockResolvedValue([{ name: 'App.jsx', isDirectory: () => false }])

    const result = await getDirectoryContents('owner/repo', 'src/components')
    expect(result[0].path).toBe('src/components/App.jsx')
  })

  it('rejects invalid repo format', async () => {
    await expect(getDirectoryContents('invalid', '')).rejects.toThrow('Invalid repository format')
  })

  it('rejects path traversal', async () => {
    await expect(getDirectoryContents('owner/repo', '../etc')).rejects.toThrow('Path traversal')
  })

  it('releases handle on error', async () => {
    readdir.mockRejectedValue(new Error('ENOENT'))
    await expect(getDirectoryContents('owner/repo', 'nonexistent')).rejects.toThrow('ENOENT')
    expect(release).toHaveBeenCalled()
  })
})

describe('getFileContents', () => {
  const release = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    pool.acquire.mockResolvedValue({ localPath: '/tmp/repos/owner--repo', release })
  })

  it('reads small file fully without truncating', async () => {
    readFile.mockResolvedValue('line1\nline2\nline3')
    const result = await getFileContents('owner/repo', 'src/index.js')
    expect(result.path).toBe('src/index.js')
    expect(result.content).toBe('line1\nline2\nline3')
    expect(result.totalLines).toBe(3)
    expect(result.lineCount).toBe(3)
    expect(result.offset).toBe(0)
    expect(result.truncated).toBe(false)
    expect(release).toHaveBeenCalled()
  })

  it('truncates large files at default limit and surfaces nextOffset', async () => {
    const big = Array.from({ length: 2500 }, (_, i) => `line${i + 1}`).join('\n')
    readFile.mockResolvedValue(big)
    const result = await getFileContents('owner/repo', 'big.js')
    expect(result.totalLines).toBe(2500)
    expect(result.lineCount).toBe(2000)
    expect(result.truncated).toBe(true)
    expect(result.nextOffset).toBe(2000)
    expect(result.hint).toMatch(/2500 lines/)
  })

  it('respects offset and limit', async () => {
    const file = Array.from({ length: 10 }, (_, i) => `line${i + 1}`).join('\n')
    readFile.mockResolvedValue(file)
    const result = await getFileContents('owner/repo', 'a.js', { offset: 3, limit: 4 })
    expect(result.content).toBe('line4\nline5\nline6\nline7')
    expect(result.offset).toBe(3)
    expect(result.lineCount).toBe(4)
    expect(result.truncated).toBe(true)
    expect(result.nextOffset).toBe(7)
  })

  it('throws when path is empty', async () => {
    await expect(getFileContents('owner/repo', '')).rejects.toThrow('file path is required')
  })

  it('rejects blocked paths', async () => {
    await expect(getFileContents('owner/repo', '.env')).rejects.toThrow('not allowed')
  })

  it('releases handle on error', async () => {
    readFile.mockRejectedValue(new Error('ENOENT'))
    await expect(getFileContents('owner/repo', 'missing.txt')).rejects.toThrow('ENOENT')
    expect(release).toHaveBeenCalled()
  })
})

describe('searchCode', () => {
  const release = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    pool.acquire.mockResolvedValue({ localPath: '/tmp/repos/owner--repo', release })
  })

  it('returns matches with line numbers and snippets', async () => {
    execFile.mockImplementation((cmd, args, opts, cb) => {
      cb(null, {
        stdout:
          '/tmp/repos/owner--repo/src/auth.js:12:function authenticate(user) {\n' +
          '/tmp/repos/owner--repo/src/auth.js:45:  authenticate(req.user)\n' +
          '/tmp/repos/owner--repo/src/login.js:7:import { authenticate } from "./auth"\n',
        stderr: '',
      })
    })

    const result = await searchCode('owner/repo', 'authenticate')
    expect(result.totalCount).toBe(3)
    expect(result.items).toEqual([
      { path: 'src/auth.js', line: 12, snippet: 'function authenticate(user) {' },
      { path: 'src/auth.js', line: 45, snippet: 'authenticate(req.user)' },
      { path: 'src/login.js', line: 7, snippet: 'import { authenticate } from "./auth"' },
    ])
    expect(result.truncated).toBe(false)
    expect(release).toHaveBeenCalled()
  })

  it('passes -F by default and -E with regex=true, plus -i and --include', async () => {
    let capturedArgs
    execFile.mockImplementation((cmd, args, opts, cb) => {
      capturedArgs = args
      cb(null, { stdout: '', stderr: '' })
    })

    await searchCode('owner/repo', 'foo')
    expect(capturedArgs).toContain('-F')
    expect(capturedArgs).not.toContain('-i')
    expect(capturedArgs).not.toContain('-E')

    await searchCode('owner/repo', 'foo', { regex: true, caseInsensitive: true, pathGlob: '*.js' })
    expect(capturedArgs).toContain('-E')
    expect(capturedArgs).toContain('-i')
    expect(capturedArgs).toContain('--include=*.js')
  })

  it('caps results to maxResults and signals truncation', async () => {
    const matches = Array.from({ length: 20 }, (_, i) => `/tmp/repos/owner--repo/src/f${i}.js:1:hit`).join('\n')
    execFile.mockImplementation((cmd, args, opts, cb) => cb(null, { stdout: matches, stderr: '' }))

    const result = await searchCode('owner/repo', 'hit', { maxResults: 5 })
    expect(result.items).toHaveLength(5)
    expect(result.truncated).toBe(true)
    expect(result.totalCount).toBe(20)
  })

  it('returns empty results when grep finds no matches', async () => {
    const error = new Error('no matches')
    error.code = 1
    execFile.mockImplementation((cmd, args, opts, cb) => cb(error, { stdout: '', stderr: '' }))

    const result = await searchCode('owner/repo', 'nonexistent')
    expect(result.totalCount).toBe(0)
    expect(result.items).toEqual([])
  })

  it('throws on empty query', async () => {
    await expect(searchCode('owner/repo', '')).rejects.toThrow('search query is required')
    await expect(searchCode('owner/repo', '   ')).rejects.toThrow('search query is required')
  })

  it('releases handle on error', async () => {
    const error = new Error('grep failed')
    error.code = 2
    execFile.mockImplementation((cmd, args, opts, cb) => cb(error, { stdout: '', stderr: '' }))

    await expect(searchCode('owner/repo', 'test')).rejects.toThrow('grep failed')
    expect(release).toHaveBeenCalled()
  })
})

describe('findFiles', () => {
  const release = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    pool.acquire.mockResolvedValue({ localPath: '/tmp/repos/owner--repo', release })
  })

  it('returns matched files with relative paths', async () => {
    execFile.mockImplementation((cmd, args, opts, cb) => {
      cb(null, {
        stdout: '/tmp/repos/owner--repo/src/auth.js\n' + '/tmp/repos/owner--repo/server/auth/index.js\n',
        stderr: '',
      })
    })

    const result = await findFiles('owner/repo', 'auth.js')
    expect(result.items).toEqual([
      { path: 'src/auth.js', name: 'auth.js' },
      { path: 'server/auth/index.js', name: 'index.js' },
    ])
    expect(result.totalCount).toBe(2)
    expect(release).toHaveBeenCalled()
  })

  it('uses -iname for basename patterns', async () => {
    let capturedArgs
    execFile.mockImplementation((cmd, args, opts, cb) => {
      capturedArgs = args
      cb(null, { stdout: '', stderr: '' })
    })

    await findFiles('owner/repo', 'auth.js')
    const inameIdx = capturedArgs.indexOf('-iname')
    expect(inameIdx).toBeGreaterThan(-1)
    expect(capturedArgs[inameIdx + 1]).toBe('auth.js')
    expect(capturedArgs.some(a => a === '*auth.js*')).toBe(false)
  })

  it('uses -path for patterns containing slash', async () => {
    let capturedArgs
    execFile.mockImplementation((cmd, args, opts, cb) => {
      capturedArgs = args
      cb(null, { stdout: '', stderr: '' })
    })

    await findFiles('owner/repo', 'src/components/*.jsx')
    expect(capturedArgs).toContain('-path')
    expect(capturedArgs.some(a => a.includes('src/components/*.jsx'))).toBe(true)
  })

  it('returns empty results when find finds no matches', async () => {
    const error = new Error('no matches')
    error.code = 1
    execFile.mockImplementation((cmd, args, opts, cb) => cb(error, { stdout: '', stderr: '' }))

    const result = await findFiles('owner/repo', 'nonexistent.js')
    expect(result.totalCount).toBe(0)
    expect(result.items).toEqual([])
  })

  it('throws on empty pattern', async () => {
    await expect(findFiles('owner/repo', '')).rejects.toThrow('pattern is required')
  })

  it('caps results to maxResults', async () => {
    const matches = Array.from({ length: 10 }, (_, i) => `/tmp/repos/owner--repo/f${i}.js`).join('\n')
    execFile.mockImplementation((cmd, args, opts, cb) => cb(null, { stdout: matches, stderr: '' }))

    const result = await findFiles('owner/repo', '*.js', { maxResults: 3 })
    expect(result.items).toHaveLength(3)
    expect(result.totalCount).toBe(10)
    expect(result.truncated).toBe(true)
  })
})

describe('gitLogFile', () => {
  const release = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    pool.acquire.mockResolvedValue({ localPath: '/tmp/repos/owner--repo', release })
  })

  it('returns parsed commits for a file', async () => {
    execFile.mockImplementation((cmd, args, opts, cb) => {
      cb(null, {
        stdout:
          'abc123\tAlice\talice@example.com\t2024-05-01T12:00:00Z\tFix auth bug\n' +
          'def456\tBob\tbob@example.com\t2024-04-20T08:30:00Z\tRefactor login\n',
        stderr: '',
      })
    })

    const result = await gitLogFile('owner/repo', 'src/auth.js')
    expect(result.path).toBe('src/auth.js')
    expect(result.count).toBe(2)
    expect(result.commits[0]).toEqual({
      hash: 'abc123',
      author: 'Alice',
      email: 'alice@example.com',
      date: '2024-05-01T12:00:00Z',
      subject: 'Fix auth bug',
    })
  })

  it('respects custom limit', async () => {
    let capturedArgs
    execFile.mockImplementation((cmd, args, opts, cb) => {
      capturedArgs = args
      cb(null, { stdout: '', stderr: '' })
    })

    await gitLogFile('owner/repo', 'src/auth.js', { limit: 5 })
    expect(capturedArgs).toContain('--max-count=5')
  })

  it('throws on empty path', async () => {
    await expect(gitLogFile('owner/repo', '')).rejects.toThrow('file path is required')
  })

  it('rejects blocked paths', async () => {
    await expect(gitLogFile('owner/repo', '.env')).rejects.toThrow('not allowed')
  })

  it('releases handle on error', async () => {
    execFile.mockImplementation((cmd, args, opts, cb) => cb(new Error('boom'), { stdout: '', stderr: '' }))
    await expect(gitLogFile('owner/repo', 'src/auth.js')).rejects.toThrow('git log failed')
    expect(release).toHaveBeenCalled()
  })
})

describe('gitBlame', () => {
  const release = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    pool.acquire.mockResolvedValue({ localPath: '/tmp/repos/owner--repo', release })
  })

  it('parses --line-porcelain output into structured lines', async () => {
    const ts = 1714564800
    const stdout =
      `abcdef1234567890abcdef1234567890abcdef12 10 10 1\n` +
      `author Alice\n` +
      `author-mail <alice@example.com>\n` +
      `author-time ${ts}\n` +
      `author-tz +0000\n` +
      `summary Fix auth bug\n` +
      `filename src/auth.js\n` +
      `\tfunction authenticate(user) {\n` +
      `1234567890abcdef1234567890abcdef12345678 11 11 1\n` +
      `author Bob\n` +
      `author-mail <bob@example.com>\n` +
      `author-time ${ts}\n` +
      `author-tz +0000\n` +
      `summary Refactor\n` +
      `filename src/auth.js\n` +
      `\t  return user\n`
    execFile.mockImplementation((cmd, args, opts, cb) => cb(null, { stdout, stderr: '' }))

    const result = await gitBlame('owner/repo', 'src/auth.js', { startLine: 10, endLine: 11 })
    expect(result.path).toBe('src/auth.js')
    expect(result.startLine).toBe(10)
    expect(result.endLine).toBe(11)
    expect(result.lines).toHaveLength(2)
    expect(result.lines[0]).toMatchObject({
      hash: 'abcdef1234567890abcdef1234567890abcdef12',
      line: 10,
      author: 'Alice',
      summary: 'Fix auth bug',
      content: 'function authenticate(user) {',
    })
    expect(result.lines[0].date).toMatch(/^2024-/)
    expect(result.lines[1].author).toBe('Bob')
  })

  it('caps the range to MAX_BLAME_LINES (500)', async () => {
    let capturedArgs
    execFile.mockImplementation((cmd, args, opts, cb) => {
      capturedArgs = args
      cb(null, { stdout: '', stderr: '' })
    })

    await gitBlame('owner/repo', 'big.js', { startLine: 1, endLine: 5000 })
    const lArg = capturedArgs[capturedArgs.indexOf('-L') + 1]
    expect(lArg).toBe('1,500')
  })

  it('uses startLine when endLine is missing', async () => {
    let capturedArgs
    execFile.mockImplementation((cmd, args, opts, cb) => {
      capturedArgs = args
      cb(null, { stdout: '', stderr: '' })
    })

    await gitBlame('owner/repo', 'a.js', { startLine: 50 })
    const lArg = capturedArgs[capturedArgs.indexOf('-L') + 1]
    expect(lArg).toBe('50,549')
  })

  it('throws on empty path', async () => {
    await expect(gitBlame('owner/repo', '')).rejects.toThrow('file path is required')
  })

  it('releases handle on error', async () => {
    execFile.mockImplementation((cmd, args, opts, cb) => cb(new Error('boom'), { stdout: '', stderr: '' }))
    await expect(gitBlame('owner/repo', 'a.js')).rejects.toThrow('git blame failed')
    expect(release).toHaveBeenCalled()
  })
})
