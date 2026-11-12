import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useCardEditor } from './useCardEditor.js'

const CARD_ID = '8c1d2e3f-4a5b-4c6d-9e7f-a0b1c2d3e4f5'
const SQL = 'SELECT week, returns FROM weekly_returns'
const BAR = {
  type: 'bar',
  xKey: 'week',
  groupKey: null,
  series: [{ key: 'returns', label: 'Returns' }],
  stacked: false,
}
const LINE = { ...BAR, type: 'line' }
const CARD = { id: CARD_ID, title: 'Returns per week', sql: SQL, chart: BAR, status: 'ready' }
const RESULT = {
  columns: [
    { name: 'week', kind: 'date' },
    { name: 'returns', kind: 'number' },
  ],
  rows: [{ week: '2026-08-03T00:00:00.000Z', returns: 42 }],
  truncated: false,
}

function respond(body, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

function deferred() {
  let resolve
  const promise = new Promise(done => {
    resolve = done
  })

  return { promise, resolve }
}

function queryBody(index) {
  return JSON.parse(global.fetch.mock.calls[index][1].body)
}

function editorProps(overrides = {}) {
  return {
    card: CARD,
    token: 'tok',
    onLogout: vi.fn(),
    onClose: vi.fn(),
    onSave: vi.fn().mockResolvedValue(),
    onRevise: vi.fn().mockResolvedValue(),
    onDelete: vi.fn().mockResolvedValue(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
  global.fetch = vi.fn().mockResolvedValue(respond({ ...RESULT, chart: BAR }))
})

describe('useCardEditor', () => {
  it('starts from the card and runs its query once to load the preview', async () => {
    const { result } = renderHook(() => useCardEditor(editorProps()))

    expect(result.current.title).toBe('Returns per week')
    expect(result.current.sql).toBe(SQL)
    expect(result.current.chart).toEqual(BAR)
    expect(result.current.preview).toBeNull()
    expect(result.current.isRunning).toBe(true)

    await waitFor(() => expect(result.current.preview).toEqual(RESULT))
    expect(result.current.isRunning).toBe(false)
    expect(result.current.runError).toBeNull()
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][0]).toBe('/api/analytics/query')
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
    expect(queryBody(0)).toEqual({ sql: SQL, chart: BAR })
  })

  it('does not run anything for a card that never got a query', async () => {
    const props = editorProps({ card: { ...CARD, sql: null, chart: null } })

    const { result } = renderHook(() => useCardEditor(props))
    await act(async () => {})

    expect(global.fetch).not.toHaveBeenCalled()
    expect(result.current.sql).toBe('')
    expect(result.current.chart).toBeNull()
    expect(result.current.isRunning).toBe(false)
    expect(result.current.canSave).toBe(false)
  })

  it('runs the edited draft and adopts the chart the server reconciled', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(respond({ ...RESULT, chart: BAR }))
      .mockResolvedValueOnce(respond({ ...RESULT, rows: [], chart: LINE }))
    const { result } = renderHook(() => useCardEditor(editorProps()))
    await waitFor(() => expect(result.current.preview).toEqual(RESULT))

    act(() => result.current.setSql('SELECT 1'))
    act(() => result.current.setChart({ ...BAR, stacked: true }))
    act(() => result.current.run())
    expect(result.current.isRunning).toBe(true)

    await waitFor(() => expect(result.current.chart).toEqual(LINE))
    expect(result.current.preview).toEqual({ ...RESULT, rows: [] })
    expect(result.current.isRunning).toBe(false)
    expect(queryBody(1)).toEqual({ sql: 'SELECT 1', chart: { ...BAR, stacked: true } })
  })

  it('does not start a second run while one is in flight, nor run a blank query', async () => {
    const pending = deferred()
    global.fetch = vi.fn().mockReturnValue(pending.promise)
    const { result } = renderHook(() => useCardEditor(editorProps()))

    act(() => result.current.run())
    expect(global.fetch).toHaveBeenCalledTimes(1)

    await act(async () => pending.resolve(respond({ ...RESULT, chart: BAR })))
    act(() => result.current.setSql('   '))
    act(() => result.current.run())

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(result.current.isRunning).toBe(false)
  })

  it('keeps the preview and exposes the message of the database when a run fails', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(respond({ ...RESULT, chart: BAR }))
      .mockResolvedValueOnce(respond({ error: 'syntax error at or near "SELEC"' }, 422))
    const props = editorProps()
    const { result } = renderHook(() => useCardEditor(props))
    await waitFor(() => expect(result.current.preview).toEqual(RESULT))

    act(() => result.current.setSql('SELEC 1'))
    act(() => result.current.run())

    await waitFor(() => expect(result.current.runError).toBe('syntax error at or near "SELEC"'))
    expect(result.current.preview).toEqual(RESULT)
    expect(result.current.chart).toEqual(BAR)
    expect(result.current.isRunning).toBe(false)
    expect(props.onLogout).not.toHaveBeenCalled()
  })

  it('logs out on a 401 without exposing an error', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({}, 401))
    const props = editorProps()

    const { result } = renderHook(() => useCardEditor(props))

    await waitFor(() => expect(props.onLogout).toHaveBeenCalledTimes(1))
    expect(result.current.runError).toBeNull()
    expect(result.current.isRunning).toBe(false)
  })

  it('ignores a run that lands after the editor closed', async () => {
    const pending = deferred()
    global.fetch = vi.fn().mockReturnValue(pending.promise)
    const props = editorProps()

    const { result, unmount } = renderHook(() => useCardEditor(props))
    unmount()
    await act(async () => pending.resolve(respond({}, 401)))

    expect(props.onLogout).not.toHaveBeenCalled()
    expect(result.current.preview).toBeNull()
  })

  it('saves the trimmed title, the query and the chart, then closes', async () => {
    const props = editorProps()
    const { result } = renderHook(() => useCardEditor(props))
    await waitFor(() => expect(result.current.preview).toEqual(RESULT))

    act(() => result.current.setTitle('  Weekly returns '))
    act(() => result.current.setChart(LINE))
    await act(() => result.current.save())

    expect(props.onSave).toHaveBeenCalledTimes(1)
    expect(props.onSave).toHaveBeenCalledWith(CARD_ID, { title: 'Weekly returns', sql: SQL, chart: LINE })
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('stays open with the reason when a save is rejected', async () => {
    const props = editorProps({ onSave: vi.fn().mockRejectedValue(new Error('column "totl" does not exist')) })
    const { result } = renderHook(() => useCardEditor(props))
    await waitFor(() => expect(result.current.preview).toEqual(RESULT))

    await act(() => result.current.save())

    expect(result.current.submitError).toBe('column "totl" does not exist')
    expect(result.current.isSaving).toBe(false)
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it.each([
    ['title', editor => editor.setTitle('   ')],
    ['query', editor => editor.setSql('')],
  ])('cannot save without a %s', async (_field, clear) => {
    const { result } = renderHook(() => useCardEditor(editorProps()))
    await waitFor(() => expect(result.current.preview).toEqual(RESULT))
    expect(result.current.canSave).toBe(true)

    act(() => clear(result.current))

    expect(result.current.canSave).toBe(false)
  })

  it('cannot save while a save is on its way', async () => {
    const saving = deferred()
    const props = editorProps({ onSave: vi.fn().mockReturnValue(saving.promise) })
    const { result } = renderHook(() => useCardEditor(props))
    await waitFor(() => expect(result.current.preview).toEqual(RESULT))

    act(() => {
      result.current.save()
    })

    expect(result.current.isSaving).toBe(true)
    expect(result.current.canSave).toBe(false)

    await act(async () => saving.resolve())
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('asks for a change and closes', async () => {
    const props = editorProps()
    const { result } = renderHook(() => useCardEditor(props))

    await act(() => result.current.askForChange('make it monthly'))

    expect(props.onRevise).toHaveBeenCalledTimes(1)
    expect(props.onRevise).toHaveBeenCalledWith(CARD_ID, 'make it monthly')
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('stays open with the reason when the change cannot be requested', async () => {
    const props = editorProps({
      onRevise: vi.fn().mockRejectedValue(new Error('The chart is already being generated.')),
    })
    const { result } = renderHook(() => useCardEditor(props))

    await act(() => result.current.askForChange('make it monthly'))

    expect(result.current.reviseError).toBe('The chart is already being generated.')
    expect(result.current.submitError).toBeNull()
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it('deletes the card and closes', async () => {
    const props = editorProps()
    const { result } = renderHook(() => useCardEditor(props))

    await act(() => result.current.remove())

    expect(props.onDelete).toHaveBeenCalledTimes(1)
    expect(props.onDelete).toHaveBeenCalledWith(CARD_ID)
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('stays open with the reason when the card cannot be deleted, replacing an earlier save error', async () => {
    const props = editorProps({
      onSave: vi.fn().mockRejectedValue(new Error('column "totl" does not exist')),
      onDelete: vi.fn().mockRejectedValue(new Error('Failed to delete the chart')),
    })
    const { result } = renderHook(() => useCardEditor(props))
    await waitFor(() => expect(result.current.preview).toEqual(RESULT))

    await act(() => result.current.save())
    expect(result.current.submitError).toBe('column "totl" does not exist')

    await act(() => result.current.remove())

    expect(result.current.submitError).toBe('Failed to delete the chart')
    expect(result.current.isRemoving).toBe(false)
    expect(props.onClose).not.toHaveBeenCalled()
  })
})
