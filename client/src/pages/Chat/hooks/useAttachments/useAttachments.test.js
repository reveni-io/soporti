import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAttachments } from './useAttachments.js'

function pdfFile(name = 'spec.pdf', size = 1024) {
  const file = new File(['%PDF-1.4'], name, { type: 'application/pdf' })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

function okResponse(attachment) {
  return { ok: true, status: 200, json: async () => ({ attachment }) }
}

describe('useAttachments', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('uploads a file and keeps the extracted attachment', async () => {
    const attachment = { name: 'spec.pdf', text: 'body', truncated: false }
    global.fetch = vi.fn().mockResolvedValue(okResponse(attachment))
    const { result } = renderHook(() => useAttachments('tok'))

    await act(async () => {
      await result.current.addFiles([pdfFile()])
    })

    expect(result.current.attachments).toEqual([attachment])
    expect(result.current.error).toBeNull()
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/attachments?name=spec.pdf')
    expect(options.method).toBe('POST')
    expect(options.headers).toEqual({ Authorization: 'Bearer tok', 'Content-Type': 'application/pdf' })
    expect(options.body).toBeInstanceOf(File)
  })

  it('rejects more files than the per-message limit without uploading', async () => {
    global.fetch = vi.fn()
    const { result } = renderHook(() => useAttachments('tok'))

    await act(async () => {
      await result.current.addFiles([pdfFile('a.pdf'), pdfFile('b.pdf'), pdfFile('c.pdf'), pdfFile('d.pdf')])
    })

    expect(result.current.error).toBe('You can attach up to 3 files per message.')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('rejects a file over the size limit without uploading', async () => {
    global.fetch = vi.fn()
    const { result } = renderHook(() => useAttachments('tok'))

    await act(async () => {
      await result.current.addFiles([pdfFile('huge.pdf', 11 * 1024 * 1024)])
    })

    expect(result.current.error).toBe('"huge.pdf" is too large (max 10 MB).')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('surfaces the server error and keeps the files uploaded before it', async () => {
    const first = { name: 'a.pdf', text: 'body', truncated: false }
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(okResponse(first))
      .mockResolvedValueOnce({ ok: false, status: 422, json: async () => ({ error: 'Could not read "b.pdf".' }) })
    const { result } = renderHook(() => useAttachments('tok'))

    await act(async () => {
      await result.current.addFiles([pdfFile('a.pdf'), pdfFile('b.pdf')])
    })

    expect(result.current.attachments).toEqual([first])
    expect(result.current.error).toBe('Could not read "b.pdf".')
  })

  it('logs the user out on a 401 instead of showing an error', async () => {
    const onAuthError = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'nope' }) })
    const { result } = renderHook(() => useAttachments('tok', onAuthError))

    await act(async () => {
      await result.current.addFiles([pdfFile()])
    })

    expect(onAuthError).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBeNull()
  })

  it('removes one attachment and clears them all', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(okResponse({ name: 'a.pdf', text: 'a', truncated: false }))
      .mockResolvedValueOnce(okResponse({ name: 'b.pdf', text: 'b', truncated: false }))
    const { result } = renderHook(() => useAttachments('tok'))

    await act(async () => {
      await result.current.addFiles([pdfFile('a.pdf'), pdfFile('b.pdf')])
    })
    act(() => result.current.removeAttachment(0))

    expect(result.current.attachments.map(a => a.name)).toEqual(['b.pdf'])

    act(() => result.current.clearAttachments())

    expect(result.current.attachments).toEqual([])
  })

  it('reports the upload while it is in flight', async () => {
    let resolveUpload
    global.fetch = vi.fn().mockReturnValue(new Promise(resolve => (resolveUpload = resolve)))
    const { result } = renderHook(() => useAttachments('tok'))

    act(() => {
      result.current.addFiles([pdfFile()])
    })
    await waitFor(() => expect(result.current.isUploading).toBe(true))

    await act(async () => {
      resolveUpload(okResponse({ name: 'spec.pdf', text: 'body', truncated: false }))
    })

    expect(result.current.isUploading).toBe(false)
  })

  it('derives the content type from the extension when the browser reports none', async () => {
    global.fetch = vi.fn().mockResolvedValue(okResponse({ name: 'spec.docx', text: 'body', truncated: false }))
    const file = new File(['x'], 'spec.docx', { type: '' })
    Object.defineProperty(file, 'size', { value: 10 })
    const { result } = renderHook(() => useAttachments('tok'))

    await act(async () => {
      await result.current.addFiles([file])
    })

    expect(global.fetch.mock.calls[0][1].headers['Content-Type']).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
    expect(result.current.attachments).toHaveLength(1)
  })

  it('rejects an unsupported extension without uploading', async () => {
    global.fetch = vi.fn()
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' })
    Object.defineProperty(file, 'size', { value: 10 })
    const { result } = renderHook(() => useAttachments('tok'))

    await act(async () => {
      await result.current.addFiles([file])
    })

    expect(result.current.error).toMatch(/is not supported/)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('clears the error when an attachment is removed or the list is emptied', async () => {
    global.fetch = vi.fn().mockResolvedValue(okResponse({ name: 'a.pdf', text: 'a', truncated: false }))
    const { result } = renderHook(() => useAttachments('tok'))

    await act(async () => {
      await result.current.addFiles([pdfFile('a.pdf')])
    })
    await act(async () => {
      await result.current.addFiles([pdfFile('huge.pdf', 11 * 1024 * 1024)])
    })
    expect(result.current.error).toMatch(/too large/)

    act(() => result.current.removeAttachment(0))
    expect(result.current.error).toBeNull()

    await act(async () => {
      await result.current.addFiles([pdfFile('huge.pdf', 11 * 1024 * 1024)])
    })
    act(() => result.current.clearAttachments())

    expect(result.current.error).toBeNull()
  })

  it('drops the staged attachments when the conversation changes', async () => {
    global.fetch = vi.fn().mockResolvedValue(okResponse({ name: 'a.pdf', text: 'a', truncated: false }))
    const { result, rerender } = renderHook(({ key }) => useAttachments('tok', undefined, key), {
      initialProps: { key: 0 },
    })

    await act(async () => {
      await result.current.addFiles([pdfFile('a.pdf')])
    })
    expect(result.current.attachments).toHaveLength(1)

    rerender({ key: 1 })

    expect(result.current.attachments).toEqual([])
  })

  it('ignores an empty selection', async () => {
    global.fetch = vi.fn()
    const { result } = renderHook(() => useAttachments('tok'))

    await act(async () => {
      await result.current.addFiles([])
    })

    expect(global.fetch).not.toHaveBeenCalled()
  })
})
