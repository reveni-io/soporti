import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ArtifactView from './ArtifactView.jsx'

const ARTIFACT_ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601'

const ARTIFACT = {
  id: ARTIFACT_ID,
  identifier: 'refund-dashboard',
  title: 'Refund dashboard',
  latestVersion: 2,
  versions: [1, 2],
}

vi.mock('../../hooks/useAuth/useAuth.js', () => ({
  useAuth: () => ({
    token: 'tok',
    isAuthenticated: true,
    loginWithGoogle: vi.fn(),
    loginWithPassword: vi.fn(),
    logout: vi.fn(),
    error: null,
    isLoggingIn: false,
  }),
}))

vi.mock('../../hooks/useAuthMethods/useAuthMethods.js', () => ({
  useAuthMethods: () => ({ google: true, password: true }),
}))

beforeEach(() => {
  vi.restoreAllMocks()
})

function mockFetch(html = '<h1>Refunds</h1>', version = 2) {
  return vi.fn().mockImplementation((url, options) => {
    if (options?.method === 'DELETE') {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ latestVersion: 1 }) })
    }
    if (options?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ shareId: 'abc', version, url: '/a/abc' }),
      })
    }
    if (url.includes('/html')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ version, html }) })
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ artifact: ARTIFACT }) })
  })
}

describe('ArtifactView', () => {
  it('renders the artifact on its own page', async () => {
    global.fetch = mockFetch()

    render(
      <MemoryRouter>
        <ArtifactView id={ARTIFACT_ID} />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByTitle('Refund dashboard')).toBeInTheDocument())
    expect(screen.getByTitle('Refund dashboard').getAttribute('srcdoc')).toContain('<h1>Refunds</h1>')
    expect(screen.getByRole('heading', { name: 'Refund dashboard' })).toBeInTheDocument()
  })

  it('switches version from the header', async () => {
    global.fetch = mockFetch()

    render(
      <MemoryRouter>
        <ArtifactView id={ARTIFACT_ID} />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByLabelText('Artifact version')).toBeInTheDocument())
    await userEvent.selectOptions(screen.getByLabelText('Artifact version'), '1')

    await waitFor(() => expect(global.fetch.mock.calls.some(([url]) => url.includes('version=1'))).toBe(true))
  })

  it('shares the version currently on screen', async () => {
    global.fetch = mockFetch()

    render(
      <MemoryRouter>
        <ArtifactView id={ARTIFACT_ID} />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))

    await waitFor(() => expect(screen.getByText('Share artifact')).toBeInTheDocument())
    const shareCall = global.fetch.mock.calls.find(([, options]) => options?.method === 'POST')
    expect(shareCall[0]).toContain(`/api/artifacts/${ARTIFACT_ID}/share`)
    expect(JSON.parse(shareCall[1].body)).toEqual({ version: 2 })
  })

  it('shares the version the user picked rather than the latest', async () => {
    global.fetch = mockFetch()

    render(
      <MemoryRouter>
        <ArtifactView id={ARTIFACT_ID} />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByLabelText('Artifact version')).toBeInTheDocument())
    await userEvent.selectOptions(screen.getByLabelText('Artifact version'), '1')
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))

    await waitFor(() => {
      const shareCall = global.fetch.mock.calls.find(([, options]) => options?.method === 'POST')
      expect(JSON.parse(shareCall[1].body)).toEqual({ version: 1 })
    })
  })

  it('exports the version on screen as a pdf through the frame', async () => {
    global.fetch = mockFetch()

    render(
      <MemoryRouter>
        <ArtifactView id={ARTIFACT_ID} />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByRole('button', { name: 'Export as PDF' })).toBeEnabled())
    const frame = screen.getByTitle('Refund dashboard')
    const postMessage = vi.spyOn(frame.contentWindow, 'postMessage')

    await userEvent.click(screen.getByRole('button', { name: 'Export as PDF' }))

    expect(postMessage).toHaveBeenCalledWith({ type: 'artifact_print' }, '*')
  })

  it('deletes the version on screen only after an explicit confirmation', async () => {
    global.fetch = mockFetch()

    render(
      <MemoryRouter>
        <ArtifactView id={ARTIFACT_ID} />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete this version' })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Delete this version' }))

    expect(global.fetch.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      const deleteCall = global.fetch.mock.calls.find(([, options]) => options?.method === 'DELETE')
      expect(deleteCall[0]).toContain(`/api/artifacts/${ARTIFACT_ID}/versions/2`)
    })
  })

  it('keeps the version when the confirmation is cancelled', async () => {
    global.fetch = mockFetch()

    render(
      <MemoryRouter>
        <ArtifactView id={ARTIFACT_ID} />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete this version' })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Delete this version' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(global.fetch.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false)
    expect(screen.getByRole('button', { name: 'Delete this version' })).toBeInTheDocument()
  })

  it('cannot share before the artifact loads', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    render(
      <MemoryRouter>
        <ArtifactView id={ARTIFACT_ID} />
      </MemoryRouter>
    )

    expect(screen.getByRole('button', { name: 'Share' })).toBeDisabled()
    expect(screen.getByText('Loading artifact...')).toBeInTheDocument()
  })

  it('draws the grid backdrop behind the artifact', async () => {
    global.fetch = mockFetch()

    const { container } = render(
      <MemoryRouter>
        <ArtifactView id={ARTIFACT_ID} />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByTitle('Refund dashboard')).toBeInTheDocument())
    expect(container.querySelector('canvas.grid-pattern')).toBeInTheDocument()
  })

  it('links back to the chat', async () => {
    global.fetch = mockFetch()

    render(
      <MemoryRouter>
        <ArtifactView id={ARTIFACT_ID} />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByRole('link', { name: 'Soporti' })).toHaveAttribute('href', '/chat'))
  })

  it('shows the error instead of an empty frame', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'Artifact not found.' }) })

    render(
      <MemoryRouter>
        <ArtifactView id={ARTIFACT_ID} />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('Artifact not found.')).toBeInTheDocument())
    expect(screen.queryByTitle('Refund dashboard')).not.toBeInTheDocument()
  })

  it('surfaces a share failure without losing the artifact', async () => {
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (options?.method === 'POST') {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'Failed to share.' }) })
      }
      if (url.includes('/html')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ version: 2, html: '<h1>Refunds</h1>' }) })
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ artifact: ARTIFACT }) })
    })

    render(
      <MemoryRouter>
        <ArtifactView id={ARTIFACT_ID} />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))

    await waitFor(() => expect(screen.getByText('Failed to share.')).toBeInTheDocument())
    expect(screen.getByTitle('Refund dashboard')).toBeInTheDocument()
  })
})
