import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReadyView from './ReadyView.jsx'
import { readyVersionFixture, storyboardVideoFixture } from '../../__fixtures__/video.js'

const VIDEO = { ...storyboardVideoFixture, status: 'ready', stage: 'production' }

beforeEach(() => {
  vi.restoreAllMocks()
  URL.createObjectURL = vi.fn(() => 'blob:video')
  URL.revokeObjectURL = vi.fn()
})

describe('ReadyView', () => {
  it('keeps Download disabled until the MP4 is loaded', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    render(
      <ReadyView video={VIDEO} version={readyVersionFixture} token="tok" onLogout={vi.fn()} busy={false} actions={{}} />
    )

    expect(screen.getByText('Loading the video…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download MP4' })).toBeDisabled()
  })

  it('shows why the MP4 could not be loaded', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'Video not found.' }) })

    render(
      <ReadyView video={VIDEO} version={readyVersionFixture} token="tok" onLogout={vi.fn()} busy={false} actions={{}} />
    )

    expect(await screen.findByText('Video not found.')).toBeInTheDocument()
  })

  it('shares the version on screen', async () => {
    const user = userEvent.setup()
    const actions = { share: vi.fn() }
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: async () => new Blob(['mp4']) })
    render(
      <ReadyView
        video={VIDEO}
        version={{ ...readyVersionFixture, version: 4 }}
        token="tok"
        onLogout={vi.fn()}
        busy={false}
        actions={actions}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Copy link' }))

    expect(actions.share).toHaveBeenCalledTimes(1)
    expect(actions.share).toHaveBeenCalledWith(4)
  })

  it('opens and closes the variant dialog', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: async () => new Blob(['mp4']) })
    render(
      <ReadyView
        video={VIDEO}
        version={readyVersionFixture}
        token="tok"
        onLogout={vi.fn()}
        busy={false}
        actions={{ createVariant: vi.fn() }}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Create variant' }))
    expect(screen.getByRole('dialog', { name: 'Create a variant' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
