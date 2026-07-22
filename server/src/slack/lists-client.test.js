import { describe, it, expect, vi } from 'vitest'
import {
  fetchList,
  fetchSchema,
  updateItemField,
  getRowId,
  cellText,
  fieldMap,
  toTicket,
  resolveColumnId,
  isArchived,
  parseListTimestamp,
  getCreatedMs,
  toRichText,
  richTextToPlain,
} from './lists-client.js'

describe('fetchList', () => {
  it('calls slackLists.items.list and returns the items', async () => {
    const client = { apiCall: vi.fn(async () => ({ items: [{ id: 'r1' }] })) }
    const { items } = await fetchList(client, { listId: 'F1' })
    expect(client.apiCall).toHaveBeenCalledWith('slackLists.items.list', { list_id: 'F1', limit: 100 })
    expect(items).toEqual([{ id: 'r1' }])
  })
})

describe('fetchSchema', () => {
  it('reads the column schema (id + name) from files.info', async () => {
    const client = {
      apiCall: vi.fn(async () => ({
        file: {
          list_metadata: {
            schema: [
              { id: 'Col0FAKEID01', key: 'Col0FAKEKEY1', name: 'Diagnosis', type: 'text' },
              { id: 'Col090U0607AN', key: 'Col07QT6BD478', name: 'Details', type: 'text' },
              { id: '', name: 'broken' },
            ],
          },
        },
      })),
    }
    const columns = await fetchSchema(client, { listId: 'F1' })
    expect(client.apiCall).toHaveBeenCalledWith('files.info', { file: 'F1' })
    expect(columns).toEqual([
      { id: 'Col0FAKEID01', name: 'Diagnosis' },
      { id: 'Col090U0607AN', name: 'Details' },
    ])
  })

  it('returns [] when the schema is missing', async () => {
    const client = { apiCall: vi.fn(async () => ({ file: {} })) }
    expect(await fetchSchema(client, { listId: 'F1' })).toEqual([])
  })
})

describe('updateItemField', () => {
  it('calls slackLists.items.update with a rich_text cell value', async () => {
    const client = { apiCall: vi.fn(async () => ({ ok: true })) }
    await updateItemField(client, { listId: 'F1', rowId: 'Rec1', columnId: 'Col1AB2', text: 'hola' })
    expect(client.apiCall).toHaveBeenCalledWith('slackLists.items.update', {
      list_id: 'F1',
      cells: [{ row_id: 'Rec1', column_id: 'Col1AB2', rich_text: toRichText('hola') }],
    })
    // and the rich_text round-trips back to the plain string
    const cell = client.apiCall.mock.calls[0][1].cells[0]
    expect(richTextToPlain(cell.rich_text)).toBe('hola')
  })
})

describe('getRowId', () => {
  it('reads id or row_id, else null', () => {
    expect(getRowId({ id: 'r1' })).toBe('r1')
    expect(getRowId({ row_id: 'r2' })).toBe('r2')
    expect(getRowId({})).toBeNull()
  })
})

describe('cellText', () => {
  it('reads plain string cells', () => {
    expect(cellText({ text: 'a' })).toBe('a')
    expect(cellText({ value: 'b' })).toBe('b')
    expect(cellText({})).toBe('')
    expect(cellText(null)).toBe('')
  })

  it('reads rich_text blocks (what we write round-trips)', () => {
    expect(cellText({ rich_text: toRichText('hello world') })).toBe('hello world')
  })
})

describe('fieldMap', () => {
  it('maps column ids to plain text', () => {
    const item = {
      fields: [
        { key: 'c1', text: 'a' },
        { column_id: 'c2', value: 'b' },
      ],
    }
    expect(fieldMap(item)).toEqual({ c1: 'a', c2: 'b' })
  })
})

