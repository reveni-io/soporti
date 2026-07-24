const COL_ID_RE = /^Col[A-Z0-9]{2,}$/

function pickColId(obj) {
  for (const v of [obj?.column_id, obj?.id, obj?.key]) {
    if (typeof v === 'string' && COL_ID_RE.test(v)) return v
  }
  return obj?.column_id ?? obj?.id ?? obj?.key ?? null
}

export function toRichText(text) {
  return [
    {
      type: 'rich_text',
      elements: [{ type: 'rich_text_section', elements: [{ type: 'text', text: String(text ?? '') }] }],
    },
  ]
}

export function richTextToPlain(node) {
  if (Array.isArray(node)) return node.map(richTextToPlain).join('')
  if (node && typeof node === 'object') {
    if (node.type === 'text' && typeof node.text === 'string') return node.text
    return richTextToPlain(node.elements ?? [])
  }
  return ''
}

export async function fetchList(client, { listId, limit = 100 }) {
  const res = await client.apiCall('slackLists.items.list', { list_id: listId, limit })
  return { items: res?.items ?? [] }
}

export async function fetchSchema(client, { listId }) {
  const res = await client.apiCall('files.info', { file: listId })
  const schema = res?.file?.list_metadata?.schema
  if (!Array.isArray(schema)) return []
  return schema.map(c => ({ id: c?.id ?? '', name: c?.name ?? '' })).filter(c => c.id && c.name)
}

export async function updateItemField(client, { listId, rowId, columnId, text }) {
  return client.apiCall('slackLists.items.update', {
    list_id: listId,
    cells: [{ row_id: rowId, column_id: columnId, rich_text: toRichText(text) }],
  })
}

export function getRowId(item) {
  return item?.id ?? item?.row_id ?? null
}

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

export function fieldMap(item) {
  const map = {}
  for (const cell of item?.fields ?? []) {
    const key = cellKey(cell)
    if (key) map[key] = cellText(cell)
  }
  return map
}

export function toTicket(item, { columns = [], titleColumnId = '' } = {}) {
  const nameById = {}
  for (const c of columns) nameById[c.id] = c.name || c.id

  const fields = []
  let title = ''
  for (const cell of item?.fields ?? []) {
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

export function isArchived(item) {
  return Boolean(item?.archived)
}

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
