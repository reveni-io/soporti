import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@openai/agents', () => ({
  tool: vi.fn(opts => ({ ...opts, _isTool: true })),
}))

vi.mock('zod', async () => {
  const actual = await vi.importActual('zod')
  return actual
})

vi.mock('../github/client.js', () => ({
  listRepos: vi.fn(),
}))

vi.mock('../repo-pool/index.js', () => ({
  getDirectoryContents: vi.fn(),
  getFileContents: vi.fn(),
  searchCode: vi.fn(),
  findFiles: vi.fn(),
  gitLogFile: vi.fn(),
  gitBlame: vi.fn(),
}))

vi.mock('../shortcut/client.js', () => ({
  getStory: vi.fn(),
  searchStories: vi.fn(),
  isConfigured: vi.fn(async () => true),
}))

vi.mock('../notion/client.js', () => ({
  searchPages: vi.fn(),
  getPage: vi.fn(),
  isConfigured: vi.fn(async () => true),
}))

vi.mock('../postgres/client.js', () => ({
  listSchemas: vi.fn(),
  listTables: vi.fn(),
  describeTable: vi.fn(),
  runQuery: vi.fn(),
  isConfigured: vi.fn(() => true),
}))

vi.mock('../sentry/client.js', () => ({
  getIssue: vi.fn(),
  searchIssues: vi.fn(),
  isConfigured: vi.fn(() => true),
}))

vi.mock('../helpjuice/client.js', () => ({
  searchArticles: vi.fn(),
  getArticle: vi.fn(),
  isConfigured: vi.fn(() => true),
}))

vi.mock('../shopify/client.js', () => ({
  getOrder: vi.fn(),
  searchOrders: vi.fn(),
  getProduct: vi.fn(),
  getWebhooks: vi.fn(),
  graphqlQuery: vi.fn(),
  isConfigured: vi.fn(() => true),
}))

vi.mock('../google-drive/client.js', () => ({
  searchFiles: vi.fn(),
  getFile: vi.fn(),
  listFiles: vi.fn(),
  isConfigured: () => true,
}))

vi.mock('../config.js', () => ({
  default: {
    postgres: { connection: 'test' },
    sentry: { token: 'test', org: 'test' },
    github: { token: 'test' },
  },
}))

const {
  listReposTool,
  getDirectoryContentsTool,
  getFileContentsTool,
  searchCodeTool,
  findFilesTool,
  gitLogFileTool,
  gitBlameTool,
  getShortcutStoryTool,
  searchShortcutStoriesTool,
  searchNotionPagesTool,
  getNotionPageTool,
  listDatabaseSchemasTool,
  listDatabaseTablesTool,
  describeDatabaseTableTool,
  queryDatabaseTool,
  getSentryIssueTool,
  searchSentryIssuesTool,
  searchHelpjuiceArticlesTool,
  getHelpjuiceArticleTool,
  getShopifyOrderTool,
  searchShopifyOrdersTool,
  getShopifyProductTool,
  getShopifyWebhooksTool,
  shopifyGraphqlQueryTool,
  searchDriveFilesTool,
  getDriveFileTool,
  listDriveFilesTool,
  allTools,
  buildRepoTools,
  buildAgentTools,
} = await import('./tools.js')

