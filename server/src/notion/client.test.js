import { describe, it, expect, vi, beforeEach } from 'vitest'

const getNotionToken = vi.fn(async () => 'test-notion-token')
const isNotionConfigured = vi.fn(async () => true)
vi.mock('./settings.js', () => ({ getNotionToken, isNotionConfigured }))

const mockFetch = vi.fn()
global.fetch = mockFetch

const { searchPages, getPage, isConfigured } = await import('./client.js')

function mockResponse(data, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  }
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

  it('returns formatted search results', async () => {
    mockFetch.mockResolvedValue(
      mockResponse({
        results: [
          {
            id: 'page-1',
            object: 'page',
            url: 'https://notion.so/page-1',
            last_edited_time: '2024-01-01',
            properties: {
              title: { type: 'title', title: [{ plain_text: 'My Page' }] },
            },
          },
          {
            id: 'db-1',
            object: 'database',
            url: 'https://notion.so/db-1',
            last_edited_time: '2024-01-02',
            title: [{ plain_text: 'My DB' }],
          },
        ],
      })
    )

    const results = await searchPages('test')
    expect(results).toEqual([
      { id: 'page-1', title: 'My Page', url: 'https://notion.so/page-1', type: 'page', lastEditedTime: '2024-01-01' },
      { id: 'db-1', title: 'My DB', url: 'https://notion.so/db-1', type: 'database', lastEditedTime: '2024-01-02' },
    ])
  })

  it('handles empty results', async () => {
    mockFetch.mockResolvedValue(mockResponse({ results: [] }))
    const results = await searchPages('nothing')
    expect(results).toEqual([])
  })
})

