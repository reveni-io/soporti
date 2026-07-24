import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../config.js', () => ({
  default: {
    slack: { botToken: 'xoxb' },
    autoDiagnose: {
      enabled: true,
      listId: 'F1',
      columnId: '',
      columnName: 'Diagnosis',
      profile: 'tech',
      pollIntervalMs: 60000,
      maxItemsPerPoll: 5,
      maxAttachmentBytes: 1000000,
      skipArchived: true,
      skipBefore: '',
    },
  },
}))

vi.mock('./lists-client.js', async orig => {
  const actual = await orig()
  return { ...actual, fetchList: vi.fn(), fetchSchema: vi.fn(), updateItemField: vi.fn(async () => ({ ok: true })) }
})

vi.mock('./auto-diagnose.js', () => ({
  diagnoseTicket: vi.fn(async () => 'DIAGNOSIS'),
}))

vi.mock('./attachments.js', () => ({
  collectTicketImages: vi.fn(async () => []),
}))

vi.mock('./settings.js', () => ({
  getSlackBotToken: vi.fn(async () => 'xoxb-test'),
}))

import config from '../config.js'
import { fetchList, fetchSchema, updateItemField } from './lists-client.js'
import { diagnoseTicket } from './auto-diagnose.js'
import { runPollOnce, stopAutoDiagnose } from './auto-diagnose-poller.js'

const COLUMNS = [
  { id: 'col_diag', name: 'Diagnosis' },
  { id: 'col_details', name: 'Details' },
]

const undiagnosed = id => ({ id, fields: [{ key: 'col_details', text: 'algo roto' }] })
const diagnosed = id => ({
  id,
  fields: [
    { key: 'col_diag', text: 'ya diagnosticado' },
    { key: 'col_details', text: 'x' },
  ],
})

const writtenRows = () => updateItemField.mock.calls.map(([, args]) => args.rowId)

describe('runPollOnce', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stopAutoDiagnose()
    diagnoseTicket.mockResolvedValue('DIAGNOSIS')
    updateItemField.mockResolvedValue({ ok: true })
    fetchSchema.mockResolvedValue(COLUMNS)
    config.autoDiagnose.skipArchived = true
    config.autoDiagnose.skipBefore = ''
    config.autoDiagnose.maxItemsPerPoll = 5
  })

  it('writes a diagnosis into the column for an undiagnosed item', async () => {
    fetchList.mockResolvedValue({ items: [undiagnosed('r1')], columns: COLUMNS })
    const { processed } = await runPollOnce({})
    expect(processed).toBe(1)
    expect(updateItemField).toHaveBeenCalledWith(
      {},
      { listId: 'F1', rowId: 'r1', columnId: 'col_diag', text: 'DIAGNOSIS' }
    )
  })

  it('writes nothing for an item whose diagnosis column is already filled', async () => {
    fetchList.mockResolvedValue({ items: [diagnosed('r1')], columns: COLUMNS })
    const { processed } = await runPollOnce({})
    expect(processed).toBe(0)
    expect(updateItemField).not.toHaveBeenCalled()
  })

  it('writes nothing when the diagnosis column cannot be resolved', async () => {
    fetchList.mockResolvedValue({ items: [undiagnosed('r1')] })
    fetchSchema.mockResolvedValueOnce([{ id: 'x', name: 'Other' }])
    const { processed } = await runPollOnce({})
    expect(processed).toBe(0)
    expect(updateItemField).not.toHaveBeenCalled()
  })

  it('diagnoses at most maxItemsPerPoll tickets in one pass', async () => {
    config.autoDiagnose.maxItemsPerPoll = 2
    fetchList.mockResolvedValue({
      items: [undiagnosed('r1'), undiagnosed('r2'), undiagnosed('r3')],
      columns: COLUMNS,
    })
    const { processed } = await runPollOnce({})
    expect(processed).toBe(2)
    expect(writtenRows()).toEqual(['r1', 'r2'])
  })

  it('writes the other items after one item fails', async () => {
    fetchList.mockResolvedValue({ items: [undiagnosed('r1'), undiagnosed('r2')], columns: COLUMNS })
    diagnoseTicket.mockRejectedValueOnce(new Error('agent boom'))
    const { processed } = await runPollOnce({})
    expect(processed).toBe(2)
    expect(writtenRows()).toEqual(['r2'])
  })

  it('does not diagnose archived (closed) tickets', async () => {
    const archived = { id: 'r1', archived: true, fields: [{ key: 'col_details', text: 'viejo' }] }
    fetchList.mockResolvedValue({ items: [archived, undiagnosed('r2')], columns: COLUMNS })
    const { processed } = await runPollOnce({})
    expect(processed).toBe(1)
    expect(writtenRows()).toEqual(['r2'])
  })

  it('does not diagnose tickets created before the SKIP_BEFORE cutoff', async () => {
    config.autoDiagnose.skipBefore = '2026-06-24T00:00:00Z'
    const old = { id: 'old', date_created: 1700000000, fields: [{ key: 'col_details', text: 'viejo' }] }
    const fresh = { id: 'fresh', date_created: 1800000000, fields: [{ key: 'col_details', text: 'nuevo' }] }
    fetchList.mockResolvedValue({ items: [old, fresh], columns: COLUMNS })
    const { processed } = await runPollOnce({})
    expect(processed).toBe(1)
    expect(writtenRows()).toEqual(['fresh'])
  })

  it('writes nothing for an item with an unreadable date when a cutoff is set (fail-safe)', async () => {
    config.autoDiagnose.skipBefore = '2026-06-24T00:00:00Z'
    const undatable = { id: 'r1', fields: [{ key: 'col_details', text: 'sin fecha' }] }
    fetchList.mockResolvedValue({ items: [undatable], columns: COLUMNS })
    const { processed } = await runPollOnce({})
    expect(processed).toBe(0)
    expect(updateItemField).not.toHaveBeenCalled()
  })

  it('writes nothing and skips the poll when SKIP_BEFORE is set but unparseable (fail-safe)', async () => {
    config.autoDiagnose.skipBefore = 'not-a-date'
    fetchList.mockResolvedValue({ items: [undiagnosed('r1')], columns: COLUMNS })
    const { processed } = await runPollOnce({})
    expect(processed).toBe(0)
    expect(updateItemField).not.toHaveBeenCalled()
  })

  it('starts only one diagnosis for an item already in flight from an overlapping tick', async () => {
    fetchList.mockResolvedValue({ items: [undiagnosed('r1')], columns: COLUMNS })
    const started = []
    let resolveDiag
    diagnoseTicket.mockImplementation(() => {
      started.push('r1')
      return new Promise(r => (resolveDiag = () => r('DIAGNOSIS')))
    })

    const first = runPollOnce({})
    await new Promise(r => setImmediate(r))
    await runPollOnce({})

    expect(started).toEqual(['r1'])
    resolveDiag()
    await first
    expect(writtenRows()).toEqual(['r1'])
  })
})
