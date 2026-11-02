import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProductionPanel from './ProductionPanel.jsx'
import StudioPanel from '../StudioPanel/StudioPanel.jsx'
import { readyVersionFixture, storyboardVideoFixture } from '../__fixtures__/video.js'

function productionVideo(versions) {
  return { ...storyboardVideoFixture, status: versions[0]?.status, stage: 'production', versions }
}

function idleActions() {
  return { cancel: vi.fn(), retry: vi.fn(), render: vi.fn(), share: vi.fn(), createVariant: vi.fn() }
}

beforeEach(() => {
  vi.restoreAllMocks()
  global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: async () => new Blob(['mp4']) })
  URL.createObjectURL = vi.fn(() => 'blob:video')
  URL.revokeObjectURL = vi.fn()
})

describe('ProductionPanel', () => {
  it('waits for the first version', () => {
    render(
      <ProductionPanel
        video={productionVideo([])}
        token="tok"
        onLogout={vi.fn()}
        busy={false}
        actions={idleActions()}
      />
    )

    expect(screen.getByText('Preparing the first version…')).toBeInTheDocument()
  })

  it('explains a cancelled version and retries that version', async () => {
    const user = userEvent.setup()
    const actions = idleActions()
    const cancelled = { ...readyVersionFixture, version: 2, status: 'cancelled', hasVideo: false }
    render(
      <ProductionPanel
        video={productionVideo([cancelled])}
        token="tok"
        onLogout={vi.fn()}
        busy={false}
        actions={actions}
      />
    )

    expect(screen.getByText('This version was cancelled.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(actions.retry).toHaveBeenCalledTimes(1)
    expect(actions.retry).toHaveBeenCalledWith(2)
  })

  it('locks the actions while another one runs', () => {
    const queued = { ...readyVersionFixture, status: 'queued', hasVideo: false }

    render(
      <ProductionPanel
        video={productionVideo([queued])}
        token="tok"
        onLogout={vi.fn()}
        busy={true}
        actions={idleActions()}
      />
    )

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('goes back to the latest version when a new one is created', async () => {
    const user = userEvent.setup()
    const first = { ...readyVersionFixture, status: 'failed', error: 'Boot failed.', hasVideo: false }
    const second = { ...readyVersionFixture, version: 2 }
    const third = { ...readyVersionFixture, version: 3, status: 'queued', hasVideo: false }
    const { rerender } = render(
      <StudioPanel
        video={productionVideo([second, first])}
        token="tok"
        onLogout={vi.fn()}
        busy={false}
        actions={idleActions()}
      />
    )

    await user.click(screen.getByRole('tab', { name: 'v1' }))
    expect(screen.getByText('Boot failed.')).toBeInTheDocument()

    rerender(
      <StudioPanel
        video={productionVideo([third, second, first])}
        token="tok"
        onLogout={vi.fn()}
        busy={false}
        actions={idleActions()}
      />
    )

    expect(screen.getByRole('tab', { name: 'v3' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByText('Boot failed.')).toBeNull()
  })
})
