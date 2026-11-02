import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBriefAttachments } from './useBriefAttachments.js'

function respond(body, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

function pdf(name = 'spec.pdf', size = 4) {
  const file = new File(['%PDF'], name, { type: 'application/pdf' })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('useBriefAttachments', () => {
  it('uploads each file with its mime type and keeps what the server returns', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(respond({ attachment: { name: 'spec.pdf', text: 'Rules', truncated: true } }))
      .mockResolvedValueOnce(respond({ attachment: { name: 'logo.png', imageId: 'img-1' } }))

    const { result } = renderHook(() => useBriefAttachments('tok', vi.fn()))
    await act(() => result.current.addFiles([pdf(), new File(['png'], 'logo.png', { type: 'image/png' })]))

    expect(result.current.attachments).toEqual([
      { name: 'spec.pdf', text: 'Rules', truncated: true },
      { name: 'logo.png', imageId: 'img-1' },
    ])
    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(global.fetch.mock.calls[1][0]).toBe('/api/attachments?name=logo.png')
    expect(global.fetch.mock.calls[1][1].headers).toEqual({ Authorization: 'Bearer tok', 'Content-Type': 'image/png' })
  })

  it('ignores an empty selection', async () => {
    global.fetch = vi.fn()

    const { result } = renderHook(() => useBriefAttachments('tok', vi.fn()))
    await act(() => result.current.addFiles([]))

    expect(global.fetch).not.toHaveBeenCalled()
    expect(result.current.error).toBeNull()
  })

  it('refuses more than five files', async () => {
    global.fetch = vi.fn()
    const files = ['a', 'b', 'c', 'd', 'e', 'f'].map(name => pdf(`${name}.pdf`))

    const { result } = renderHook(() => useBriefAttachments('tok', vi.fn()))
    await act(() => result.current.addFiles(files))

    expect(result.current.error).toBe('You can attach up to 5 files.')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('refuses a file over the size limit', async () => {
    global.fetch = vi.fn()

    const { result } = renderHook(() => useBriefAttachments('tok', vi.fn()))
    await act(() => result.current.addFiles([pdf('huge.pdf', 11 * 1024 * 1024)]))

    expect(result.current.error).toBe('"huge.pdf" is too large (max 10 MB).')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('refuses a file type the server cannot read', async () => {
    global.fetch = vi.fn()

    const { result } = renderHook(() => useBriefAttachments('tok', vi.fn()))
    await act(() => result.current.addFiles([new File(['x'], 'notes.txt', { type: 'text/plain' })]))

    expect(result.current.error).toBe(
      '"notes.txt" is not supported. Attach a PDF, Word, Excel or CSV file, or an image.'
    )
  })

  it('shows the server error and clears it when an attachment is removed', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(respond({ attachment: { name: 'spec.pdf', text: 'Rules' } }))
      .mockResolvedValueOnce(respond({ error: 'Could not read "scan.pdf".' }, 422))

    const { result } = renderHook(() => useBriefAttachments('tok', vi.fn()))
    await act(() => result.current.addFiles([pdf(), pdf('scan.pdf')]))

    expect(result.current.error).toBe('Could not read "scan.pdf".')
    expect(result.current.attachments).toEqual([{ name: 'spec.pdf', text: 'Rules' }])

    act(() => result.current.removeAttachment(0))

    expect(result.current.error).toBeNull()
    expect(result.current.attachments).toEqual([])
  })

  it('logs out on a 401', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({}, 401))
    const onLogout = vi.fn()

    const { result } = renderHook(() => useBriefAttachments('tok', onLogout))
    await act(() => result.current.addFiles([pdf()]))

    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBeNull()
  })
})
