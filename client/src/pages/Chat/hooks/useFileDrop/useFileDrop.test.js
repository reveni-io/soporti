import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFileDrop } from './useFileDrop.js'

function pdfFile(name = 'spec.pdf') {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' })
}

function dragEvent({ types = ['Files'], files = [] } = {}) {
  return { preventDefault: vi.fn(), dataTransfer: { types, files, dropEffect: '' } }
}

describe('useFileDrop', () => {
  it('highlights the zone while files are dragged over it', () => {
    const { result } = renderHook(() => useFileDrop(vi.fn(), true))
    expect(result.current.isDraggingFiles).toBe(false)

    act(() => {
      result.current.dropProps.onDragEnter(dragEvent())
    })

    expect(result.current.isDraggingFiles).toBe(true)
  })

  it('keeps the highlight while the drag moves between nested children', () => {
    const { result } = renderHook(() => useFileDrop(vi.fn(), true))

    act(() => {
      result.current.dropProps.onDragEnter(dragEvent())
      result.current.dropProps.onDragEnter(dragEvent())
      result.current.dropProps.onDragLeave(dragEvent())
    })
    expect(result.current.isDraggingFiles).toBe(true)

    act(() => {
      result.current.dropProps.onDragLeave(dragEvent())
    })

    expect(result.current.isDraggingFiles).toBe(false)
  })

  it('hands the dropped files to the handler and clears the highlight', () => {
    const onDropFiles = vi.fn()
    const { result } = renderHook(() => useFileDrop(onDropFiles, true))

    act(() => {
      result.current.dropProps.onDragEnter(dragEvent())
      result.current.dropProps.onDrop(dragEvent({ files: [pdfFile()] }))
    })

    expect(onDropFiles).toHaveBeenCalledTimes(1)
    expect([...onDropFiles.mock.calls[0][0]].map(file => file.name)).toEqual(['spec.pdf'])
    expect(result.current.isDraggingFiles).toBe(false)
  })

  it('marks the drop as copy while it is allowed', () => {
    const { result } = renderHook(() => useFileDrop(vi.fn(), true))
    const event = dragEvent()

    act(() => {
      result.current.dropProps.onDragOver(event)
    })

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(event.dataTransfer.dropEffect).toBe('copy')
  })

  it('refuses the drop when it is not allowed', () => {
    const onDropFiles = vi.fn()
    const { result } = renderHook(() => useFileDrop(onDropFiles, false))
    const overEvent = dragEvent()

    act(() => {
      result.current.dropProps.onDragEnter(dragEvent())
      result.current.dropProps.onDragOver(overEvent)
      result.current.dropProps.onDrop(dragEvent({ files: [pdfFile()] }))
    })

    expect(overEvent.dataTransfer.dropEffect).toBe('none')
    expect(result.current.isDraggingFiles).toBe(false)
    expect(onDropFiles).not.toHaveBeenCalled()
  })

  it('ignores a drag that carries no file so the browser keeps handling it', () => {
    const onDropFiles = vi.fn()
    const { result } = renderHook(() => useFileDrop(onDropFiles, true))
    const enterEvent = dragEvent({ types: ['text/plain'] })
    const dropEvent = dragEvent({ types: ['text/plain'] })

    act(() => {
      result.current.dropProps.onDragEnter(enterEvent)
      result.current.dropProps.onDrop(dropEvent)
    })

    expect(enterEvent.preventDefault).not.toHaveBeenCalled()
    expect(dropEvent.preventDefault).not.toHaveBeenCalled()
    expect(result.current.isDraggingFiles).toBe(false)
    expect(onDropFiles).not.toHaveBeenCalled()
  })

  it('ignores a file drop that arrives empty', () => {
    const onDropFiles = vi.fn()
    const { result } = renderHook(() => useFileDrop(onDropFiles, true))

    act(() => {
      result.current.dropProps.onDrop(dragEvent())
    })

    expect(onDropFiles).not.toHaveBeenCalled()
  })
})
