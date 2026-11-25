import { getNotionToken, isNotionConfigured } from './settings.js'

const BASE_URL = 'https://api.notion.com/v1'
const NOTION_VERSION = '2026-03-11'
const MARKDOWN_VERSION = 'v2'
const REQUEST_TIMEOUT_MS = 15_000
const SEARCH_PAGE_SIZE = 20
const ROWS_PAGE_SIZE = 50
const MAX_PAGE_CHARS = 50_000
const WRONG_KIND_STATUSES = new Set([400, 404])
const NOTION_ID_RE = /[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/gi
const URL_QUERY_RE = /[?#].*$/
const READERS = [readPage, readDataSource, readDatabase]

async function request(method, path, body) {
  const token = await getNotionToken()
  if (!token) {
    throw new Error('Notion token not configured. Set it in the admin panel (Notion section).')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })

    if (!res.ok) {
      const text = await res.text()
      const error = new Error(`Notion API ${method} ${path} failed (${res.status}): ${text}`)
      error.status = res.status
      throw error
    }

    return res.json()
  } finally {
    clearTimeout(timer)
  }
}

function withCursor(body, cursor) {
  return cursor ? { ...body, start_cursor: cursor } : body
}

function paging(data) {
  const hasMore = Boolean(data.has_more)

  return {
    truncated: hasMore || data.request_status?.type === 'incomplete',
    nextCursor: hasMore ? data.next_cursor : null,
  }
}

function parseNotionId(value) {
  const ids = String(value).replace(URL_QUERY_RE, '').match(NOTION_ID_RE)
  return ids ? ids.at(-1) : null
}

function extractTextFromRichText(richTextArray) {
  if (!richTextArray || !Array.isArray(richTextArray)) return ''
  return richTextArray.map(rt => rt.plain_text || '').join('')
}

function extractPageTitle(page) {
  const props = page.properties || {}
  for (const prop of Object.values(props)) {
    if (prop.type === 'title') {
      return extractTextFromRichText(prop.title)
    }
  }
  return 'Untitled'
}

function toSearchResult(item) {
  const isDataSource = item.object === 'data_source'

  return {
    id: item.id,
    title: isDataSource ? extractTextFromRichText(item.title) : extractPageTitle(item),
    url: item.url,
    type: isDataSource ? 'database' : 'page',
    lastEditedTime: item.last_edited_time,
  }
}

export async function searchPages(query, cursor = null) {
  const data = await request('POST', '/search', withCursor({ query, page_size: SEARCH_PAGE_SIZE }, cursor))

  return { results: (data.results || []).map(toSearchResult), ...paging(data) }
}

function stringifyDefined(value) {
  return value != null ? String(value) : ''
}

function extractComputedValue(computed) {
  if (!computed) return ''
  return stringifyDefined(computed[computed.type])
}

function extractDateRange(date) {
  if (!date) return ''
  return date.end ? `${date.start} → ${date.end}` : date.start
}

const PROPERTY_EXTRACTORS = {
  title: prop => extractTextFromRichText(prop.title),
  rich_text: prop => extractTextFromRichText(prop.rich_text),
  number: prop => stringifyDefined(prop.number),
  select: prop => prop.select?.name || '',
  multi_select: prop => (prop.multi_select || []).map(s => s.name).join(', '),
  status: prop => prop.status?.name || '',
  date: prop => extractDateRange(prop.date),
  checkbox: prop => (prop.checkbox ? 'Yes' : 'No'),
  url: prop => prop.url || '',
  email: prop => prop.email || '',
  phone_number: prop => prop.phone_number || '',
  people: prop => (prop.people || []).map(p => p.name || p.id).join(', '),
  relation: prop => `(${(prop.relation || []).length} relations)`,
  formula: prop => extractComputedValue(prop.formula),
  rollup: prop => extractComputedValue(prop.rollup),
}

function extractPropertyValue(prop) {
  if (!prop || !Object.hasOwn(PROPERTY_EXTRACTORS, prop.type)) return ''
  return PROPERTY_EXTRACTORS[prop.type](prop)
}

function extractRowEntry(row) {
  const entry = {}
  for (const [key, prop] of Object.entries(row.properties || {})) {
    const value = extractPropertyValue(prop)
    if (value) entry[key] = value
  }
  return entry
}

function toRow(row) {
  return { id: row.id, properties: extractRowEntry(row) }
}

async function queryRows(dataSourceId, cursor) {
  const body = withCursor({ page_size: ROWS_PAGE_SIZE }, cursor)
  const data = await request('POST', `/data_sources/${dataSourceId}/query`, body)

  return { rows: (data.results || []).map(toRow), ...paging(data) }
}

async function readPage(id) {
  const [page, rendered] = await Promise.all([
    request('GET', `/pages/${id}`),
    request('GET', `/pages/${id}/markdown?markdown_version=${MARKDOWN_VERSION}`),
  ])
  const { markdown } = rendered
  const isTooLong = markdown.length > MAX_PAGE_CHARS

  return {
    id: page.id,
    title: extractPageTitle(page),
    url: page.url,
    lastEditedTime: page.last_edited_time,
    type: 'page',
    content: isTooLong ? markdown.slice(0, MAX_PAGE_CHARS) : markdown,
    truncated: isTooLong || Boolean(rendered.truncated),
    unreadBlocks: (rendered.unknown_block_ids || []).length,
  }
}

async function readDataSource(id, cursor) {
  const dataSource = await request('GET', `/data_sources/${id}`)
  const rows = await queryRows(dataSource.id, cursor)

  return {
    id: dataSource.id,
    title: extractTextFromRichText(dataSource.title),
    url: dataSource.url,
    lastEditedTime: dataSource.last_edited_time,
    type: 'database',
    ...rows,
  }
}

async function readDatabase(id, cursor) {
  const database = await request('GET', `/databases/${id}`)
  const [dataSource, ...otherDataSources] = database.data_sources
  if (!dataSource) throw new Error(`The Notion database ${id} has no data source the integration can read.`)

  const rows = await queryRows(dataSource.id, cursor)

  return {
    id: database.id,
    title: extractTextFromRichText(database.title),
    url: database.url,
    lastEditedTime: database.last_edited_time,
    type: 'database',
    ...rows,
    otherDataSources: otherDataSources.map(source => ({ id: source.id, name: source.name })),
  }
}

export async function getPage(pageIdOrUrl, cursor = null) {
  const id = parseNotionId(pageIdOrUrl)
  if (!id) throw new Error(`"${pageIdOrUrl}" is not a Notion page ID or URL.`)

  let firstError = null
  for (const read of READERS) {
    try {
      return await read(id, cursor)
    } catch (err) {
      if (!WRONG_KIND_STATUSES.has(err.status)) throw err
      firstError ??= err
    }
  }

  throw firstError
}

export async function isConfigured() {
  return isNotionConfigured()
}