describe('getPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches page with content', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        id: 'page-1',
        url: 'https://notion.so/page-1',
        last_edited_time: '2024-01-01',
        properties: {
          Name: { type: 'title', title: [{ plain_text: 'Test Page' }] },
        },
      })
    )

    mockFetch.mockResolvedValueOnce(
      mockResponse({
        results: [
          { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Hello world' }] }, has_children: false },
        ],
        has_more: false,
      })
    )

    const page = await getPage('page-1')
    expect(page.id).toBe('page-1')
    expect(page.title).toBe('Test Page')
    expect(page.type).toBe('page')
    expect(page.content).toContain('Hello world')
  })

  it('handles API error', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ message: 'Not found' }, false, 404))

    mockFetch.mockResolvedValueOnce(mockResponse({ message: 'Not found' }, false, 404))

    await expect(getPage('bad-id')).rejects.toThrow('Notion API')
  })

  it('handles page with child_database block', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        id: 'page-db',
        url: 'https://notion.so/page-db',
        last_edited_time: '2024-01-01',
        properties: { Name: { type: 'title', title: [{ plain_text: 'DB Page' }] } },
      })
    )
    mockFetch.mockResolvedValueOnce(mockResponse({ results: [], has_more: false }))
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        results: [{ type: 'child_database', id: 'child-db-id', child_database: { title: 'My Table' } }],
      })
    )
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        results: [{ properties: { Name: { type: 'title', title: [{ plain_text: 'Row 1' }] } } }],
        has_more: false,
      })
    )

    const page = await getPage('page-db')
    expect(page.type).toBe('database')
    expect(page.content).toContain('My Table')
  })

  it('falls back to database when page fetch fails', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ message: 'Not found' }, false, 404))
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        id: 'db-1',
        title: [{ plain_text: 'Fallback DB' }],
        url: 'https://notion.so/db-1',
        last_edited_time: '2024-01-01',
      })
    )
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        results: [],
        has_more: false,
      })
    )

    const page = await getPage('db-1')
    expect(page.type).toBe('database')
    expect(page.title).toBe('Fallback DB')
  })

  it('renders heading_1 blocks', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        id: 'p1',
        url: 'https://notion.so/p1',
        last_edited_time: '2024-01-01',
        properties: { Name: { type: 'title', title: [{ plain_text: 'Page' }] } },
      })
    )
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        results: [{ type: 'heading_1', heading_1: { rich_text: [{ plain_text: 'Big Title' }] }, has_children: false }],
        has_more: false,
      })
    )

    const page = await getPage('p1')
    expect(page.content).toContain('# Big Title')
  })

  it('renders heading_2 blocks', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        id: 'p1',
        url: 'https://notion.so/p1',
        last_edited_time: '2024-01-01',
        properties: { Name: { type: 'title', title: [{ plain_text: 'Page' }] } },
      })
    )
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        results: [
          { type: 'heading_2', heading_2: { rich_text: [{ plain_text: 'Medium Title' }] }, has_children: false },
        ],
        has_more: false,
      })
    )

    const page = await getPage('p1')
    expect(page.content).toContain('## Medium Title')
  })

  it('renders heading_3 blocks', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        id: 'p1',
        url: 'https://notion.so/p1',
        last_edited_time: '2024-01-01',
        properties: { Name: { type: 'title', title: [{ plain_text: 'Page' }] } },
      })
    )
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        results: [
          { type: 'heading_3', heading_3: { rich_text: [{ plain_text: 'Small Title' }] }, has_children: false },
        ],
        has_more: false,
      })
    )

    const page = await getPage('p1')
    expect(page.content).toContain('### Small Title')
  })

  it('renders bulleted_list_item blocks', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        id: 'p1',
        url: 'https://notion.so/p1',
        last_edited_time: '2024-01-01',
        properties: { Name: { type: 'title', title: [{ plain_text: 'Page' }] } },
      })
    )
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        results: [
          {
            type: 'bulleted_list_item',
            bulleted_list_item: { rich_text: [{ plain_text: 'Bullet point' }] },
            has_children: false,
          },
        ],
        has_more: false,
      })
    )

    const page = await getPage('p1')
    expect(page.content).toContain('- Bullet point')
  })

  it('renders numbered_list_item blocks', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        id: 'p1',
        url: 'https://notion.so/p1',
        last_edited_time: '2024-01-01',
        properties: { Name: { type: 'title', title: [{ plain_text: 'Page' }] } },
      })
    )
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        results: [
          {
            type: 'numbered_list_item',
            numbered_list_item: { rich_text: [{ plain_text: 'First item' }] },
            has_children: false,
          },
        ],
        has_more: false,
      })
    )

    const page = await getPage('p1')
    expect(page.content).toContain('1. First item')
  })

  it('renders to_do blocks (checked and unchecked)', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        id: 'p1',
        url: 'https://notion.so/p1',
        last_edited_time: '2024-01-01',
        properties: { Name: { type: 'title', title: [{ plain_text: 'Page' }] } },
      })
    )
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        results: [
          { type: 'to_do', to_do: { rich_text: [{ plain_text: 'Done task' }], checked: true }, has_children: false },
          { type: 'to_do', to_do: { rich_text: [{ plain_text: 'Open task' }], checked: false }, has_children: false },
        ],
        has_more: false,
      })
    )

    const page = await getPage('p1')
    expect(page.content).toContain('- [x] Done task')
    expect(page.content).toContain('- [ ] Open task')
  })

  it('renders code blocks', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        id: 'p1',
        url: 'https://notion.so/p1',
        last_edited_time: '2024-01-01',
        properties: { Name: { type: 'title', title: [{ plain_text: 'Page' }] } },
      })
    )
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        results: [
          {
            type: 'code',
            code: { rich_text: [{ plain_text: 'const x = 1;' }], language: 'javascript' },
            has_children: false,
          },
        ],
        has_more: false,
      })
    )

    const page = await getPage('p1')
    expect(page.content).toContain('```javascript')
    expect(page.content).toContain('const x = 1;')
  })

  it('renders divider blocks', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        id: 'p1',
        url: 'https://notion.so/p1',
        last_edited_time: '2024-01-01',
        properties: { Name: { type: 'title', title: [{ plain_text: 'Page' }] } },
      })
    )
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        results: [{ type: 'divider', divider: {}, has_children: false }],
        has_more: false,
      })
    )

    const page = await getPage('p1')
    expect(page.content).toContain('---')
  })

  it('renders quote, callout, and toggle blocks', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        id: 'p1',
        url: 'https://notion.so/p1',
        last_edited_time: '2024-01-01',
        properties: { Name: { type: 'title', title: [{ plain_text: 'Page' }] } },
      })
    )
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        results: [
          { type: 'quote', quote: { rich_text: [{ plain_text: 'A quote' }] }, has_children: false },
          { type: 'callout', callout: { rich_text: [{ plain_text: 'A callout' }] }, has_children: false },
          { type: 'toggle', toggle: { rich_text: [{ plain_text: 'A toggle' }] }, has_children: false },
        ],
        has_more: false,
      })
    )

    const page = await getPage('p1')
    expect(page.content).toContain('A quote')
    expect(page.content).toContain('A callout')
    expect(page.content).toContain('A toggle')
  })

  it('skips unknown block types', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        id: 'p1',
        url: 'https://notion.so/p1',
        last_edited_time: '2024-01-01',
        properties: { Name: { type: 'title', title: [{ plain_text: 'Page' }] } },
      })
    )
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        results: [
          { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Visible' }] }, has_children: false },
          {
            type: 'unsupported_type',
            unsupported_type: { rich_text: [{ plain_text: 'Hidden' }] },
            has_children: false,
          },
        ],
        has_more: false,
      })
    )

    const page = await getPage('p1')
    expect(page.content).toContain('Visible')
    expect(page.content).not.toContain('Hidden')
  })

  it('renders blocks with nested children', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        id: 'p1',
        url: 'https://notion.so/p1',
        last_edited_time: '2024-01-01',
        properties: { Name: { type: 'title', title: [{ plain_text: 'Page' }] } },
      })
    )
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        results: [
          { type: 'toggle', id: 'toggle-1', toggle: { rich_text: [{ plain_text: 'Parent' }] }, has_children: true },
        ],
        has_more: false,
      })
    )
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        results: [
          { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Child content' }] }, has_children: false },
        ],
        has_more: false,
      })
    )

    const page = await getPage('p1')
    expect(page.content).toContain('Parent')
    expect(page.content).toContain('Child content')
  })

  it('returns Untitled when page has no title property', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        id: 'p1',
        url: 'https://notion.so/p1',
        last_edited_time: '2024-01-01',
        properties: { Status: { type: 'select', select: { name: 'Done' } } },
      })
    )
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        results: [{ type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Some text' }] }, has_children: false }],
        has_more: false,
      })
    )

    const page = await getPage('p1')
    expect(page.title).toBe('Untitled')
  })

  it('extracts various property types from database rows', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ message: 'Not found' }, false, 404))
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        id: 'db-props',
        title: [{ plain_text: 'Props DB' }],
        url: 'https://notion.so/db-props',
        last_edited_time: '2024-01-01',
      })
    )
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        results: [
          {
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
        has_more: false,
      })
    )

    const page = await getPage('db-props')
    expect(page.type).toBe('database')
    const content = page.content
    expect(content).toContain('Item 1')
    expect(content).toContain('42.5')
    expect(content).toContain('Electronics')
    expect(content).toContain('new, sale')
    expect(content).toContain('Active')
    expect(content).toContain('2024-01-01')
    expect(content).toContain('2024-01-01 → 2024-01-31')
    expect(content).toContain('Yes')
    expect(content).toContain('No')
    expect(content).toContain('https://example.com')
    expect(content).toContain('test@test.com')
    expect(content).toContain('+1234567890')
    expect(content).toContain('Alice, Bob')
    expect(content).toContain('(2 relations)')
    expect(content).toContain('100')
    expect(content).toContain('500')
  })
})
