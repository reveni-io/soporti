import { useEffect } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DashboardGrid from './DashboardGrid.jsx'

const WIDE = 1184
const NARROW = 600

function mockContainerBox({ width, top = 0 }) {
  Element.prototype.getBoundingClientRect.mockReturnValue({ width, top, left: 0 })
}

function stubResizeObserver() {
  const callbacks = []

  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback) {
        callbacks.push(callback)
      }

      observe() {}

      disconnect() {}
    }
  )

  return width => act(() => callbacks[0]([{ contentRect: { width } }]))
}

function MountProbe({ id, onMount }) {
  useEffect(() => {
    onMount(id)
  }, [id, onMount])

  return <article aria-label={`Card ${id}`} />
}

function renderCard(id, { handleProps, isDragging, isResizing }) {
  return (
    <article aria-label={`Card ${id}`}>
      <header {...handleProps}>
        <h2>Chart {id}</h2>
        <button type="button">Edit {id}</button>
      </header>
      {isDragging && <p>Dragging {id}</p>}
      {isResizing && <p>Resizing {id}</p>}
    </article>
  )
}

function getItem(id) {
  return screen.getByRole('article', { name: `Card ${id}` }).parentElement
}

function getHandle(id) {
  return within(getItem(id)).getByRole('group', { name: /move chart/i })
}

function getResizeHandle(id) {
  return within(getItem(id)).getByRole('button', { name: 'Resize chart' })
}

