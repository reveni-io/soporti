import { describe, it, expect, vi, beforeEach } from 'vitest'

const getNotionToken = vi.fn(async () => 'test-notion-token')
const isNotionConfigured = vi.fn(async () => true)
vi.mock('./settings.js', () => ({ getNotionToken, isNotionConfigured }))

const mockFetch = vi.fn()
global.fetch = mockFetch

const { searchPages, getPage, isConfigured } = await import('./client.js')

const BASE_URL = 'https://api.notion.com/v1'
const PAGE_ID = '27679c1d-253f-8047-b564-fc6204c8b5d7'
const DATA_SOURCE_ID = '33d79c1d-253f-81d2-a1de-e21b4c996772'
const DATABASE_ID = '1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d'
const OTHER_DATA_SOURCE_ID = '9f8e7d6c-5b4a-4321-8fed-cba987654321'
const MARKDOWN_PATH = `/pages/${PAGE_ID}/markdown?markdown_version=v2`

function mockResponse(data, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  }
}

function routeFetch(routes) {
  mockFetch.mockImplementation(async (url, options) => {
    const route = `${options.method} ${url.replace(BASE_URL, '')}`
    return routes[route] ?? mockResponse({ code: 'object_not_found' }, false, 404)
  })
}

function requestedRoutes() {
  return mockFetch.mock.calls.map(([url, options]) => `${options.method} ${url.replace(BASE_URL, '')}`)
}

function requestBody(route) {
  const call = mockFetch.mock.calls.find(([url, options]) => `${options.method} ${url.replace(BASE_URL, '')}` === route)
  return JSON.parse(call[1].body)
}

const PAGE = {
  id: PAGE_ID,
  url: `https://app.notion.com/p/${PAGE_ID}`,
  last_edited_time: '2026-11-20T10:00:00.000Z',
  properties: { title: { type: 'title', title: [{ plain_text: 'Handover' }] } },
}

const DATA_SOURCE = {
  object: 'data_source',
  id: DATA_SOURCE_ID,
  title: [{ plain_text: 'Process Check' }],
  url: `https://app.notion.com/p/${DATA_SOURCE_ID}`,
  last_edited_time: '2026-11-21T10:00:00.000Z',
}

describe('isConfigured', () => {
  it('returns true when token is set', async () => {
    isNotionConfigured.mockResolvedValueOnce(true)
    expect(await isConfigured()).toBe(true)
  })

  it('returns false when token is not set', async () => {
    isNotionConfigured.mockResolvedValueOnce(false)
    expect(await isConfigured()).toBe(false)
  })
})