describe('tool definitions', () => {
  it('exports all core tools', () => {
    expect(listReposTool).toBeDefined()
    expect(getDirectoryContentsTool).toBeDefined()
    expect(getFileContentsTool).toBeDefined()
    expect(searchCodeTool).toBeDefined()
    expect(findFilesTool).toBeDefined()
    expect(gitLogFileTool).toBeDefined()
    expect(gitBlameTool).toBeDefined()
  })

  it('exports shortcut tools', () => {
    expect(getShortcutStoryTool).toBeDefined()
    expect(searchShortcutStoriesTool).toBeDefined()
  })

  it('exports notion tools', () => {
    expect(searchNotionPagesTool).toBeDefined()
    expect(getNotionPageTool).toBeDefined()
  })

  it('exports postgres tools', () => {
    expect(listDatabaseSchemasTool).toBeDefined()
    expect(listDatabaseTablesTool).toBeDefined()
    expect(describeDatabaseTableTool).toBeDefined()
    expect(queryDatabaseTool).toBeDefined()
  })

  it('exports sentry tools', () => {
    expect(getSentryIssueTool).toBeDefined()
    expect(searchSentryIssuesTool).toBeDefined()
  })

  it('exports helpjuice tools', () => {
    expect(searchHelpjuiceArticlesTool).toBeDefined()
    expect(getHelpjuiceArticleTool).toBeDefined()
  })

  it('exports shopify tools', () => {
    expect(getShopifyOrderTool).toBeDefined()
    expect(searchShopifyOrdersTool).toBeDefined()
    expect(getShopifyProductTool).toBeDefined()
    expect(getShopifyWebhooksTool).toBeDefined()
    expect(shopifyGraphqlQueryTool).toBeDefined()
  })

  it('exports google drive tools', () => {
    expect(searchDriveFilesTool).toBeDefined()
    expect(getDriveFileTool).toBeDefined()
    expect(listDriveFilesTool).toBeDefined()
  })

  it('allTools excludes every runtime-gated integration tool', () => {
    expect(allTools.length).toBe(7)
    expect(allTools.map(t => t.name)).not.toContain('get_shortcut_story')
    expect(allTools.map(t => t.name)).not.toContain('get_sentry_issue')
    expect(allTools.map(t => t.name)).not.toContain('search_drive_files')
    expect(allTools.map(t => t.name)).not.toContain('search_notion_pages')
    expect(allTools.map(t => t.name)).not.toContain('search_helpjuice_articles')
    expect(allTools.map(t => t.name)).not.toContain('query_database')
    expect(allTools.map(t => t.name)).not.toContain('get_shopify_order')
  })

  it('each tool has required properties', () => {
    for (const t of allTools) {
      expect(t.name).toBeTruthy()
      expect(t.description).toBeTruthy()
      expect(t.execute).toBeDefined()
    }
  })
})

describe('buildRepoTools repo guard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('unguarded tools accept any repo', async () => {
    const { getFileContents } = await import('../repo-pool/index.js')
    getFileContents.mockResolvedValue({ content: 'ok' })
    const [, getFile] = buildRepoTools()
    const result = await getFile.execute({ repo: 'any/repo', path: 'a.js', offset: 0, limit: 10 })
    expect(JSON.parse(result)).toEqual({ content: 'ok' })
  })

  it('guarded tools reject repos outside the allowed list', async () => {
    const [, getFile] = buildRepoTools(['org/allowed'])
    const result = await getFile.execute({ repo: 'org/other', path: 'a.js', offset: 0, limit: 10 })
    expect(JSON.parse(result).error).toContain('org/other')
    expect(JSON.parse(result).error).toContain('org/allowed')
  })

  it('guarded tools work normally for allowed repos', async () => {
    const { searchCode } = await import('../repo-pool/index.js')
    searchCode.mockResolvedValue({ items: [{ path: 'src/a.js', line: 1, snippet: 'foo' }] })
    const tools = buildRepoTools(['org/allowed'])
    const search = tools.find(t => t.name === 'search_code')
    const result = await search.execute({
      repo: 'org/allowed',
      query: 'foo',
      pathGlob: '',
      caseInsensitive: false,
      regex: false,
      maxResults: 10,
    })
    expect(JSON.parse(result)).toEqual({ items: [{ path: 'src/a.js', line: 1, snippet: 'foo' }] })
  })

  it('every repo tool enforces the guard', async () => {
    const tools = buildRepoTools(['org/allowed'])
    expect(tools).toHaveLength(6)
    for (const t of tools) {
      const result = await t.execute({ repo: 'org/forbidden', path: 'a.js', pattern: 'a', startLine: 1, endLine: 2 })
      expect(JSON.parse(result).error).toContain('org/forbidden')
    }
  })
})

