import { getNotionToken, isNotionConfigured } from './settings.js'

const BASE_URL = 'https://api.notion.com/v1'
const REQUEST_TIMEOUT_MS = 15_000
const MAX_BLOCK_DEPTH = 3
const MAX_BLOCKS = 200

async function request(method, path, body) {
  // The token lives in the database (admin panel → Notion section), so it is
  // resolved per request instead of read once from an env var.
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
        'Notion-Version': '2022-06-28',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Notion API ${method} ${path} failed (${res.status}): ${text}`)
    }

    return res.json()
  } finally {
    clearTimeout(timer)
  }
}

function extractTextFromRichText(richTextArray) {
  if (!richTextArray || !Array.isArray(richTextArray)) return ''
  return richTextArray.map(rt => rt.plain_text || '').join('')
}

function extractBlockText(block) {
  const type = block.type
  const data = block[type]
  if (!data) return null

  switch (type) {
    case 'paragraph':
    case 'quote':
    case 'callout':
    case 'toggle':
      return extractTextFromRichText(data.rich_text)
    case 'heading_1':
      return `# ${extractTextFromRichText(data.rich_text)}`
    case 'heading_2':
      return `## ${extractTextFromRichText(data.rich_text)}`
    case 'heading_3':
      return `### ${extractTextFromRichText(data.rich_text)}`
    case 'bulleted_list_item':
      return `- ${extractTextFromRichText(data.rich_text)}`
    case 'numbered_list_item':
      return `1. ${extractTextFromRichText(data.rich_text)}`
    case 'to_do': {
      const checked = data.checked ? 'x' : ' '
      return `- [${checked}] ${extractTextFromRichText(data.rich_text)}`
    }
    case 'code':
      return `\`\`\`${data.language || ''}\n${extractTextFromRichText(data.rich_text)}\n\`\`\``
    case 'divider':
      return '---'
    default:
      return null
  }
}

async function fetchChildBlocks(blockId, depth = 0, counter = { count: 0 }) {
  if (depth >= MAX_BLOCK_DEPTH || counter.count >= MAX_BLOCKS) return []

  const lines = []
  let cursor

  do {
    const path = `/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`
    const data = await request('GET', path)

    for (const block of data.results || []) {
      if (counter.count >= MAX_BLOCKS) break
      counter.count++

      const text = extractBlockText(block)
      if (text !== null) lines.push(text)

      if (block.has_children && depth + 1 < MAX_BLOCK_DEPTH) {
        const children = await fetchChildBlocks(block.id, depth + 1, counter)
        lines.push(...children.map(l => `  ${l}`))
      }
    }

    cursor = data.has_more && counter.count < MAX_BLOCKS ? data.next_cursor : null
  } while (cursor)

  return lines
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

export async function searchPages(query) {
  const data = await request('POST', '/search', {
    query,
    page_size: 20,
  })

  return (data.results || []).map(item => ({
    id: item.id,
    title: item.object === 'database' ? extractTextFromRichText(item.title) : extractPageTitle(item),
    url: item.url,
    type: item.object,
    lastEditedTime: item.last_edited_time,
  }))
}

const MAX_DB_ROWS = 50

function extractPropertyValue(prop) {
  if (!prop) return ''
  switch (prop.type) {
    case 'title':
      return extractTextFromRichText(prop.title)
    case 'rich_text':
      return extractTextFromRichText(prop.rich_text)
    case 'number':
      return prop.number != null ? String(prop.number) : ''
    case 'select':
      return prop.select?.name || ''
    case 'multi_select':
      return (prop.multi_select || []).map(s => s.name).join(', ')
    case 'status':
      return prop.status?.name || ''
    case 'date':
      if (!prop.date) return ''
      return prop.date.end ? `${prop.date.start} → ${prop.date.end}` : prop.date.start
    case 'checkbox':
      return prop.checkbox ? 'Yes' : 'No'
    case 'url':
      return prop.url || ''
    case 'email':
      return prop.email || ''
    case 'phone_number':
      return prop.phone_number || ''
    case 'people':
      return (prop.people || []).map(p => p.name || p.id).join(', ')
    case 'relation':
      return `(${(prop.relation || []).length} relations)`
    case 'formula':
      if (!prop.formula) return ''
      return prop.formula[prop.formula.type] != null ? String(prop.formula[prop.formula.type]) : ''
    case 'rollup':
      if (!prop.rollup) return ''
      return prop.rollup[prop.rollup.type] != null ? String(prop.rollup[prop.rollup.type]) : ''
    default:
      return ''
  }
}

async function queryDatabase(databaseId) {
  const rows = []
  let cursor

  do {
    const body = { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }
    const data = await request('POST', `/databases/${databaseId}/query`, body)

    for (const row of data.results || []) {
      if (rows.length >= MAX_DB_ROWS) break
      const entry = {}
      for (const [key, prop] of Object.entries(row.properties || {})) {
        const val = extractPropertyValue(prop)
        if (val) entry[key] = val
      }
      rows.push(entry)
    }

    cursor = data.has_more && rows.length < MAX_DB_ROWS ? data.next_cursor : null
  } while (cursor)

  return rows
}

export async function getPage(pageId) {
  try {
    const page = await request('GET', `/pages/${pageId}`)
    const contentLines = await fetchChildBlocks(pageId)

    if (contentLines.length === 0) {
      const blocksData = await request('GET', `/blocks/${pageId}/children?page_size=100`)
      const dbBlock = (blocksData.results || []).find(b => b.type === 'child_database')
      if (dbBlock) {
        const rows = await queryDatabase(dbBlock.id)
        const dbTitle = dbBlock.child_database?.title || 'Database'
        return {
          id: page.id,
          title: extractPageTitle(page),
          url: page.url,
          lastEditedTime: page.last_edited_time,
          type: 'database',
          content: `Database: ${dbTitle}\n\n${JSON.stringify(rows, null, 2)}`,
        }
      }
    }

    return {
      id: page.id,
      title: extractPageTitle(page),
      url: page.url,
      lastEditedTime: page.last_edited_time,
      type: 'page',
      content: contentLines.join('\n'),
    }
  } catch (pageErr) {
    try {
      const db = await request('GET', `/databases/${pageId}`)
      const rows = await queryDatabase(pageId)
      return {
        id: db.id,
        title: extractTextFromRichText(db.title),
        url: db.url,
        lastEditedTime: db.last_edited_time,
        type: 'database',
        content: `Database with ${rows.length} rows\n\n${JSON.stringify(rows, null, 2)}`,
      }
    } catch {
      throw pageErr
    }
  }
}

// Async because the token lives in the database now. Whether the Notion tools
// are registered is resolved per turn (see buildAgentTools / createAgent).
export async function isConfigured() {
  return isNotionConfigured()
}
