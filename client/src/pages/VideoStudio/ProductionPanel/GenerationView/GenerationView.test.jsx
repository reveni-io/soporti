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
      <GenerationView video={VIDEO} version={version} token="tok" onLogout={vi.fn()} busy={false} actions={actions} />
    )

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(actions.cancel).toHaveBeenCalledTimes(1)
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