describe('buildAgentTools', () => {
  const names = tools => tools.map(t => t.name)

  it('returns every tool for an unrestricted policy', () => {
    const tools = buildAgentTools({ unrestricted: true, repos: [], integrations: [] })
    expect(names(tools)).toEqual(names(allTools))
  })

  it('defaults to unrestricted when no policy is given', () => {
    expect(names(buildAgentTools())).toEqual(names(allTools))
  })

  it('restricted with repos only: guarded repo tools plus always-on Shortcut/Sentry, no list_repos', () => {
    const tools = buildAgentTools(
      { unrestricted: false, repos: ['org/app'], integrations: [] },
      { shortcutConfigured: true, sentryConfigured: true }
    )
    expect(names(tools)).toEqual([
      'get_directory_contents',
      'get_file_contents',
      'search_code',
      'find_files',
      'git_log_file',
      'git_blame',
      'get_shortcut_story',
      'search_shortcut_stories',
      'get_sentry_issue',
      'search_sentry_issues',
    ])
  })

  it('restricted repo tools are actually guarded to the selection', async () => {
    const tools = buildAgentTools({ unrestricted: false, repos: ['org/app'], integrations: [] })
    const getFile = tools.find(t => t.name === 'get_file_contents')
    const result = await getFile.execute({ repo: 'org/other', path: 'a.js', offset: 0, limit: 10 })
    expect(JSON.parse(result).error).toContain('not among the sources selected')
  })

  it('restricted with integrations only: no repo tools, only the selected integrations plus Shortcut/Sentry', () => {
    const tools = buildAgentTools(
      { unrestricted: false, repos: [], integrations: ['notion'] },
      { shortcutConfigured: true, sentryConfigured: true, notionConfigured: true }
    )
    expect(names(tools)).toEqual([
      'search_notion_pages',
      'get_notion_page',
      'get_shortcut_story',
      'search_shortcut_stories',
      'get_sentry_issue',
      'search_sentry_issues',
    ])
  })

  it('includes each selected integration group', () => {
    const tools = buildAgentTools(
      {
        unrestricted: false,
        repos: [],
        integrations: ['postgres', 'shopify', 'google-drive', 'helpjuice'],
      },
      { driveConfigured: true, helpjuiceConfigured: true, postgresConfigured: true, shopifyConfigured: true }
    )
    const got = names(tools)
    expect(got).toContain('query_database')
    expect(got).toContain('get_shopify_order')
    expect(got).toContain('search_drive_files')
    expect(got).toContain('search_helpjuice_articles')
    expect(got).not.toContain('search_notion_pages')
    expect(got).not.toContain('list_repos')
  })

  it('gates the Shortcut tools on shortcutConfigured', () => {
    const selection = { unrestricted: false, repos: ['org/app'], integrations: [] }
    expect(names(buildAgentTools(selection, { shortcutConfigured: false }))).not.toContain('get_shortcut_story')
    expect(names(buildAgentTools(selection, { shortcutConfigured: true }))).toContain('get_shortcut_story')

    const yolo = { unrestricted: true, repos: [], integrations: [] }
    expect(names(buildAgentTools(yolo, { shortcutConfigured: false }))).not.toContain('get_shortcut_story')
    expect(names(buildAgentTools(yolo, { shortcutConfigured: true }))).toContain('get_shortcut_story')
  })

  it('gates the Google Drive tools on driveConfigured', () => {
    const selection = { unrestricted: false, repos: [], integrations: ['google-drive'] }
    expect(names(buildAgentTools(selection, { driveConfigured: false }))).not.toContain('search_drive_files')
    expect(names(buildAgentTools(selection, { driveConfigured: true }))).toContain('search_drive_files')

    const yolo = { unrestricted: true, repos: [], integrations: [] }
    expect(names(buildAgentTools(yolo, { driveConfigured: false }))).not.toContain('search_drive_files')
    expect(names(buildAgentTools(yolo, { driveConfigured: true }))).toContain('search_drive_files')
  })

  it('gates the Notion tools on notionConfigured', () => {
    const selection = { unrestricted: false, repos: [], integrations: ['notion'] }
    expect(names(buildAgentTools(selection, { notionConfigured: false }))).not.toContain('search_notion_pages')
    expect(names(buildAgentTools(selection, { notionConfigured: true }))).toContain('search_notion_pages')

    const yolo = { unrestricted: true, repos: [], integrations: [] }
    expect(names(buildAgentTools(yolo, { notionConfigured: false }))).not.toContain('search_notion_pages')
    expect(names(buildAgentTools(yolo, { notionConfigured: true }))).toContain('search_notion_pages')
  })

  it('gates the Helpjuice tools on helpjuiceConfigured', () => {
    const selection = { unrestricted: false, repos: [], integrations: ['helpjuice'] }
    expect(names(buildAgentTools(selection, { helpjuiceConfigured: false }))).not.toContain('search_helpjuice_articles')
    expect(names(buildAgentTools(selection, { helpjuiceConfigured: true }))).toContain('search_helpjuice_articles')

    const yolo = { unrestricted: true, repos: [], integrations: [] }
    expect(names(buildAgentTools(yolo, { helpjuiceConfigured: false }))).not.toContain('search_helpjuice_articles')
    expect(names(buildAgentTools(yolo, { helpjuiceConfigured: true }))).toContain('search_helpjuice_articles')
  })

  it('gates the Postgres tools on postgresConfigured', () => {
    const selection = { unrestricted: false, repos: [], integrations: ['postgres'] }
    expect(names(buildAgentTools(selection, { postgresConfigured: false }))).not.toContain('query_database')
    expect(names(buildAgentTools(selection, { postgresConfigured: true }))).toContain('query_database')

    const yolo = { unrestricted: true, repos: [], integrations: [] }
    expect(names(buildAgentTools(yolo, { postgresConfigured: false }))).not.toContain('query_database')
    expect(names(buildAgentTools(yolo, { postgresConfigured: true }))).toContain('query_database')
  })

  it('gates the Shopify tools on shopifyConfigured', () => {
    const selection = { unrestricted: false, repos: [], integrations: ['shopify'] }
    expect(names(buildAgentTools(selection, { shopifyConfigured: false }))).not.toContain('get_shopify_order')
    expect(names(buildAgentTools(selection, { shopifyConfigured: true }))).toContain('get_shopify_order')

    const yolo = { unrestricted: true, repos: [], integrations: [] }
    expect(names(buildAgentTools(yolo, { shopifyConfigured: false }))).not.toContain('get_shopify_order')
    expect(names(buildAgentTools(yolo, { shopifyConfigured: true }))).toContain('get_shopify_order')
  })

  it('ignores unknown integration ids', () => {
    const tools = buildAgentTools(
      { unrestricted: false, repos: [], integrations: ['unknown'] },
      { shortcutConfigured: true, sentryConfigured: true }
    )
    expect(names(tools)).toEqual([
      'get_shortcut_story',
      'search_shortcut_stories',
      'get_sentry_issue',
      'search_sentry_issues',
    ])
  })

  it('gates the Sentry tools on sentryConfigured', () => {
    const selection = { unrestricted: false, repos: ['org/app'], integrations: [] }
    expect(names(buildAgentTools(selection, { sentryConfigured: false }))).not.toContain('get_sentry_issue')
    expect(names(buildAgentTools(selection, { sentryConfigured: true }))).toContain('get_sentry_issue')

    const yolo = { unrestricted: true, repos: [], integrations: [] }
    expect(names(buildAgentTools(yolo, { sentryConfigured: false }))).not.toContain('get_sentry_issue')
    expect(names(buildAgentTools(yolo, { sentryConfigured: true }))).toContain('get_sentry_issue')
  })
})

