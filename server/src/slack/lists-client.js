// Thin wrappers over the Slack Lists Web API (slackLists.*) plus the pure
// helpers that turn a list item into the ticket view we diagnose. We call the
// generic WebClient.apiCall so this works regardless of whether the installed
// @slack/web-api version exposes typed helpers for these newer methods.
//
// The exact wire shapes of the Lists API (item.fields cell structure, the
// update-cell value key, where the column schema lives in the list response)
// are confirmed against a real list when the feature is wired — they cannot be
// exercised from unit tests. Every shape-dependent bit is isolated here and
// written defensively, so adjusting to Slack's real payload is a local change.

// A Slack List column id looks like "Col018B8C91TM"; the cell value of a text
// column is rich_text (nested blocks), not a plain string. Confirmed against the
// live API: slackLists.items.update rejects a bare `text` property and any
// column_id that does not match this pattern.
const COL_ID_RE = /^Col[A-Z0-9]{2,}$/

// Picks the canonical "Col..." id from a column/cell across the field names
// Slack may use (column_id, id, key), preferring a real Col-id when present.
function pickColId(obj) {
  for (const v of [obj?.column_id, obj?.id, obj?.key]) {
    if (typeof v === 'string' && COL_ID_RE.test(v)) return v
  }
  return obj?.column_id ?? obj?.id ?? obj?.key ?? null
}

// Wraps a plain string into the rich_text block array a text cell requires on
// write (List text fields are always rich text).
export function toRichText(text) {
  return [
    {
      type: 'rich_text',
      elements: [{ type: 'rich_text_section', elements: [{ type: 'text', text: String(text ?? '') }] }],
    },
  ]
}

// Recursively pulls text out of rich_text blocks (blocks → sections → elements →
// {type:'text', text}). Used to read a cell back for the dedup check.
export function richTextToPlain(node) {
  if (Array.isArray(node)) return node.map(richTextToPlain).join('')
  if (node && typeof node === 'object') {
    if (node.type === 'text' && typeof node.text === 'string') return node.text
    return richTextToPlain(node.elements ?? [])
  }
  return ''
}

// Reads one page of items. The column schema is NOT in this response — it comes
// from fetchSchema (files.info). Returns { items }.
export async function fetchList(client, { listId, limit = 100 }) {
  const res = await client.apiCall('slackLists.items.list', { list_id: listId, limit })
  return { items: res?.items ?? [] }
}

// The column schema (names <-> ids). A Slack List is a file, so its schema lives
// in files.info -> file.list_metadata.schema. Returns [{ id, name }] using the
// schema `id` ("Col..."), which is what slackLists.items.update expects as
// column_id and what item cells carry as their column_id.
export async function fetchSchema(client, { listId }) {
  const res = await client.apiCall('files.info', { file: listId })
  const schema = res?.file?.list_metadata?.schema
  if (!Array.isArray(schema)) return []
  return schema.map(c => ({ id: c?.id ?? '', name: c?.name ?? '' })).filter(c => c.id && c.name)
}

// Writes text into one cell of one item. The value must be rich_text blocks,
// and column_id must be a "Col..." id (see toRichText / COL_ID_RE).
export async function updateItemField(client, { listId, rowId, columnId, text }) {
  return client.apiCall('slackLists.items.update', {
    list_id: listId,
    cells: [{ row_id: rowId, column_id: columnId, rich_text: toRichText(text) }],
  })
}

export function getRowId(item) {
  return item?.id ?? item?.row_id ?? null
}

// Extracts plain text from a typed list cell across the common text-bearing
// shapes (a plain string, or rich_text blocks).
export function cellText(cell) {
  if (!cell) return ''
  if (typeof cell.text === 'string') return cell.text
  if (typeof cell.value === 'string') return cell.value
  if (Array.isArray(cell.rich_text)) return richTextToPlain(cell.rich_text)
  if (Array.isArray(cell.value)) return richTextToPlain(cell.value)
  if (Array.isArray(cell.text)) return richTextToPlain(cell.text)
  return ''
}

export function cellKey(cell) {
  return pickColId(cell)
}

// Map of { columnId -> plainText } for an item, used to check whether the
// diagnosis column is already filled (durable dedup).
export function fieldMap(item) {
  const map = {}
  for (const cell of item?.fields ?? []) {
    const key = cellKey(cell)
    if (key) map[key] = cellText(cell)
  }
  return map
}

// Builds { title, fields: [{ label, value }] } from an item, labeling cells by
// column name when the schema is known, otherwise by raw column id.
export function toTicket(item, { columns = [], titleColumnId = '' } = {}) {
  const nameById = {}
  for (const c of columns) nameById[c.id] = c.name || c.id

  const fields = []
  let title = ''
  for (const cell of item?.fields ?? []) {
    // Attachment cells carry raw file ids, not readable text — they are handled
    // separately as images (collectTicketImages), so keep them out of the text.
    if (Array.isArray(cell.attachment)) continue
    const key = cellKey(cell)
    if (!key) continue
    const value = cellText(cell)
    if (titleColumnId && key === titleColumnId) {
      title = value
      continue
    }
    if (value) fields.push({ label: nameById[key] || key, value })
  }
  if (!title) title = item?.title ?? item?.name ?? ''
  return { title, fields }
}

// Resolves the diagnosis column id. A configured columnId is trusted only when
// it is a real column id in the schema (or there is no schema to check against);
// otherwise we fall back to matching by name, so a stale or mistyped
// SLACK_AUTODIAGNOSE_COLUMN_ID can't silently break writes. Returns '' when it
// cannot be resolved (the poller then logs and skips).
export function resolveColumnId(columns, { columnId = '', columnName = '' } = {}) {
  const cols = columns ?? []
  const byName = () => {
    const target = columnName.trim().toLowerCase()
    if (!target) return ''
    return cols.find(c => (c.name ?? '').trim().toLowerCase() === target)?.id ?? ''
  }
  if (columnId) {
    if (cols.length === 0 || cols.some(c => c.id === columnId)) return columnId
    return byName() || columnId
  }
  return byName()
}

// Old/closed tickets predate the diagnosis column, so their cell is empty and
// would otherwise look "not yet diagnosed". These let the poller skip the
// historical backlog instead of diagnosing it on first activation.
export function isArchived(item) {
  return Boolean(item?.archived)
}

// Parses a list timestamp into epoch ms. Accepts epoch seconds, epoch ms, or an
// ISO/date string; returns null when it cannot (date_created's exact shape is
// confirmed against the real list at wiring).
export function parseListTimestamp(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value
  const asNumber = Number(value)
  if (!Number.isNaN(asNumber)) return asNumber < 1e12 ? asNumber * 1000 : asNumber
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

export function getCreatedMs(item) {
  return parseListTimestamp(item?.date_created ?? item?.created_time ?? item?.created ?? null)
}
