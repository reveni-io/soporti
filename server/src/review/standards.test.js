import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindFiles = vi.fn()
const mockFindFilesAt = vi.fn()
const mockGetFileContents = vi.fn()
const mockGetFileContentsAt = vi.fn()

vi.mock('../repo-pool/index.js', () => ({
  findFiles: (...args) => mockFindFiles(...args),
  findFilesAt: (...args) => mockFindFilesAt(...args),
  getFileContents: (...args) => mockGetFileContents(...args),
  getFileContentsAt: (...args) => mockGetFileContentsAt(...args),
}))

const { loadStandards } = await import('./standards.js')

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }

function found(paths) {
  return { totalCount: paths.length, items: paths.map(p => ({ path: p, name: p.split('/').pop() })), truncated: false }
}

function findByPattern(pathsByPattern) {
  return async (_root, pattern) => found(pathsByPattern[pattern] ?? [])
}

function page(content, truncated = false) {
  return { path: 'x', content, offset: 0, lineCount: 1, totalLines: 1, truncated }
}

function changed(...filenames) {
  return filenames.map(filename => ({ filename }))
}

describe('loadStandards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindFilesAt.mockResolvedValue(found([]))
    mockGetFileContentsAt.mockImplementation(async (_root, docPath) => page(`rules of ${docPath}`))
  })

  it('inlines REVIEW.md, the root CLAUDE.md and AGENTS.md, the nested ones over changed files closest first, then the other guides, ADRs and skills', async () => {
    mockFindFilesAt.mockImplementation(
      findByPattern({
        'REVIEW.md': ['REVIEW.md'],
        'CLAUDE.md': ['server/CLAUDE.md', 'CLAUDE.md', 'client/CLAUDE.md', 'server/src/review/CLAUDE.md'],
        'AGENTS.md': ['AGENTS.md', '.claude/AGENTS.md'],
        'CONTRIBUTING.md': ['CONTRIBUTING.md'],
        'STYLE*.md': ['STYLEGUIDE.md'],
        'docs/adr/*.md': ['docs/adr/0002-b.md', 'docs/adr/0001-a.md'],
        '.claude/skills/*.md': ['.claude/skills/tdd/SKILL.md'],
      })
    )

    const standards = await loadStandards(
      { repoFullName: 'acme-io/app', rootPath: '/tmp/wt-pr-7', files: changed('server/src/review/agent.js') },
      { logger: silentLogger }
    )

    expect(standards.documents.map(doc => doc.path)).toEqual([
      'REVIEW.md',
      'CLAUDE.md',
      '.claude/AGENTS.md',
      'AGENTS.md',
      'server/src/review/CLAUDE.md',
      'server/CLAUDE.md',
      'CONTRIBUTING.md',
      'STYLEGUIDE.md',
      'docs/adr/0001-a.md',
      'docs/adr/0002-b.md',
      '.claude/skills/tdd/SKILL.md',
    ])
    expect(standards.documents[0]).toEqual({
      path: 'REVIEW.md',
      modified: false,
      content: 'rules of REVIEW.md',
      truncated: false,
    })
    expect(standards.notInlined).toEqual([])
    expect(mockGetFileContentsAt).toHaveBeenCalledWith('/tmp/wt-pr-7', 'REVIEW.md', { limit: 5000 })
    expect(mockGetFileContentsAt).not.toHaveBeenCalledWith('/tmp/wt-pr-7', 'client/CLAUDE.md', expect.anything())
  })

  it('looks for every standards document name, review-only REVIEW.md included', async () => {
    await loadStandards({ repoFullName: 'acme-io/app', rootPath: '/tmp/wt-pr-7', files: [] }, { logger: silentLogger })

    expect(mockFindFilesAt.mock.calls.map(([, pattern]) => pattern)).toEqual([
      'REVIEW.md',
      'CLAUDE.md',
      'AGENTS.md',
      'CONTRIBUTING.md',
      'CONTEXT.md',
      'STYLE*.md',
      'STANDARDS.md',
      'docs/adr/*.md',
      '.claude/skills/*.md',
      '.agents/skills/*.md',
    ])
    expect(mockFindFilesAt).toHaveBeenCalledWith('/tmp/wt-pr-7', 'REVIEW.md', { maxResults: 20 })
  })

  it('reads from the default-branch clone when there is no checkout', async () => {
    mockFindFiles.mockImplementation(async (_repo, pattern) => found(pattern === 'CLAUDE.md' ? ['CLAUDE.md'] : []))
    mockGetFileContents.mockResolvedValue(page('No comments.'))

    const standards = await loadStandards(
      { repoFullName: 'acme-io/app', rootPath: null, files: [] },
      { logger: silentLogger }
    )

    expect(mockFindFiles).toHaveBeenCalledWith('acme-io/app', 'CLAUDE.md', { maxResults: 20 })
    expect(mockGetFileContents).toHaveBeenCalledTimes(1)
    expect(mockGetFileContents).toHaveBeenCalledWith('acme-io/app', 'CLAUDE.md', { limit: 5000 })
    expect(mockFindFilesAt).not.toHaveBeenCalled()
    expect(standards.documents).toEqual([
      { path: 'CLAUDE.md', modified: false, content: 'No comments.', truncated: false },
    ])
  })

  it('marks the documents this PR modifies', async () => {
    mockFindFilesAt.mockImplementation(findByPattern({ 'CLAUDE.md': ['CLAUDE.md'], 'REVIEW.md': ['REVIEW.md'] }))

    const standards = await loadStandards(
      { repoFullName: 'acme-io/app', rootPath: '/tmp/wt-pr-7', files: changed('CLAUDE.md', 'src/a.js') },
      { logger: silentLogger }
    )

    expect(standards.documents.map(({ path, modified }) => ({ path, modified }))).toEqual([
      { path: 'REVIEW.md', modified: false },
      { path: 'CLAUDE.md', modified: true },
    ])
  })

  it('truncates a document over the per-document cap or over the line limit and says so', async () => {
    mockFindFilesAt.mockImplementation(findByPattern({ 'CLAUDE.md': ['CLAUDE.md'], 'CONTEXT.md': ['CONTEXT.md'] }))
    mockGetFileContentsAt.mockImplementation(async (_root, docPath) =>
      docPath === 'CLAUDE.md' ? page('a'.repeat(40_001)) : page('short', true)
    )

    const { documents } = await loadStandards(
      { repoFullName: 'acme-io/app', rootPath: '/tmp/wt-pr-7', files: [] },
      { logger: silentLogger }
    )

    expect(documents[0].content).toBe('a'.repeat(40_000))
    expect(documents[0].truncated).toBe(true)
    expect(documents[1]).toEqual({ path: 'CONTEXT.md', modified: false, content: 'short', truncated: true })
  })

  it('lists by path the documents that no longer fit the total budget and keeps inlining smaller ones', async () => {
    const adrs = ['docs/adr/1.md', 'docs/adr/2.md', 'docs/adr/3.md', 'docs/adr/4.md', 'docs/adr/5.md']
    const sizes = { 'docs/adr/1.md': 40_000, 'docs/adr/2.md': 40_000, 'docs/adr/3.md': 40_000, 'docs/adr/4.md': 40_000 }
    mockFindFilesAt.mockImplementation(
      findByPattern({
        'docs/adr/*.md': adrs,
        'CONTEXT.md': ['CONTEXT.md'],
        '.agents/skills/*.md': ['.agents/skills/x.md'],
      })
    )
    mockGetFileContentsAt.mockImplementation(async (_root, docPath) => {
      if (docPath === 'CONTEXT.md') return page('c'.repeat(39_999))
      if (docPath === 'docs/adr/5.md') return page('too long')
      return page('a'.repeat(sizes[docPath] ?? 1))
    })

    const standards = await loadStandards(
      { repoFullName: 'acme-io/app', rootPath: '/tmp/wt-pr-7', files: changed('docs/adr/5.md') },
      { logger: silentLogger }
    )

    expect(standards.documents.map(doc => doc.path)).toEqual([
      'CONTEXT.md',
      'docs/adr/1.md',
      'docs/adr/2.md',
      'docs/adr/3.md',
      'docs/adr/4.md',
      '.agents/skills/x.md',
    ])
    expect(standards.notInlined).toEqual([{ path: 'docs/adr/5.md', modified: true }])
  })

  it('lists a document it could not read and keeps the others', async () => {
    mockFindFilesAt.mockImplementation(findByPattern({ 'CLAUDE.md': ['CLAUDE.md'], 'AGENTS.md': ['AGENTS.md'] }))
    mockGetFileContentsAt.mockImplementation(async (_root, docPath) => {
      if (docPath === 'AGENTS.md') throw new Error('EACCES')
      return page('No comments.')
    })
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }

    const standards = await loadStandards(
      { repoFullName: 'acme-io/app', rootPath: '/tmp/wt-pr-7', files: [] },
      { logger }
    )

    expect(standards.documents.map(doc => doc.path)).toEqual(['CLAUDE.md'])
    expect(standards.notInlined).toEqual([{ path: 'AGENTS.md', modified: false }])
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('AGENTS.md'))
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('EACCES'))
  })

  it('still loads what it found when part of the discovery fails', async () => {
    mockFindFilesAt.mockImplementation(async (_root, pattern) => {
      if (pattern === 'docs/adr/*.md') throw new Error('find broke')
      return found(pattern === 'CLAUDE.md' ? ['CLAUDE.md'] : [])
    })
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }

    const standards = await loadStandards(
      { repoFullName: 'acme-io/app', rootPath: '/tmp/wt-pr-7', files: [] },
      { logger }
    )

    expect(standards.documents.map(doc => doc.path)).toEqual(['CLAUDE.md'])
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('find broke'))
  })

  it('returns no document when the repository has none', async () => {
    const standards = await loadStandards(
      { repoFullName: 'acme-io/app', rootPath: '/tmp/wt-pr-7', files: changed('src/a.js') },
      { logger: silentLogger }
    )

    expect(standards).toEqual({ documents: [], notInlined: [] })
    expect(mockGetFileContentsAt).not.toHaveBeenCalled()
  })

  it('keeps a document found by two patterns once, at its highest priority', async () => {
    mockFindFilesAt.mockImplementation(
      findByPattern({ 'CLAUDE.md': ['CLAUDE.md'], 'CONTEXT.md': ['CLAUDE.md'], 'docs/adr/*.md': ['docs/adr/1.md'] })
    )

    const standards = await loadStandards(
      { repoFullName: 'acme-io/app', rootPath: '/tmp/wt-pr-7', files: [] },
      { logger: silentLogger }
    )

    expect(standards.documents.map(doc => doc.path)).toEqual(['CLAUDE.md', 'docs/adr/1.md'])
    expect(mockGetFileContentsAt).toHaveBeenCalledTimes(2)
  })

  it('considers at most 30 documents', async () => {
    const adrs = Array.from({ length: 20 }, (_, i) => `docs/adr/${String(i).padStart(2, '0')}.md`)
    const skills = Array.from({ length: 20 }, (_, i) => `.claude/skills/${String(i).padStart(2, '0')}/SKILL.md`)
    mockFindFilesAt.mockImplementation(findByPattern({ 'docs/adr/*.md': adrs, '.claude/skills/*.md': skills }))

    const standards = await loadStandards(
      { repoFullName: 'acme-io/app', rootPath: '/tmp/wt-pr-7', files: [] },
      { logger: silentLogger }
    )

    expect(standards.documents).toHaveLength(30)
    expect(standards.documents.at(-1).path).toBe('.claude/skills/09/SKILL.md')
    expect(mockGetFileContentsAt).toHaveBeenCalledTimes(30)
  })
})
