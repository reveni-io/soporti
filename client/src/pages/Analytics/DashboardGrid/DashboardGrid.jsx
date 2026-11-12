import { memo } from 'react'
import { itemRect, layoutHeight, sortLayout } from './grid-layout.js'
import { useCompactLayout } from './hooks/useCompactLayout/useCompactLayout.js'
import { useContainerWidth } from './hooks/useContainerWidth/useContainerWidth.js'
import { useGridInteraction } from './hooks/useGridInteraction/useGridInteraction.js'
import './DashboardGrid.css'

const STACK_BREAKPOINT = 720
const ITEM_CLASS = 'dashboard-grid__item'
const IDLE = { isDragging: false, isResizing: false }

function rectStyle({ left, top, width, height }) {
  return { transform: `translate(${left}px, ${top}px)`, width, height }
}

function gridClassName(isStacked, active) {
  if (isStacked) return 'dashboard-grid dashboard-grid--stacked'

  return active ? 'dashboard-grid dashboard-grid--busy' : 'dashboard-grid'
}

function describeItem(item, { width, isStacked, active }) {
  const rect = itemRect(item, width)

  if (isStacked) return { ...IDLE, style: { height: rect.height }, className: `${ITEM_CLASS} ${ITEM_CLASS}--stacked` }
  if (!active || active.id !== item.id) return { ...IDLE, style: rectStyle(rect), className: ITEM_CLASS }

  return {
    isDragging: !active.isResize,
    isResizing: active.isResize,
    style: rectStyle(active.rect),
    className: `${ITEM_CLASS} ${ITEM_CLASS}--${active.isResize ? 'resizing' : 'dragging'}`,
  }
}

export default function DashboardGrid({ layout, onLayoutChange, renderItem }) {
  const { containerRef, width } = useContainerWidth()
  const compacted = useCompactLayout(layout)
  const isStacked = width !== null && width < STACK_BREAKPOINT
  const grid = useGridInteraction({ layout: compacted, width, containerRef, onLayoutChange, disabled: isStacked })
  const { active } = grid

  if (width === null) return <div ref={containerRef} className="dashboard-grid" />

  const items = isStacked ? sortLayout(compacted) : grid.layout
  const gridStyle = isStacked ? undefined : { height: layoutHeight(items) }

  return (
    <div ref={containerRef} className={gridClassName(isStacked, active)} style={gridStyle}>
      {active && <GridPlaceholder item={items.find(item => item.id === active.id)} width={width} />}
      {items.map(item => {
        const { className, style, isDragging, isResizing } = describeItem(item, { width, isStacked, active })

        return (
          <div key={item.id} data-grid-item={item.id} className={className} style={style}>
            <GridItemContent
              id={item.id}
              renderItem={renderItem}
              handleProps={grid.handleProps}
              isDragging={isDragging}
              isResizing={isResizing}
            />
            {!isStacked && <ResizeHandle resizeProps={grid.resizeProps} />}
          </div>
        )
      })}
    </div>
  )
}

function GridPlaceholder({ item, width }) {
  return <div className="dashboard-grid__placeholder" style={rectStyle(itemRect(item, width))} aria-hidden="true" />
}

function ResizeHandle({ resizeProps }) {
  return (
    <button type="button" className="dashboard-grid__resize" aria-label="Resize chart" {...resizeProps}>
      <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
        <path d="M11 5v2a4 4 0 0 1-4 4H5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  )
}

const GridItemContent = memo(function GridItemContent({ id, renderItem, handleProps, isDragging, isResizing }) {
  return renderItem(id, { handleProps, isDragging, isResizing })
})
