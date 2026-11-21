import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import SharedArtifact from './SharedArtifact.jsx'

const SHARE_ID = 'a'.repeat(32)

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  localStorage.clear()
})

describe('SharedArtifact', () => {
  it('renders the shared artifact with no auth header', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ title: 'Refund dashboard', version: 2, html: '<h1>Refunds</h1>' }),
    })

    render(
      <MemoryRouter>
        <SharedArtifact shareId={SHARE_ID} />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByTitle('Refund dashboard')).toBeInTheDocument())
    expect(screen.getByTitle('Refund dashboard').getAttribute('srcdoc')).toContain('<h1>Refunds</h1>')

    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain(`/api/share/artifact/${SHARE_ID}`)
    expect(options.headers.Authorization).toBeUndefined()
  })

  it('renders the artifact title and a shared badge', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ title: 'Refund dashboard', version: 2, html: '<h1>Refunds</h1>' }),
    })

    render(
      <MemoryRouter>
        <SharedArtifact shareId={SHARE_ID} />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('Refund dashboard')).toBeInTheDocument())
    expect(screen.getByText('Shared artifact')).toBeInTheDocument()
  })

  it('exports the shared artifact as a pdf through the frame', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ title: 'Refund dashboard', version: 2, html: '<h1>Refunds</h1>' }),
    })

    render(
      <MemoryRouter>
        <SharedArtifact shareId={SHARE_ID} />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByRole('button', { name: 'Export as PDF' })).toBeEnabled())
    const frame = screen.getByTitle('Refund dashboard')
    const postMessage = vi.spyOn(frame.contentWindow, 'postMessage')

    await userEvent.click(screen.getByRole('button', { name: 'Export as PDF' }))

    expect(postMessage).toHaveBeenCalledWith({ type: 'artifact_print' }, '*')
  })

  it('cannot export a pdf before the artifact arrives', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    render(
      <MemoryRouter>
        <SharedArtifact shareId={SHARE_ID} />
      </MemoryRouter>
    )

    expect(screen.getByRole('button', { name: 'Export as PDF' })).toBeDisabled()
  })

  it('shows a loading note first', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    render(
      <MemoryRouter>
        <SharedArtifact shareId={SHARE_ID} />
      </MemoryRouter>
    )

    expect(screen.getByText('Loading artifact...')).toBeInTheDocument()
  })

  it('explains an expired link instead of rendering an empty frame', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'Shared artifact not found.' }) })

    render(
      <MemoryRouter>
        <SharedArtifact shareId={SHARE_ID} />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText(/may have expired or the link is invalid/)).toBeInTheDocument())
    expect(screen.queryByTitle('Refund dashboard')).not.toBeInTheDocument()
  })

  it('draws the grid backdrop behind the shared artifact', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ title: 'Refund dashboard', version: 2, html: '<h1>Refunds</h1>' }),
    })

    const { container } = render(
      <MemoryRouter>
        <SharedArtifact shareId={SHARE_ID} />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByTitle('Refund dashboard')).toBeInTheDocument())
    expect(container.querySelector('canvas.grid-pattern')).toBeInTheDocument()
  })

  it('warns that the link is temporary', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ title: 'Refund dashboard', version: 2, html: '<h1>Refunds</h1>' }),
    })

    render(
      <MemoryRouter>
        <SharedArtifact shareId={SHARE_ID} />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText(/may expire at any time/)).toBeInTheDocument())
  })

  it('offers a signed-in reader a way back to the chat', async () => {
    localStorage.setItem('auth_token', 'tok')
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    render(
      <MemoryRouter>
        <SharedArtifact shareId={SHARE_ID} />
      </MemoryRouter>
    )

    expect(screen.getByRole('link', { name: 'Back to chat' })).toHaveAttribute('href', '/chat')
  })

  it('offers no way into the chat to a visitor without a session', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    render(
      <MemoryRouter>
        <SharedArtifact shareId={SHARE_ID} />
      </MemoryRouter>
    )

    expect(screen.getByText('Soporti')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Back to chat' })).not.toBeInTheDocument()
  })
})