describe('DashboardGrid', () => {
  beforeEach(() => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect')
    mockContainerBox({ width: WIDE })
    Element.prototype.setPointerCapture = vi.fn()
    Element.prototype.hasPointerCapture = vi.fn(() => true)
    Element.prototype.releasePointerCapture = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    delete Element.prototype.setPointerCapture
    delete Element.prototype.hasPointerCapture
    delete Element.prototype.releasePointerCapture
  })

  it('renders every item through renderItem at its place on the grid', () => {
    const layout = [
      { id: 'a', x: 0, y: 0, w: 6, h: 4 },
      { id: 'b', x: 6, y: 0, w: 6, h: 2 },
      { id: 'c', x: 0, y: 4, w: 12, h: 3 },
    ]

    render(<DashboardGrid layout={layout} onLayoutChange={vi.fn()} renderItem={renderCard} />)

    expect(screen.getByRole('heading', { name: 'Chart a' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Chart b' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Chart c' })).toBeInTheDocument()
    expect(getItem('a')).toHaveStyle({ transform: 'translate(0px, 0px)', width: '584px', height: '336px' })
    expect(getItem('b')).toHaveStyle({ transform: 'translate(600px, 0px)', width: '584px', height: '160px' })
    expect(getItem('c')).toHaveStyle({ transform: 'translate(0px, 352px)', width: '1184px', height: '248px' })
    expect(getItem('a').parentElement).toHaveStyle({ height: '600px' })
    expect(screen.getAllByRole('button', { name: 'Resize chart' })).toHaveLength(3)
  })

  it('renders an empty grid without any item', () => {
    const { container } = render(<DashboardGrid layout={[]} onLayoutChange={vi.fn()} renderItem={renderCard} />)

    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(container.firstChild).toHaveStyle({ height: '0px' })
  })

  it('falls back to a default width when the container cannot be measured', () => {
    mockContainerBox({ width: 0 })

    render(
      <DashboardGrid layout={[{ id: 'a', x: 6, y: 0, w: 6, h: 2 }]} onLayoutChange={vi.fn()} renderItem={renderCard} />
    )

    expect(getItem('a')).toHaveStyle({ transform: 'translate(608px, 0px)', width: '592px' })
  })

  it('shows a layout that is not compact already compacted', () => {
    const layout = [
      { id: 'a', x: 0, y: 5, w: 6, h: 4 },
      { id: 'b', x: 0, y: 5, w: 6, h: 2 },
    ]

    render(<DashboardGrid layout={layout} onLayoutChange={vi.fn()} renderItem={renderCard} />)

    expect(getItem('a')).toHaveStyle({ transform: 'translate(0px, 0px)' })
    expect(getItem('b')).toHaveStyle({ transform: 'translate(0px, 352px)' })
  })

  it('renders from the layout prop again when the parent changes it', () => {
    const { rerender } = render(
      <DashboardGrid layout={[{ id: 'a', x: 0, y: 0, w: 6, h: 4 }]} onLayoutChange={vi.fn()} renderItem={renderCard} />
    )

    rerender(
      <DashboardGrid
        layout={[
          { id: 'b', x: 0, y: 0, w: 4, h: 2 },
          { id: 'a', x: 4, y: 0, w: 8, h: 4 },
        ]}
        onLayoutChange={vi.fn()}
        renderItem={renderCard}
      />
    )

    expect(getItem('a')).toHaveStyle({ transform: 'translate(400px, 0px)', width: '784px' })
    expect(getItem('b')).toHaveStyle({ transform: 'translate(0px, 0px)', width: '384px' })
  })

  describe('keyboard', () => {
    it('moves the focused item one column and commits the compacted layout', async () => {
      const user = userEvent.setup()
      const onLayoutChange = vi.fn()
      const layout = [
        { id: 'a', x: 0, y: 0, w: 6, h: 4 },
        { id: 'b', x: 6, y: 0, w: 6, h: 4 },
      ]

      render(<DashboardGrid layout={layout} onLayoutChange={onLayoutChange} renderItem={renderCard} />)
      getHandle('a').focus()
      await user.keyboard('{ArrowRight}')

      expect(onLayoutChange).toHaveBeenCalledTimes(1)
      expect(onLayoutChange).toHaveBeenCalledWith([
        { id: 'a', x: 1, y: 0, w: 6, h: 4 },
        { id: 'b', x: 6, y: 4, w: 6, h: 4 },
      ])
    })

    it('moves the focused item past the card below and past the card above', async () => {
      const user = userEvent.setup()
      const onLayoutChange = vi.fn()
      const layout = [
        { id: 'a', x: 0, y: 0, w: 12, h: 4 },
        { id: 'b', x: 0, y: 4, w: 12, h: 2 },
      ]

      render(<DashboardGrid layout={layout} onLayoutChange={onLayoutChange} renderItem={renderCard} />)
      getHandle('a').focus()
      await user.keyboard('{ArrowDown}')
      getHandle('b').focus()
      await user.keyboard('{ArrowUp}')

      expect(onLayoutChange).toHaveBeenCalledTimes(2)
      expect(onLayoutChange).toHaveBeenNthCalledWith(1, [
        { id: 'a', x: 0, y: 2, w: 12, h: 4 },
        { id: 'b', x: 0, y: 0, w: 12, h: 2 },
      ])
      expect(onLayoutChange).toHaveBeenNthCalledWith(2, [
        { id: 'a', x: 0, y: 2, w: 12, h: 4 },
        { id: 'b', x: 0, y: 0, w: 12, h: 2 },
      ])
    })

    it('does nothing at the edges of the grid', async () => {
      const user = userEvent.setup()
      const onLayoutChange = vi.fn()
      const layout = [
        { id: 'a', x: 0, y: 0, w: 6, h: 4 },
        { id: 'b', x: 6, y: 0, w: 6, h: 4 },
      ]

      render(<DashboardGrid layout={layout} onLayoutChange={onLayoutChange} renderItem={renderCard} />)
      getHandle('a').focus()
      await user.keyboard('{ArrowLeft}{ArrowUp}{ArrowDown}')
      getHandle('b').focus()
      await user.keyboard('{ArrowRight}{ArrowUp}{ArrowDown}')

      expect(onLayoutChange).not.toHaveBeenCalled()
    })

    it('resizes the focused item with Shift and the arrow keys', async () => {
      const user = userEvent.setup()
      const onLayoutChange = vi.fn()
      const layout = [
        { id: 'a', x: 0, y: 0, w: 6, h: 4 },
        { id: 'b', x: 6, y: 0, w: 6, h: 4 },
      ]

      render(<DashboardGrid layout={layout} onLayoutChange={onLayoutChange} renderItem={renderCard} />)
      getHandle('a').focus()
      await user.keyboard('{Shift>}{ArrowRight}{ArrowDown}{ArrowLeft}{ArrowUp}{/Shift}')

      expect(onLayoutChange).toHaveBeenCalledTimes(4)
      expect(onLayoutChange).toHaveBeenNthCalledWith(1, [
        { id: 'a', x: 0, y: 0, w: 7, h: 4 },
        { id: 'b', x: 6, y: 4, w: 6, h: 4 },
      ])
      expect(onLayoutChange).toHaveBeenNthCalledWith(2, [
        { id: 'a', x: 0, y: 0, w: 6, h: 5 },
        { id: 'b', x: 6, y: 0, w: 6, h: 4 },
      ])
      expect(onLayoutChange).toHaveBeenNthCalledWith(3, [
        { id: 'a', x: 0, y: 0, w: 5, h: 4 },
        { id: 'b', x: 6, y: 0, w: 6, h: 4 },
      ])
      expect(onLayoutChange).toHaveBeenNthCalledWith(4, [
        { id: 'a', x: 0, y: 0, w: 6, h: 3 },
        { id: 'b', x: 6, y: 0, w: 6, h: 4 },
      ])
    })

    it('does not resize past the minimum size nor past the right edge', async () => {
      const user = userEvent.setup()
      const onLayoutChange = vi.fn()
      const layout = [
        { id: 'a', x: 0, y: 0, w: 2, h: 2 },
        { id: 'b', x: 6, y: 0, w: 6, h: 4 },
      ]

      render(<DashboardGrid layout={layout} onLayoutChange={onLayoutChange} renderItem={renderCard} />)
      getHandle('a').focus()
      await user.keyboard('{Shift>}{ArrowLeft}{ArrowUp}{/Shift}')
      getHandle('b').focus()
      await user.keyboard('{Shift>}{ArrowRight}{/Shift}')

      expect(onLayoutChange).not.toHaveBeenCalled()
    })

    it('resizes with the plain arrow keys when the resize handle has the focus', async () => {
      const user = userEvent.setup()
      const onLayoutChange = vi.fn()

      render(
        <DashboardGrid
          layout={[{ id: 'a', x: 0, y: 0, w: 6, h: 4 }]}
          onLayoutChange={onLayoutChange}
          renderItem={renderCard}
        />
      )
      getResizeHandle('a').focus()
      await user.keyboard('{ArrowRight}')

      expect(onLayoutChange).toHaveBeenCalledTimes(1)
      expect(onLayoutChange).toHaveBeenCalledWith([{ id: 'a', x: 0, y: 0, w: 7, h: 4 }])
    })

    it('ignores the other keys, key combinations and keys pressed on a control inside the handle', async () => {
      const user = userEvent.setup()
      const onLayoutChange = vi.fn()

      render(
        <DashboardGrid
          layout={[{ id: 'a', x: 0, y: 0, w: 6, h: 4 }]}
          onLayoutChange={onLayoutChange}
          renderItem={renderCard}
        />
      )
      getHandle('a').focus()
      await user.keyboard('{Enter}{Alt>}{ArrowRight}{/Alt}{Control>}{ArrowRight}{/Control}{Meta>}{ArrowRight}{/Meta}')
      screen.getByRole('button', { name: 'Edit a' }).focus()
      await user.keyboard('{ArrowRight}')

      expect(onLayoutChange).not.toHaveBeenCalled()
    })
  })

  describe('dragging', () => {
    const layout = [
      { id: 'a', x: 0, y: 0, w: 6, h: 4 },
      { id: 'b', x: 6, y: 0, w: 6, h: 4 },
    ]

    it('follows the pointer, pushes the other cards live and commits once on release', () => {
      const onLayoutChange = vi.fn()

      render(<DashboardGrid layout={layout} onLayoutChange={onLayoutChange} renderItem={renderCard} />)
      const handle = getHandle('a')
      fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 50, clientY: 20 })
      fireEvent.pointerMove(handle, { pointerId: 1, clientX: 337, clientY: 31 })

      expect(handle.setPointerCapture).toHaveBeenCalledWith(1)
      expect(screen.getByText('Dragging a')).toBeInTheDocument()
      expect(getItem('a')).toHaveClass('dashboard-grid__item--dragging')
      expect(getItem('a')).toHaveStyle({ transform: 'translate(287px, 11px)', width: '584px', height: '336px' })
      expect(getItem('b')).toHaveStyle({ transform: 'translate(600px, 352px)' })
      expect(getItem('a').parentElement.firstChild).toHaveClass('dashboard-grid__placeholder')
      expect(getItem('a').parentElement.firstChild).toHaveStyle({
        transform: 'translate(300px, 0px)',
        width: '584px',
        height: '336px',
      })
      expect(onLayoutChange).not.toHaveBeenCalled()

      fireEvent.pointerMove(handle, { pointerId: 1, clientX: 655, clientY: 25 })
      fireEvent.pointerUp(handle, { pointerId: 1, clientX: 655, clientY: 25 })

      expect(onLayoutChange).toHaveBeenCalledTimes(1)
      expect(onLayoutChange).toHaveBeenCalledWith([
        { id: 'a', x: 6, y: 0, w: 6, h: 4 },
        { id: 'b', x: 6, y: 4, w: 6, h: 4 },
      ])
      expect(screen.queryByText('Dragging a')).not.toBeInTheDocument()
      expect(getItem('a')).not.toHaveClass('dashboard-grid__item--dragging')
      expect(getItem('a').parentElement.firstChild).not.toHaveClass('dashboard-grid__placeholder')
    })

    it('shows the committed layout once the parent stores it', () => {
      const stored = { current: layout }
      const onLayoutChange = vi.fn(next => {
        stored.current = next
      })

      const { rerender } = render(
        <DashboardGrid layout={stored.current} onLayoutChange={onLayoutChange} renderItem={renderCard} />
      )
      fireEvent.pointerDown(getHandle('b'), { pointerId: 1, button: 0, clientX: 700, clientY: 20 })
      fireEvent.pointerMove(getHandle('b'), { pointerId: 1, clientX: 100, clientY: 20 })
      fireEvent.pointerUp(getHandle('b'), { pointerId: 1, clientX: 100, clientY: 20 })
      rerender(<DashboardGrid layout={stored.current} onLayoutChange={onLayoutChange} renderItem={renderCard} />)

      expect(onLayoutChange).toHaveBeenCalledTimes(1)
      expect(getItem('b')).toHaveStyle({ transform: 'translate(0px, 0px)' })
      expect(getItem('a')).toHaveStyle({ transform: 'translate(0px, 352px)' })
    })

    it('goes back to the layout prop when the parent does not store the change', () => {
      const onLayoutChange = vi.fn()

      render(<DashboardGrid layout={layout} onLayoutChange={onLayoutChange} renderItem={renderCard} />)
      fireEvent.pointerDown(getHandle('b'), { pointerId: 1, button: 0, clientX: 700, clientY: 20 })
      fireEvent.pointerMove(getHandle('b'), { pointerId: 1, clientX: 100, clientY: 20 })
      fireEvent.pointerUp(getHandle('b'), { pointerId: 1, clientX: 100, clientY: 20 })

      expect(onLayoutChange).toHaveBeenCalledTimes(1)
      expect(getItem('a')).toHaveStyle({ transform: 'translate(0px, 0px)' })
      expect(getItem('b')).toHaveStyle({ transform: 'translate(600px, 0px)' })
    })

    it('commits nothing for a click without movement', () => {
      const onLayoutChange = vi.fn()

      render(<DashboardGrid layout={layout} onLayoutChange={onLayoutChange} renderItem={renderCard} />)
      fireEvent.pointerDown(getHandle('a'), { pointerId: 1, button: 0, clientX: 50, clientY: 20 })
      fireEvent.pointerMove(getHandle('a'), { pointerId: 1, clientX: 52, clientY: 22 })

      expect(screen.queryByText('Dragging a')).not.toBeInTheDocument()

      fireEvent.pointerUp(getHandle('a'), { pointerId: 1, clientX: 52, clientY: 22 })

      expect(onLayoutChange).not.toHaveBeenCalled()
      expect(getItem('a')).toHaveStyle({ transform: 'translate(0px, 0px)' })
    })

    it('commits nothing when the item is dropped back where it started', () => {
      const onLayoutChange = vi.fn()

      render(<DashboardGrid layout={layout} onLayoutChange={onLayoutChange} renderItem={renderCard} />)
      fireEvent.pointerDown(getHandle('a'), { pointerId: 1, button: 0, clientX: 50, clientY: 20 })
      fireEvent.pointerMove(getHandle('a'), { pointerId: 1, clientX: 400, clientY: 20 })
      fireEvent.pointerMove(getHandle('a'), { pointerId: 1, clientX: 60, clientY: 30 })

      expect(screen.getByText('Dragging a')).toBeInTheDocument()

      fireEvent.pointerUp(getHandle('a'), { pointerId: 1, clientX: 60, clientY: 30 })

      expect(onLayoutChange).not.toHaveBeenCalled()
      expect(screen.queryByText('Dragging a')).not.toBeInTheDocument()
    })

    it('does not start a drag from a button inside the handle', () => {
      const onLayoutChange = vi.fn()

      render(<DashboardGrid layout={layout} onLayoutChange={onLayoutChange} renderItem={renderCard} />)
      const button = screen.getByRole('button', { name: 'Edit a' })
      fireEvent.pointerDown(button, { pointerId: 1, button: 0, clientX: 50, clientY: 20 })
      fireEvent.pointerMove(button, { pointerId: 1, clientX: 650, clientY: 20 })

      expect(screen.queryByText('Dragging a')).not.toBeInTheDocument()

      fireEvent.pointerUp(button, { pointerId: 1, clientX: 650, clientY: 20 })

      expect(onLayoutChange).not.toHaveBeenCalled()
      expect(button.setPointerCapture).not.toHaveBeenCalled()
    })

    it('does not start a drag with a secondary mouse button', () => {
      const onLayoutChange = vi.fn()

      render(<DashboardGrid layout={layout} onLayoutChange={onLayoutChange} renderItem={renderCard} />)
      fireEvent.pointerDown(getHandle('a'), { pointerId: 1, button: 2, clientX: 50, clientY: 20 })
      fireEvent.pointerMove(getHandle('a'), { pointerId: 1, clientX: 650, clientY: 20 })
      fireEvent.pointerUp(getHandle('a'), { pointerId: 1, clientX: 650, clientY: 20 })

      expect(onLayoutChange).not.toHaveBeenCalled()
    })

    it('ignores the events of any other pointer', () => {
      const onLayoutChange = vi.fn()

      render(<DashboardGrid layout={layout} onLayoutChange={onLayoutChange} renderItem={renderCard} />)
      fireEvent.pointerDown(getHandle('a'), { pointerId: 1, button: 0, clientX: 50, clientY: 20 })
      fireEvent.pointerMove(getHandle('a'), { pointerId: 2, clientX: 650, clientY: 20 })
      fireEvent.pointerUp(getHandle('a'), { pointerId: 2, clientX: 650, clientY: 20 })
      fireEvent.pointerCancel(getHandle('a'), { pointerId: 2 })

      expect(screen.queryByText('Dragging a')).not.toBeInTheDocument()

      fireEvent.pointerMove(getHandle('a'), { pointerId: 1, clientX: 650, clientY: 20 })

      expect(screen.getByText('Dragging a')).toBeInTheDocument()
      expect(onLayoutChange).not.toHaveBeenCalled()
    })

    it('cancels the drag and restores the layout on Escape', async () => {
      const user = userEvent.setup()
      const onLayoutChange = vi.fn()

      render(<DashboardGrid layout={layout} onLayoutChange={onLayoutChange} renderItem={renderCard} />)
      const handle = getHandle('a')
      fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 50, clientY: 20 })
      fireEvent.pointerMove(handle, { pointerId: 1, clientX: 650, clientY: 20 })
      await user.keyboard('{Enter}')

      expect(screen.getByText('Dragging a')).toBeInTheDocument()

      await user.keyboard('{Escape}')
      fireEvent.pointerUp(handle, { pointerId: 1, clientX: 650, clientY: 20 })

      expect(onLayoutChange).not.toHaveBeenCalled()
      expect(handle.releasePointerCapture).toHaveBeenCalledWith(1)
      expect(screen.queryByText('Dragging a')).not.toBeInTheDocument()
      expect(getItem('a')).toHaveStyle({ transform: 'translate(0px, 0px)' })
      expect(getItem('b')).toHaveStyle({ transform: 'translate(600px, 0px)' })
    })

    it('cancels the drag when the browser cancels the pointer', () => {
      const onLayoutChange = vi.fn()

      render(<DashboardGrid layout={layout} onLayoutChange={onLayoutChange} renderItem={renderCard} />)
      fireEvent.pointerDown(getHandle('a'), { pointerId: 1, button: 0, clientX: 50, clientY: 20 })
      fireEvent.pointerMove(getHandle('a'), { pointerId: 1, clientX: 650, clientY: 20 })
      fireEvent.pointerCancel(getHandle('a'), { pointerId: 1 })
      fireEvent.pointerUp(getHandle('a'), { pointerId: 1, clientX: 650, clientY: 20 })

      expect(onLayoutChange).not.toHaveBeenCalled()
      expect(getItem('b')).toHaveStyle({ transform: 'translate(600px, 0px)' })
    })

    it('keeps the context menu closed while an item is dragged', () => {
      const onLayoutChange = vi.fn()

      render(<DashboardGrid layout={layout} onLayoutChange={onLayoutChange} renderItem={renderCard} />)

      expect(fireEvent.contextMenu(getHandle('a'))).toBe(true)

      fireEvent.pointerDown(getHandle('a'), { pointerId: 1, button: 0, clientX: 50, clientY: 20 })
      fireEvent.pointerMove(getHandle('a'), { pointerId: 1, clientX: 650, clientY: 20 })

      expect(fireEvent.contextMenu(getHandle('a'))).toBe(false)
      expect(screen.getByText('Dragging a')).toBeInTheDocument()

      fireEvent.pointerUp(getHandle('a'), { pointerId: 1, clientX: 650, clientY: 20 })

      expect(onLayoutChange).toHaveBeenCalledTimes(1)
      expect(fireEvent.contextMenu(getHandle('a'))).toBe(true)
    })

    it('cancels the drag when the window loses the focus', () => {
      const onLayoutChange = vi.fn()

      render(<DashboardGrid layout={layout} onLayoutChange={onLayoutChange} renderItem={renderCard} />)
      fireEvent.pointerDown(getHandle('a'), { pointerId: 1, button: 0, clientX: 50, clientY: 20 })
      fireEvent.pointerMove(getHandle('a'), { pointerId: 1, clientX: 650, clientY: 20 })
      fireEvent.blur(window)

      expect(screen.queryByText('Dragging a')).not.toBeInTheDocument()

      fireEvent.pointerUp(getHandle('a'), { pointerId: 1, clientX: 650, clientY: 20 })

      expect(onLayoutChange).not.toHaveBeenCalled()
      expect(getItem('a')).toHaveStyle({ transform: 'translate(0px, 0px)' })
      expect(getItem('b')).toHaveStyle({ transform: 'translate(600px, 0px)' })
    })

    it('keeps the item under the pointer when the page scrolls during the drag', () => {
      const onLayoutChange = vi.fn()
      const stack = [
        { id: 'a', x: 0, y: 0, w: 12, h: 4 },
        { id: 'b', x: 0, y: 4, w: 12, h: 4 },
      ]

      render(<DashboardGrid layout={stack} onLayoutChange={onLayoutChange} renderItem={renderCard} />)
      fireEvent.pointerDown(getHandle('a'), { pointerId: 1, button: 0, clientX: 50, clientY: 20 })
      fireEvent.scroll(window)
      fireEvent.pointerMove(getHandle('a'), { pointerId: 1, clientX: 50, clientY: 30 })
      mockContainerBox({ width: WIDE, top: -176 })
      fireEvent.scroll(window)

      expect(getItem('a')).toHaveStyle({ transform: 'translate(0px, 186px)' })
      expect(getItem('b')).toHaveStyle({ transform: 'translate(0px, 0px)' })

      fireEvent.pointerUp(getHandle('a'), { pointerId: 1, clientX: 50, clientY: 30 })

      expect(onLayoutChange).toHaveBeenCalledTimes(1)
      expect(onLayoutChange).toHaveBeenCalledWith([
        { id: 'a', x: 0, y: 4, w: 12, h: 4 },
        { id: 'b', x: 0, y: 0, w: 12, h: 4 },
      ])
    })

    it('survives a parent render that passes an identical layout in a new array', () => {
      const onLayoutChange = vi.fn()

      const { rerender } = render(
        <DashboardGrid layout={layout} onLayoutChange={onLayoutChange} renderItem={renderCard} />
      )
      fireEvent.pointerDown(getHandle('a'), { pointerId: 1, button: 0, clientX: 50, clientY: 20 })
      fireEvent.pointerMove(getHandle('a'), { pointerId: 1, clientX: 650, clientY: 20 })
      rerender(
        <DashboardGrid
          layout={layout.map(item => ({ ...item }))}
          onLayoutChange={onLayoutChange}
          renderItem={renderCard}
        />
      )

      expect(screen.getByText('Dragging a')).toBeInTheDocument()

      fireEvent.pointerUp(getHandle('a'), { pointerId: 1, clientX: 650, clientY: 20 })

      expect(onLayoutChange).toHaveBeenCalledTimes(1)
    })

    it('drops the drag when the parent changes the layout under it', () => {
      const onLayoutChange = vi.fn()

      const { rerender } = render(
        <DashboardGrid layout={layout} onLayoutChange={onLayoutChange} renderItem={renderCard} />
      )
      fireEvent.pointerDown(getHandle('a'), { pointerId: 1, button: 0, clientX: 50, clientY: 20 })
      fireEvent.pointerMove(getHandle('a'), { pointerId: 1, clientX: 650, clientY: 20 })
      rerender(
        <DashboardGrid
          layout={[...layout, { id: 'c', x: 0, y: 4, w: 12, h: 2 }]}
          onLayoutChange={onLayoutChange}
          renderItem={renderCard}
        />
      )

      expect(screen.queryByText('Dragging a')).not.toBeInTheDocument()
      expect(getItem('c')).toHaveStyle({ transform: 'translate(0px, 352px)' })

      fireEvent.pointerUp(getHandle('a'), { pointerId: 1, clientX: 650, clientY: 20 })

      expect(onLayoutChange).not.toHaveBeenCalled()
    })

    it('keeps native drag and drop from starting on the handle', () => {
      render(<DashboardGrid layout={layout} onLayoutChange={vi.fn()} renderItem={renderCard} />)

      expect(fireEvent.dragStart(getHandle('a'))).toBe(false)
    })
  })

  describe('resizing', () => {
    const layout = [
      { id: 'a', x: 0, y: 0, w: 6, h: 4 },
      { id: 'b', x: 6, y: 0, w: 6, h: 4 },
    ]

    it('shows the live size, pushes the other cards and commits once on release', () => {
      const onLayoutChange = vi.fn()

      render(<DashboardGrid layout={layout} onLayoutChange={onLayoutChange} renderItem={renderCard} />)
      const handle = getResizeHandle('a')
      fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 580, clientY: 330 })
      fireEvent.pointerMove(handle, { pointerId: 1, clientX: 771, clientY: 425 })

      expect(handle.setPointerCapture).toHaveBeenCalledWith(1)
      expect(screen.getByText('Resizing a')).toBeInTheDocument()
      expect(screen.queryByText('Dragging a')).not.toBeInTheDocument()
      expect(getItem('a')).toHaveClass('dashboard-grid__item--resizing')
      expect(getItem('a')).toHaveStyle({ transform: 'translate(0px, 0px)', width: '775px', height: '431px' })
      expect(getItem('b')).toHaveStyle({ transform: 'translate(600px, 440px)' })
      expect(getItem('a').parentElement.firstChild).toHaveStyle({ width: '784px', height: '424px' })
      expect(onLayoutChange).not.toHaveBeenCalled()

      fireEvent.pointerUp(handle, { pointerId: 1, clientX: 771, clientY: 425 })

      expect(onLayoutChange).toHaveBeenCalledTimes(1)
      expect(onLayoutChange).toHaveBeenCalledWith([
        { id: 'a', x: 0, y: 0, w: 8, h: 5 },
        { id: 'b', x: 6, y: 5, w: 6, h: 4 },
      ])
      expect(screen.queryByText('Resizing a')).not.toBeInTheDocument()
    })

    it('stops at the minimum size', () => {
      const onLayoutChange = vi.fn()

      render(<DashboardGrid layout={layout} onLayoutChange={onLayoutChange} renderItem={renderCard} />)
      fireEvent.pointerDown(getResizeHandle('a'), { pointerId: 1, button: 0, clientX: 580, clientY: 330 })
      fireEvent.pointerMove(getResizeHandle('a'), { pointerId: 1, clientX: 5, clientY: 5 })

      expect(getItem('a')).toHaveStyle({ width: '184px', height: '160px' })

      fireEvent.pointerUp(getResizeHandle('a'), { pointerId: 1, clientX: 5, clientY: 5 })

      expect(onLayoutChange).toHaveBeenCalledTimes(1)
      expect(onLayoutChange).toHaveBeenCalledWith([
        { id: 'a', x: 0, y: 0, w: 2, h: 2 },
        { id: 'b', x: 6, y: 0, w: 6, h: 4 },
      ])
    })

    it('commits nothing for a click on the resize handle', () => {
      const onLayoutChange = vi.fn()

      render(<DashboardGrid layout={layout} onLayoutChange={onLayoutChange} renderItem={renderCard} />)
      fireEvent.pointerDown(getResizeHandle('a'), { pointerId: 1, button: 0, clientX: 580, clientY: 330 })
      fireEvent.pointerUp(getResizeHandle('a'), { pointerId: 1, clientX: 580, clientY: 330 })

      expect(onLayoutChange).not.toHaveBeenCalled()
    })

    it('cancels the resize on Escape', async () => {
      const user = userEvent.setup()
      const onLayoutChange = vi.fn()

      render(<DashboardGrid layout={layout} onLayoutChange={onLayoutChange} renderItem={renderCard} />)
      fireEvent.pointerDown(getResizeHandle('a'), { pointerId: 1, button: 0, clientX: 580, clientY: 330 })
      fireEvent.pointerMove(getResizeHandle('a'), { pointerId: 1, clientX: 780, clientY: 330 })
      await user.keyboard('{Escape}')
      fireEvent.pointerUp(getResizeHandle('a'), { pointerId: 1, clientX: 780, clientY: 330 })

      expect(onLayoutChange).not.toHaveBeenCalled()
      expect(getItem('a')).toHaveStyle({ width: '584px', height: '336px' })
    })
  })

  describe('narrow container', () => {
    const layout = [
      { id: 'c', x: 0, y: 4, w: 12, h: 3 },
      { id: 'b', x: 6, y: 0, w: 6, h: 2 },
      { id: 'a', x: 0, y: 0, w: 6, h: 4 },
    ]

    it('stacks the items in a single column in layout order', () => {
      mockContainerBox({ width: NARROW })

      render(<DashboardGrid layout={layout} onLayoutChange={vi.fn()} renderItem={renderCard} />)

      expect(screen.getAllByRole('heading').map(heading => heading.textContent)).toEqual([
        'Chart a',
        'Chart b',
        'Chart c',
      ])
      expect(getItem('a')).toHaveClass('dashboard-grid__item--stacked')
      expect(getItem('a')).toHaveStyle({ height: '336px' })
      expect(getItem('b')).toHaveStyle({ height: '160px' })
      expect(getItem('c')).toHaveStyle({ height: '248px' })
      expect(getItem('a').style.transform).toBe('')
      expect(getItem('a').style.width).toBe('')
    })

    it('disables dragging, resizing and the keyboard', async () => {
      const user = userEvent.setup()
      const onLayoutChange = vi.fn()
      mockContainerBox({ width: NARROW })

      render(<DashboardGrid layout={layout} onLayoutChange={onLayoutChange} renderItem={renderCard} />)
      const header = screen.getByRole('heading', { name: 'Chart a' }).parentElement
      fireEvent.pointerDown(header, { pointerId: 1, button: 0, clientX: 50, clientY: 20 })
      fireEvent.pointerMove(header, { pointerId: 1, clientX: 50, clientY: 400 })
      fireEvent.pointerUp(header, { pointerId: 1, clientX: 50, clientY: 400 })
      await user.click(header)
      await user.keyboard('{ArrowDown}{Shift>}{ArrowDown}{/Shift}')

      expect(onLayoutChange).not.toHaveBeenCalled()
      expect(screen.queryByRole('button', { name: 'Resize chart' })).not.toBeInTheDocument()
      expect(screen.queryByRole('group')).not.toBeInTheDocument()
      expect(header).not.toHaveAttribute('tabindex')
      expect(header).not.toHaveAttribute('data-grid-handle')
      expect(screen.queryByText('Dragging a')).not.toBeInTheDocument()
    })

    it('switches between the grid and the stack when the container is resized', () => {
      const resizeContainer = stubResizeObserver()

      render(<DashboardGrid layout={layout} onLayoutChange={vi.fn()} renderItem={renderCard} />)

      expect(screen.getAllByRole('button', { name: 'Resize chart' })).toHaveLength(3)

      resizeContainer(NARROW)

      expect(screen.queryByRole('button', { name: 'Resize chart' })).not.toBeInTheDocument()
      expect(getItem('b')).toHaveClass('dashboard-grid__item--stacked')

      resizeContainer(720)

      expect(screen.getAllByRole('button', { name: 'Resize chart' })).toHaveLength(3)
      expect(getItem('b')).toHaveStyle({ transform: 'translate(368px, 0px)', width: '352px' })
    })

    it('keeps the cards mounted when the container crosses the breakpoint', () => {
      const resizeContainer = stubResizeObserver()
      const onMount = vi.fn()

      render(
        <DashboardGrid
          layout={layout}
          onLayoutChange={vi.fn()}
          renderItem={id => <MountProbe id={id} onMount={onMount} />}
        />
      )
      resizeContainer(NARROW)
      resizeContainer(WIDE)

      expect(getItem('c')).toHaveStyle({ transform: 'translate(0px, 352px)' })
      expect(onMount).toHaveBeenCalledTimes(3)
      expect(onMount.mock.calls.map(([id]) => id).sort()).toEqual(['a', 'b', 'c'])
    })
  })

  describe('rendering cost', () => {
    it('does not render the cards again while one of them is dragged', () => {
      const layout = [
        { id: 'a', x: 0, y: 0, w: 6, h: 4 },
        { id: 'b', x: 6, y: 0, w: 6, h: 4 },
      ]
      const renderItem = vi.fn(renderCard)

      render(<DashboardGrid layout={layout} onLayoutChange={vi.fn()} renderItem={renderItem} />)
      const rendersBefore = renderItem.mock.calls.filter(([id]) => id === 'b').length
      fireEvent.pointerDown(getHandle('a'), { pointerId: 1, button: 0, clientX: 50, clientY: 20 })
      fireEvent.pointerMove(getHandle('a'), { pointerId: 1, clientX: 350, clientY: 20 })
      fireEvent.pointerMove(getHandle('a'), { pointerId: 1, clientX: 650, clientY: 20 })

      expect(getItem('b')).toHaveStyle({ transform: 'translate(600px, 352px)' })
      expect(renderItem.mock.calls.filter(([id]) => id === 'b')).toHaveLength(rendersBefore)
    })
  })
})