describe('toTicket', () => {
  it('labels fields by column name and falls back to id', () => {
    const ticket = toTicket(
      {
        title: 'T',
        fields: [
          { key: 'c1', text: 'High' },
          { key: 'c2', text: 'd' },
        ],
      },
      { columns: [{ id: 'c1', name: 'Priority' }] }
    )
    expect(ticket).toEqual({
      title: 'T',
      fields: [
        { label: 'Priority', value: 'High' },
        { label: 'c2', value: 'd' },
      ],
    })
  })

  it('lifts the title from a configured title column', () => {
    const ticket = toTicket(
      {
        fields: [
          { key: 'c1', text: 'My title' },
          { key: 'c2', text: 'd' },
        ],
      },
      { columns: [], titleColumnId: 'c1' }
    )
    expect(ticket.title).toBe('My title')
    expect(ticket.fields).toEqual([{ label: 'c2', value: 'd' }])
  })

  it('excludes attachment cells from the text (they are handled as images)', () => {
    const ticket = toTicket(
      {
        title: 'T',
        fields: [
          { key: 'c1', text: 'detalle' },
          { key: 'Shots', value: 'F0IMG', attachment: ['F0IMG'], column_id: 'ColShots' },
        ],
      },
      { columns: [{ id: 'c1', name: 'Details' }] }
    )
    expect(ticket.fields).toEqual([{ label: 'Details', value: 'detalle' }])
  })
})

describe('resolveColumnId', () => {
  const columns = [
    { id: 'c1', name: 'Diagnosis' },
    { id: 'c2', name: 'Details' },
  ]

  it('uses a configured id that exists in the schema', () => {
    expect(resolveColumnId(columns, { columnId: 'c2' })).toBe('c2')
  })

  it('trusts a configured id when there is no schema to check against', () => {
    expect(resolveColumnId([], { columnId: 'Col999' })).toBe('Col999')
  })

  it('matches by name case-insensitively', () => {
    expect(resolveColumnId(columns, { columnName: 'diagnosis' })).toBe('c1')
  })

  it('falls back to the name match when the configured id is stale (not in the schema)', () => {
    // e.g. a leftover SLACK_AUTODIAGNOSE_COLUMN_ID="Diagnosis" (the name, not a Col id)
    expect(resolveColumnId(columns, { columnId: 'Diagnosis', columnName: 'Diagnosis' })).toBe('c1')
  })

  it('keeps an unknown configured id when no name match exists', () => {
    expect(resolveColumnId(columns, { columnId: 'Col999', columnName: 'Missing' })).toBe('Col999')
  })

  it('returns empty string when it cannot resolve', () => {
    expect(resolveColumnId(columns, { columnName: 'Nope' })).toBe('')
    expect(resolveColumnId([], {})).toBe('')
  })
})

describe('isArchived', () => {
  it('reflects the archived flag', () => {
    expect(isArchived({ archived: true })).toBe(true)
    expect(isArchived({ archived: false })).toBe(false)
    expect(isArchived({})).toBe(false)
  })
})

describe('parseListTimestamp', () => {
  it('treats small numbers as epoch seconds', () => {
    expect(parseListTimestamp(1700000000)).toBe(1700000000000)
  })

  it('treats large numbers as epoch milliseconds', () => {
    expect(parseListTimestamp(1700000000000)).toBe(1700000000000)
  })

  it('parses numeric strings and ISO dates', () => {
    expect(parseListTimestamp('1700000000')).toBe(1700000000000)
    expect(parseListTimestamp('2026-06-24T00:00:00Z')).toBe(Date.parse('2026-06-24T00:00:00Z'))
  })

  it('returns null for missing or unparseable values', () => {
    expect(parseListTimestamp(null)).toBeNull()
    expect(parseListTimestamp('')).toBeNull()
    expect(parseListTimestamp('not a date')).toBeNull()
  })
})

describe('getCreatedMs', () => {
  it('reads date_created across fallback keys', () => {
    expect(getCreatedMs({ date_created: 1700000000 })).toBe(1700000000000)
    expect(getCreatedMs({ created_time: '2026-06-24T00:00:00Z' })).toBe(Date.parse('2026-06-24T00:00:00Z'))
    expect(getCreatedMs({})).toBeNull()
  })
})

describe('toRichText / richTextToPlain', () => {
  it('wraps a string into a rich_text block and reads it back', () => {
    const blocks = toRichText('hello')
    expect(blocks[0].type).toBe('rich_text')
    expect(richTextToPlain(blocks)).toBe('hello')
  })

  it('coerces non-strings and returns empty for non-rich-text input', () => {
    expect(richTextToPlain(toRichText(''))).toBe('')
    expect(richTextToPlain(null)).toBe('')
    expect(richTextToPlain([])).toBe('')
  })
})
