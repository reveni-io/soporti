import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ArtifactsModal from './ArtifactsModal.jsx'

const ARTIFACT_ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601'

const ARTIFACTS = [
  {
    id: ARTIFACT_ID,
    identifier: 'refund-dashboard',
    title: 'Refund dashboard',
    latestVersion: 3,
    versionCount: 3,
    updatedAt: '2026-08-20T10:00:00Z',
  },
  {
    id: '7c8d9e0f-1a2b-4c3d-8e4f-5a6b7c8d9e02',
    identifier: 'order-explorer',
    title: 'Order explorer',
    latestVersion: 1,
    versionCount: 1,
    updatedAt: '2026-08-19T10:00:00Z',
  },
]

function mockList(artifacts = ARTIFACTS) {
  return vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ artifacts }) })
}

function renderModal(props = {}) {
  return render(
    <MemoryRouter>
      <ArtifactsModal
        token="tok"
        onClose={props.onClose ?? vi.fn()}
        onLogout={props.onLogout ?? vi.fn()}
        onDeleted={props.onDeleted ?? vi.fn()}
      />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('ArtifactsModal', () => {
  it('lists the artifacts with their version count', async () => {
    global.fetch = mockList()

    renderModal()

    await waitFor(() => expect(screen.getByText('Refund dashboard')).toBeInTheDocument())
    expect(screen.getByText(/^3 versions ·/)).toBeInTheDocument()
    expect(screen.getByText(/^1 version ·/)).toBeInTheDocument()
  })

  it('links each artifact to its own page', async () => {
    global.fetch = mockList()

    renderModal()

    await waitFor(() => expect(screen.getAllByRole('link', { name: 'Open' })).toHaveLength(2))
    expect(screen.getAllByRole('link', { name: 'Open' })[0]).toHaveAttribute('href', `/artifacts/${ARTIFACT_ID}`)
  })

  it('says so when there are none', async () => {
    global.fetch = mockList([])

    renderModal()

    await waitFor(() => expect(screen.getByText('No artifacts yet.')).toBeInTheDocument())
  })

  it('closes from the header X and from the footer button', async () => {
    global.fetch = mockList()
    const onClose = vi.fn()

    renderModal({ onClose })

    const closeButtons = screen.getAllByRole('button', { name: 'Close' })
    expect(closeButtons).toHaveLength(2)
    await userEvent.click(closeButtons[0])
    await userEvent.click(closeButtons[1])

    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('asks for confirmation before deleting', async () => {
    global.fetch = mockList()

    renderModal()

    await waitFor(() => expect(screen.getByText('Refund dashboard')).toBeInTheDocument())
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0])

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
    expect(global.fetch.mock.calls.every(([, options]) => options?.method !== 'DELETE')).toBe(true)
  })

  it('deletes the artifact once confirmed and reloads the list', async () => {
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (options?.method === 'DELETE') return Promise.resolve({ ok: true, status: 204, json: async () => ({}) })
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ artifacts: ARTIFACTS }) })
    })

    renderModal()

    await waitFor(() => expect(screen.getByText('Refund dashboard')).toBeInTheDocument())
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      const deleteCall = global.fetch.mock.calls.find(([, options]) => options?.method === 'DELETE')
      expect(deleteCall[0]).toContain(`/api/artifacts/${ARTIFACT_ID}`)
    })
  })

  it('reports the deleted artifact so an open panel can close itself', async () => {
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (options?.method === 'DELETE') return Promise.resolve({ ok: true, status: 204, json: async () => ({}) })
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ artifacts: ARTIFACTS }) })
    })
    const onDeleted = vi.fn()

    renderModal({ onDeleted })

    await waitFor(() => expect(screen.getByText('Refund dashboard')).toBeInTheDocument())
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(ARTIFACT_ID))
  })

  it('cancels a pending delete without calling the API', async () => {
    global.fetch = mockList()

    renderModal()

    await waitFor(() => expect(screen.getByText('Refund dashboard')).toBeInTheDocument())
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(2)
    expect(global.fetch.mock.calls.every(([, options]) => options?.method !== 'DELETE')).toBe(true)
  })

  it('shares an artifact and shows the link', async () => {
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ shareId: 'abc', version: 3, url: '/a/abc' }),
        })
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ artifacts: ARTIFACTS }) })
    })

    renderModal()

    await waitFor(() => expect(screen.getByText('Refund dashboard')).toBeInTheDocument())
    await userEvent.click(screen.getAllByRole('button', { name: 'Share' })[0])

    await waitFor(() => expect(screen.getByText('Share artifact')).toBeInTheDocument())
    expect(screen.getByDisplayValue(/\/a\/abc$/)).toBeInTheDocument()

    const shareCall = global.fetch.mock.calls.find(([, options]) => options?.method === 'POST')
    expect(JSON.parse(shareCall[1].body)).toEqual({ version: null })
  })

  it('logs the user out on a 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    const onLogout = vi.fn()

    renderModal({ onLogout })

    await waitFor(() => expect(onLogout).toHaveBeenCalled())
  })

  it('surfaces a load failure', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'Failed to load your artifacts.' }) })

    renderModal()

    await waitFor(() => expect(screen.getByText('Failed to load your artifacts.')).toBeInTheDocument())
  })
})