describe('searchPages', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns pages and databases with their ids, titles and urls', async () => {
    routeFetch({
      'POST /search': mockResponse({ results: [{ object: 'page', ...PAGE }, DATA_SOURCE], has_more: false }),
    })

    const result = await searchPages('process')

    expect(result).toEqual({
      results: [
        { id: PAGE_ID, title: 'Handover', url: PAGE.url, type: 'page', lastEditedTime: PAGE.last_edited_time },
        {
          id: DATA_SOURCE_ID,
          title: 'Process Check',
          url: DATA_SOURCE.url,
          type: 'database',
          lastEditedTime: DATA_SOURCE.last_edited_time,
        },
      ],
      truncated: false,
      nextCursor: null,
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(requestBody('POST /search')).toEqual({ query: 'process', page_size: 20 })
    expect(mockFetch.mock.calls[0][1].headers['Notion-Version']).toBe('2026-03-11')
  })

  it('reports more matches and reads on from a cursor', async () => {
    routeFetch({ 'POST /search': mockResponse({ results: [], has_more: true, next_cursor: 'cursor-2' }) })

    const result = await searchPages('process', 'cursor-1')

    expect(result).toEqual({ results: [], truncated: true, nextCursor: 'cursor-2' })
    expect(requestBody('POST /search')).toEqual({ query: 'process', page_size: 20, start_cursor: 'cursor-1' })
  })

  it('fails with a pointer to the admin panel when no token is configured', async () => {
    getNotionToken.mockResolvedValueOnce(null)

    await expect(searchPages('process')).rejects.toThrow('Notion token not configured')
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('getPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads a page as markdown', async () => {
    const markdown =
      '# Handover\n\n| Role | Owner |\n| --- | --- |\n| CSM | Pablo |\n\n<page url="https://app.notion.com/p/abc">Templates</page>'
    routeFetch({
      [`GET /pages/${PAGE_ID}`]: mockResponse(PAGE),
      [`GET ${MARKDOWN_PATH}`]: mockResponse({ markdown, truncated: false, unknown_block_ids: [] }),
    })

    const page = await getPage(PAGE_ID)

    expect(page).toEqual({
      id: PAGE_ID,
      title: 'Handover',
      url: PAGE.url,
      lastEditedTime: PAGE.last_edited_time,
      type: 'page',
      content: markdown,
      truncated: false,
      unreadBlocks: 0,
    })
    expect(requestedRoutes()).toEqual([`GET /pages/${PAGE_ID}`, `GET ${MARKDOWN_PATH}`])
  })

  it('reads the page id out of a Notion url, ignoring the view and block ids after it', async () => {
    const dashlessId = PAGE_ID.replaceAll('-', '')
    routeFetch({
      [`GET /pages/${dashlessId}`]: mockResponse(PAGE),
      [`GET /pages/${dashlessId}/markdown?markdown_version=v2`]: mockResponse({
        markdown: 'Body',
        truncated: false,
        unknown_block_ids: [],
      }),
    })

    const page = await getPage(`https://www.notion.so/reveni/Handover-${dashlessId}?v=${DATA_SOURCE_ID}#${DATABASE_ID}`)

    expect(page.content).toBe('Body')
    expect(requestedRoutes()).toEqual([
      `GET /pages/${dashlessId}`,
      `GET /pages/${dashlessId}/markdown?markdown_version=v2`,
    ])
  })

  it('cuts a page longer than the character limit and says so', async () => {
    routeFetch({
      [`GET /pages/${PAGE_ID}`]: mockResponse(PAGE),
      [`GET ${MARKDOWN_PATH}`]: mockResponse({ markdown: 'a'.repeat(50_001), truncated: false, unknown_block_ids: [] }),
    })

    const page = await getPage(PAGE_ID)

    expect(page.content).toHaveLength(50_000)
    expect(page.truncated).toBe(true)
  })

  it('counts the blocks Notion could not return', async () => {
    routeFetch({
      [`GET /pages/${PAGE_ID}`]: mockResponse(PAGE),
      [`GET ${MARKDOWN_PATH}`]: mockResponse({
        markdown: '<unknown url="https://app.notion.com/p/x" alt="child_page"/>',
        truncated: true,
        unknown_block_ids: ['block-1', 'block-2'],
      }),
    })

    const page = await getPage(PAGE_ID)

    expect(page.unreadBlocks).toBe(2)
    expect(page.truncated).toBe(false)
  })

  it('returns Untitled when a page has no title property', async () => {
    routeFetch({
      [`GET /pages/${PAGE_ID}`]: mockResponse({ ...PAGE, properties: {} }),
      [`GET ${MARKDOWN_PATH}`]: mockResponse({ markdown: '', truncated: false, unknown_block_ids: [] }),
    })

    const page = await getPage(PAGE_ID)

    expect(page.title).toBe('Untitled')
  })

  it('reads a data source id as a database whose rows carry their page id', async () => {
    routeFetch({
      [`GET /data_sources/${DATA_SOURCE_ID}`]: mockResponse(DATA_SOURCE),
      [`POST /data_sources/${DATA_SOURCE_ID}/query`]: mockResponse({
        results: [{ id: 'row-1', properties: { Name: { type: 'title', title: [{ plain_text: 'Refund flow' }] } } }],
        has_more: false,
        next_cursor: null,
      }),
    })

    const database = await getPage(DATA_SOURCE_ID)

    expect(database).toEqual({
      id: DATA_SOURCE_ID,
      title: 'Process Check',
      url: DATA_SOURCE.url,
      lastEditedTime: DATA_SOURCE.last_edited_time,
      type: 'database',
      rows: [{ id: 'row-1', properties: { Name: 'Refund flow' } }],
      truncated: false,
      nextCursor: null,
    })
    expect(requestBody(`POST /data_sources/${DATA_SOURCE_ID}/query`)).toEqual({ page_size: 50 })
  })

  it('reads a database id through its first data source and lists the others', async () => {
    routeFetch({
      [`GET /pages/${DATABASE_ID}`]: mockResponse({ code: 'validation_error' }, false, 400),
      [`GET /databases/${DATABASE_ID}`]: mockResponse({
        id: DATABASE_ID,
        title: [{ plain_text: 'Tasks' }],
        url: `https://app.notion.com/p/${DATABASE_ID}`,
        last_edited_time: '2026-11-22T10:00:00.000Z',
        data_sources: [
          { id: DATA_SOURCE_ID, name: 'Open' },
          { id: OTHER_DATA_SOURCE_ID, name: 'Archive' },
        ],
      }),
      [`POST /data_sources/${DATA_SOURCE_ID}/query`]: mockResponse({ results: [{ id: 'row-1', properties: {} }] }),
    })

    const database = await getPage(DATABASE_ID)

    expect(database).toEqual({
      id: DATABASE_ID,
      title: 'Tasks',
      url: `https://app.notion.com/p/${DATABASE_ID}`,
      lastEditedTime: '2026-11-22T10:00:00.000Z',
      type: 'database',
      rows: [{ id: 'row-1', properties: {} }],
      truncated: false,
      nextCursor: null,
      otherDataSources: [{ id: OTHER_DATA_SOURCE_ID, name: 'Archive' }],
    })
    expect(requestedRoutes()).not.toContain(`POST /data_sources/${OTHER_DATA_SOURCE_ID}/query`)
  })

  it('reports more rows and reads on from a cursor', async () => {
    routeFetch({
      [`GET /data_sources/${DATA_SOURCE_ID}`]: mockResponse(DATA_SOURCE),
      [`POST /data_sources/${DATA_SOURCE_ID}/query`]: mockResponse({
        results: [],
        has_more: true,
        next_cursor: 'rows-3',
      }),
    })

    const database = await getPage(DATA_SOURCE_ID, 'rows-2')

    expect(database.truncated).toBe(true)
    expect(database.nextCursor).toBe('rows-3')
    expect(requestBody(`POST /data_sources/${DATA_SOURCE_ID}/query`)).toEqual({
      page_size: 50,
      start_cursor: 'rows-2',
    })
  })

  it('marks a query Notion capped as incomplete even without a next page', async () => {
    routeFetch({
      [`GET /data_sources/${DATA_SOURCE_ID}`]: mockResponse(DATA_SOURCE),
      [`POST /data_sources/${DATA_SOURCE_ID}/query`]: mockResponse({
        results: [],
        has_more: false,
        next_cursor: null,
        request_status: { type: 'incomplete', incomplete_reason: 'query_result_limit_reached' },
      }),
    })

    const database = await getPage(DATA_SOURCE_ID)

    expect(database.truncated).toBe(true)
    expect(database.nextCursor).toBeNull()
  })

  it('throws the page error when the id is neither a page, a data source nor a database', async () => {
    routeFetch({})

    await expect(getPage(PAGE_ID)).rejects.toThrow(`Notion API GET /pages/${PAGE_ID}`)
    expect(requestedRoutes()).toEqual(
      expect.arrayContaining([`GET /data_sources/${PAGE_ID}`, `GET /databases/${PAGE_ID}`])
    )
  })

  it('stops at an error that is not about the kind of object', async () => {
    routeFetch({
      [`GET /pages/${PAGE_ID}`]: mockResponse({ code: 'unauthorized' }, false, 401),
      [`GET ${MARKDOWN_PATH}`]: mockResponse({ markdown: '', truncated: false, unknown_block_ids: [] }),
    })

    await expect(getPage(PAGE_ID)).rejects.toThrow('failed (401)')
    expect(requestedRoutes()).toEqual([`GET /pages/${PAGE_ID}`, `GET ${MARKDOWN_PATH}`])
  })

  it('rejects a value that holds no Notion id without calling Notion', async () => {
    await expect(getPage('refund policy')).rejects.toThrow('"refund policy" is not a Notion page ID or URL.')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('extracts each property type of a row', async () => {
    routeFetch({
      [`GET /data_sources/${DATA_SOURCE_ID}`]: mockResponse(DATA_SOURCE),
      [`POST /data_sources/${DATA_SOURCE_ID}/query`]: mockResponse({
        results: [
          {
            id: 'row-1',
            properties: {
              Name: { type: 'title', title: [{ plain_text: 'Item 1' }] },
              Description: { type: 'rich_text', rich_text: [{ plain_text: 'A description' }] },
              Price: { type: 'number', number: 42.5 },
              Category: { type: 'select', select: { name: 'Electronics' } },
              Tags: { type: 'multi_select', multi_select: [{ name: 'new' }, { name: 'sale' }] },
              Status: { type: 'status', status: { name: 'Active' } },
              Created: { type: 'date', date: { start: '2024-01-01', end: null } },
              Range: { type: 'date', date: { start: '2024-01-01', end: '2024-01-31' } },
              Verified: { type: 'checkbox', checkbox: true },
              Unverified: { type: 'checkbox', checkbox: false },
              Website: { type: 'url', url: 'https://example.com' },
              Email: { type: 'email', email: 'test@test.com' },
              Phone: { type: 'phone_number', phone_number: '+1234567890' },
              Assignee: { type: 'people', people: [{ name: 'Alice' }, { name: 'Bob' }] },
              Related: { type: 'relation', relation: [{ id: 'r1' }, { id: 'r2' }] },
              Computed: { type: 'formula', formula: { type: 'number', number: 100 } },
              Summary: { type: 'rollup', rollup: { type: 'number', number: 500 } },
              Unknown: { type: 'files', files: [] },
              Empty: null,
            },
          },
        ],
      }),
    })

    const database = await getPage(DATA_SOURCE_ID)

    expect(database.rows[0].properties).toEqual({
      Name: 'Item 1',
      Description: 'A description',
      Price: '42.5',
      Category: 'Electronics',
      Tags: 'new, sale',
      Status: 'Active',
      Created: '2024-01-01',
      Range: '2024-01-01 → 2024-01-31',
      Verified: 'Yes',
      Unverified: 'No',
      Website: 'https://example.com',
      Email: 'test@test.com',
      Phone: '+1234567890',
      Assignee: 'Alice, Bob',
      Related: '(2 relations)',
      Computed: '100',
      Summary: '500',
    })
  })
})
