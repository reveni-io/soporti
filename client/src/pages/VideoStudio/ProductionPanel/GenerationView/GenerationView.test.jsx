import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GenerationView from './GenerationView.jsx'
import { readyVersionFixture, storyboardVideoFixture } from '../../__fixtures__/video.js'

const VIDEO = { ...storyboardVideoFixture, status: 'running', stage: 'production' }

beforeEach(() => {
  vi.restoreAllMocks()
  global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ html: '<!doctype html>' }) })
})

describe('GenerationView', () => {
  it('cancels the generation', async () => {
    const user = userEvent.setup()
    const actions = { cancel: vi.fn() }
    const version = { ...readyVersionFixture, status: 'running', phase: 'preparing', previewReady: false }
    render(
      <GenerationView
        video={VIDEO}
        version={version}
        isLatest
        token="tok"
        onLogout={vi.fn()}
        busy={false}
        actions={actions}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(actions.cancel).toHaveBeenCalledTimes(1)
  })

  it('keeps cancel above the frames and the notes, which can run to 12 sheets and 50 notes', () => {
    const version = {
      ...readyVersionFixture,
      status: 'running',
      phase: 'composing',
      previewReady: false,
      frames: [{ id: 7, times: [0, 1], createdAt: '2026-05-01T10:00:00Z' }],
      events: [{ at: '2026-05-01T10:00:00Z', text: 'Wrote scenes.js.' }],
    }
    render(
      <GenerationView
        video={VIDEO}
        version={version}
        isLatest
        token="tok"
        onLogout={vi.fn()}
        busy={false}
        actions={{ cancel: vi.fn() }}
      />
    )

    const cancel = screen.getByRole('button', { name: 'Cancel' })
    const following = Node.DOCUMENT_POSITION_FOLLOWING
    expect(cancel.compareDocumentPosition(screen.getByRole('region', { name: 'Contact sheets' })) & following).toBe(
      following
    )
    expect(cancel.compareDocumentPosition(screen.getByRole('list', { name: 'Notes' })) & following).toBe(following)
  })

  it('offers no cancel for an older version rendering again, which the server cannot cancel', async () => {
    const version = { ...readyVersionFixture, status: 'running', phase: 'rendering', progress: 30, hasVideo: false }
    render(
      <GenerationView
        video={VIDEO}
        version={version}
        isLatest={false}
        token="tok"
        onLogout={vi.fn()}
        busy={false}
        actions={{ cancel: vi.fn() }}
      />
    )

    expect(await screen.findByTitle('Live preview of version 1')).toBeInTheDocument()
    expect(screen.getByText('Rendering the MP4 · 30%')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  })

  it('shows the render progress without an estimate yet', async () => {
    const version = {
      ...readyVersionFixture,
      status: 'running',
      phase: 'music',
      progress: null,
      etaSeconds: null,
      hasVideo: false,
    }

    render(
      <GenerationView
        video={VIDEO}
        version={version}
        token="tok"
        onLogout={vi.fn()}
        busy={false}
        actions={{ cancel: vi.fn() }}
      />
    )

    expect(screen.getByText('Rendering the MP4 · 0%')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Render progress' })).toHaveAttribute('aria-valuenow', '0')
    expect(await screen.findByTitle('Live preview of version 1')).toBeInTheDocument()
  })
})