describe('tool execute functions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('listReposTool.execute calls listRepos and returns JSON', async () => {
    const { listRepos } = await import('../github/client.js')
    listRepos.mockResolvedValue([{ fullName: 'org/repo' }])
    const result = await listReposTool.execute({})
    expect(JSON.parse(result)).toEqual([{ fullName: 'org/repo' }])
    expect(listRepos).toHaveBeenCalled()
  })

  it('getDirectoryContentsTool.execute calls getDirectoryContents and returns JSON', async () => {
    const { getDirectoryContents } = await import('../repo-pool/index.js')
    getDirectoryContents.mockResolvedValue([{ name: 'src', type: 'dir' }])
    const result = await getDirectoryContentsTool.execute({
      repo: 'org/repo',
      path: '',
    })
    expect(JSON.parse(result)).toEqual([{ name: 'src', type: 'dir' }])
    expect(getDirectoryContents).toHaveBeenCalledWith('org/repo', '')
  })

  it('getFileContentsTool.execute forwards offset and limit', async () => {
    const { getFileContents } = await import('../repo-pool/index.js')
    getFileContents.mockResolvedValue({ content: 'file contents' })
    const result = await getFileContentsTool.execute({
      repo: 'org/repo',
      path: 'src/index.js',
      offset: 100,
      limit: 50,
    })
    expect(JSON.parse(result)).toEqual({ content: 'file contents' })
    expect(getFileContents).toHaveBeenCalledWith('org/repo', 'src/index.js', { offset: 100, limit: 50 })
  })

  it('searchCodeTool.execute forwards search options', async () => {
    const { searchCode } = await import('../repo-pool/index.js')
    searchCode.mockResolvedValue({ items: [{ path: 'src/main.js', line: 10, snippet: 'function foo()' }] })
    const result = await searchCodeTool.execute({
      repo: 'org/repo',
      query: 'function',
      pathGlob: '*.js',
      caseInsensitive: true,
      regex: false,
      maxResults: 50,
    })
    expect(JSON.parse(result)).toEqual({ items: [{ path: 'src/main.js', line: 10, snippet: 'function foo()' }] })
    expect(searchCode).toHaveBeenCalledWith('org/repo', 'function', {
      pathGlob: '*.js',
      caseInsensitive: true,
      regex: false,
      maxResults: 50,
    })
  })

  it('findFilesTool.execute calls findFiles and returns JSON', async () => {
    const { findFiles } = await import('../repo-pool/index.js')
    findFiles.mockResolvedValue({ items: [{ path: 'src/auth.js', name: 'auth.js' }], totalCount: 1 })
    const result = await findFilesTool.execute({ repo: 'org/repo', pattern: 'auth.js', maxResults: 200 })
    expect(JSON.parse(result)).toEqual({ items: [{ path: 'src/auth.js', name: 'auth.js' }], totalCount: 1 })
    expect(findFiles).toHaveBeenCalledWith('org/repo', 'auth.js', { maxResults: 200 })
  })

  it('gitLogFileTool.execute calls gitLogFile and returns JSON', async () => {
    const { gitLogFile } = await import('../repo-pool/index.js')
    gitLogFile.mockResolvedValue({ path: 'src/a.js', commits: [], count: 0 })
    const result = await gitLogFileTool.execute({ repo: 'org/repo', path: 'src/a.js', limit: 10 })
    expect(JSON.parse(result)).toEqual({ path: 'src/a.js', commits: [], count: 0 })
    expect(gitLogFile).toHaveBeenCalledWith('org/repo', 'src/a.js', { limit: 10 })
  })

  it('gitBlameTool.execute calls gitBlame and returns JSON', async () => {
    const { gitBlame } = await import('../repo-pool/index.js')
    gitBlame.mockResolvedValue({ path: 'src/a.js', startLine: 1, endLine: 10, lines: [] })
    const result = await gitBlameTool.execute({ repo: 'org/repo', path: 'src/a.js', startLine: 1, endLine: 10 })
    expect(JSON.parse(result)).toEqual({ path: 'src/a.js', startLine: 1, endLine: 10, lines: [] })
    expect(gitBlame).toHaveBeenCalledWith('org/repo', 'src/a.js', { startLine: 1, endLine: 10 })
  })

  it('getShortcutStoryTool.execute calls getStory and returns JSON', async () => {
    const shortcut = await import('../shortcut/client.js')
    shortcut.getStory.mockResolvedValue({ id: 1234, name: 'Test story' })
    const result = await getShortcutStoryTool.execute({ id: 1234 })
    expect(JSON.parse(result)).toEqual({ id: 1234, name: 'Test story' })
    expect(shortcut.getStory).toHaveBeenCalledWith(1234)
  })

  it('searchShortcutStoriesTool.execute calls searchStories and returns JSON', async () => {
    const shortcut = await import('../shortcut/client.js')
    shortcut.searchStories.mockResolvedValue([{ id: 1, name: 'Story 1' }])
    const result = await searchShortcutStoriesTool.execute({ query: 'bug' })
    expect(JSON.parse(result)).toEqual([{ id: 1, name: 'Story 1' }])
    expect(shortcut.searchStories).toHaveBeenCalledWith('bug')
  })

  it('searchNotionPagesTool.execute calls searchPages and returns JSON', async () => {
    const notion = await import('../notion/client.js')
    notion.searchPages.mockResolvedValue([{ id: 'page-1', title: 'Test page' }])
    const result = await searchNotionPagesTool.execute({ query: 'docs' })
    expect(JSON.parse(result)).toEqual([{ id: 'page-1', title: 'Test page' }])
    expect(notion.searchPages).toHaveBeenCalledWith('docs')
  })

  it('getNotionPageTool.execute calls getPage and returns JSON', async () => {
    const notion = await import('../notion/client.js')
    notion.getPage.mockResolvedValue({ id: 'page-1', content: 'Page content' })
    const result = await getNotionPageTool.execute({ pageId: 'page-1' })
    expect(JSON.parse(result)).toEqual({
      id: 'page-1',
      content: 'Page content',
    })
    expect(notion.getPage).toHaveBeenCalledWith('page-1')
  })

  it('listDatabaseSchemasTool.execute calls listSchemas and returns JSON', async () => {
    const postgres = await import('../postgres/client.js')
    postgres.listSchemas.mockResolvedValue([{ name: 'public' }])
    const result = await listDatabaseSchemasTool.execute({})
    expect(JSON.parse(result)).toEqual([{ name: 'public' }])
    expect(postgres.listSchemas).toHaveBeenCalled()
  })

  it('listDatabaseTablesTool.execute calls listTables and returns JSON', async () => {
    const postgres = await import('../postgres/client.js')
    postgres.listTables.mockResolvedValue([{ name: 'users', rows: 100 }])
    const result = await listDatabaseTablesTool.execute({ schema: 'public' })
    expect(JSON.parse(result)).toEqual([{ name: 'users', rows: 100 }])
    expect(postgres.listTables).toHaveBeenCalledWith('public')
  })

  it('describeDatabaseTableTool.execute calls describeTable and returns JSON', async () => {
    const postgres = await import('../postgres/client.js')
    postgres.describeTable.mockResolvedValue({
      columns: [{ name: 'id', type: 'integer' }],
    })
    const result = await describeDatabaseTableTool.execute({
      schema: 'public',
      table: 'users',
    })
    expect(JSON.parse(result)).toEqual({
      columns: [{ name: 'id', type: 'integer' }],
    })
    expect(postgres.describeTable).toHaveBeenCalledWith('public', 'users')
  })

  it('queryDatabaseTool.execute calls runQuery and returns JSON', async () => {
    const postgres = await import('../postgres/client.js')
    postgres.runQuery.mockResolvedValue({ rows: [{ id: 1, name: 'Alice' }] })
    const result = await queryDatabaseTool.execute({
      sql: 'SELECT * FROM users',
    })
    expect(JSON.parse(result)).toEqual({ rows: [{ id: 1, name: 'Alice' }] })
    expect(postgres.runQuery).toHaveBeenCalledWith('SELECT * FROM users')
  })

  it('getSentryIssueTool.execute calls getIssue and returns JSON', async () => {
    const sentry = await import('../sentry/client.js')
    sentry.getIssue.mockResolvedValue({ id: '12345', title: 'TypeError' })
    const result = await getSentryIssueTool.execute({ issueId: '12345' })
    expect(JSON.parse(result)).toEqual({ id: '12345', title: 'TypeError' })
    expect(sentry.getIssue).toHaveBeenCalledWith('12345')
  })

  it('searchSentryIssuesTool.execute calls searchIssues and returns JSON', async () => {
    const sentry = await import('../sentry/client.js')
    sentry.searchIssues.mockResolvedValue([{ id: '1', title: 'Error' }])
    const result = await searchSentryIssuesTool.execute({ query: 'TypeError' })
    expect(JSON.parse(result)).toEqual([{ id: '1', title: 'Error' }])
    expect(sentry.searchIssues).toHaveBeenCalledWith('TypeError')
  })

  it('searchHelpjuiceArticlesTool.execute calls searchArticles and returns JSON', async () => {
    const helpjuice = await import('../helpjuice/client.js')
    helpjuice.searchArticles.mockResolvedValue([{ id: '1', title: 'How to' }])
    const result = await searchHelpjuiceArticlesTool.execute({
      query: 'setup',
    })
    expect(JSON.parse(result)).toEqual([{ id: '1', title: 'How to' }])
    expect(helpjuice.searchArticles).toHaveBeenCalledWith('setup')
  })

  it('getHelpjuiceArticleTool.execute calls getArticle and returns JSON', async () => {
    const helpjuice = await import('../helpjuice/client.js')
    helpjuice.getArticle.mockResolvedValue({
      id: '42',
      body: 'Article content',
    })
    const result = await getHelpjuiceArticleTool.execute({ articleId: '42' })
    expect(JSON.parse(result)).toEqual({ id: '42', body: 'Article content' })
    expect(helpjuice.getArticle).toHaveBeenCalledWith('42')
  })

  it('getShopifyOrderTool.execute calls getOrder and returns JSON', async () => {
    const shopifyMod = await import('../shopify/client.js')
    shopifyMod.getOrder.mockResolvedValue({ id: 123, orderNumber: 1001 })
    const result = await getShopifyOrderTool.execute({ orderId: '123', store: 'mystore' })
    expect(JSON.parse(result)).toEqual({ id: 123, orderNumber: 1001 })
    expect(shopifyMod.getOrder).toHaveBeenCalledWith('123', 'mystore')
  })

  it('searchShopifyOrdersTool.execute calls searchOrders and returns JSON', async () => {
    const shopifyMod = await import('../shopify/client.js')
    shopifyMod.searchOrders.mockResolvedValue([{ id: 1, name: '#1001' }])
    const result = await searchShopifyOrdersTool.execute({ query: 'test@example.com', store: 'mystore' })
    expect(JSON.parse(result)).toEqual([{ id: 1, name: '#1001' }])
    expect(shopifyMod.searchOrders).toHaveBeenCalledWith('test@example.com', 'mystore')
  })

  it('getShopifyProductTool.execute calls getProduct and returns JSON', async () => {
    const shopifyMod = await import('../shopify/client.js')
    shopifyMod.getProduct.mockResolvedValue({ id: 456, title: 'Test Product' })
    const result = await getShopifyProductTool.execute({ productId: '456', store: '1' })
    expect(JSON.parse(result)).toEqual({ id: 456, title: 'Test Product' })
    expect(shopifyMod.getProduct).toHaveBeenCalledWith('456', '1')
  })

  it('getShopifyWebhooksTool.execute calls getWebhooks and returns JSON', async () => {
    const shopifyMod = await import('../shopify/client.js')
    shopifyMod.getWebhooks.mockResolvedValue([{ id: 1, topic: 'orders/create' }])
    const result = await getShopifyWebhooksTool.execute({ store: 'mystore' })
    expect(JSON.parse(result)).toEqual([{ id: 1, topic: 'orders/create' }])
    expect(shopifyMod.getWebhooks).toHaveBeenCalledWith('mystore')
  })

  it('shopifyGraphqlQueryTool.execute calls graphqlQuery and returns JSON', async () => {
    const shopifyMod = await import('../shopify/client.js')
    shopifyMod.graphqlQuery.mockResolvedValue({ data: { shop: { name: 'Test' } } })
    const result = await shopifyGraphqlQueryTool.execute({
      query: '{ shop { name } }',
      store: 'mystore',
    })
    expect(JSON.parse(result)).toEqual({ data: { shop: { name: 'Test' } } })
    expect(shopifyMod.graphqlQuery).toHaveBeenCalledWith('{ shop { name } }', {}, 'mystore')
  })
})
