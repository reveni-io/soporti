import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Videos from './Videos.jsx'

const VIDEO_ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601'
const logout = vi.fn()

vi.mock('../../hooks/useAuth/useAuth.js', () => ({
  useAuth: () => ({ token: 'tok', logout }),
}))

function respond(body, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

function mockApi(routes) {
  global.fetch = vi.fn().mockImplementation((url, options = {}) => {
    const response = routes[`${options.method ?? 'GET'} ${url}`]
    return Promise.resolve(response ?? respond({}, 404))
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Videos', () => {
  it('lists the videos with their format, status and date', async () => {
    mockApi({
      'GET /api/videos': respond({
        videos: [
          {
            id: VIDEO_ID,
            title: 'Liquid email templates',
            status: 'running',
            phase: 'rendering',
            progress: 40,
            format: '9:16',
            durationSeconds: 30,
            latestVersion: 1,
            thumbnailVersion: null,
            updatedAt: '2026-10-30T10:00:00.000Z',
          },
        ],
      }),
    })

    render(
      <MemoryRouter>
        <Videos />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: 'Videos' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /chat/i })).toHaveAttribute('href', '/chat')
    expect(await screen.findByRole('heading', { name: 'Liquid email templates' })).toBeInTheDocument()
    expect(screen.getByText('9:16 · ~30s')).toBeInTheDocument()
    expect(screen.getByText('Generating · Rendering · 40%')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /liquid email templates/i })).toHaveAttribute('href', `/videos/${VIDEO_ID}`)
  })

  it('shows the empty state when there are no videos', async () => {
    mockApi({ 'GET /api/videos': respond({ videos: [] }) })

    render(
      <MemoryRouter>
        <Videos />
      </MemoryRouter>
    )

    expect(await screen.findByText(/no videos yet/i)).toBeInTheDocument()
  })

  it('shows the error when the list cannot be loaded', async () => {
    mockApi({ 'GET /api/videos': respond({ error: 'Videos are unavailable.' }, 500) })

    render(
      <MemoryRouter>
        <Videos />
      </MemoryRouter>
    )

    expect(await screen.findByText('Videos are unavailable.')).toBeInTheDocument()
  })

  it('logs out when the session expired', async () => {
    mockApi({ 'GET /api/videos': respond({}, 401) })

    render(
      <MemoryRouter>
        <Videos />
      </MemoryRouter>
    )

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1))
  })

  it('opens the brief and closes it again', async () => {
    const user = userEvent.setup()
    mockApi({ 'GET /api/videos': respond({ videos: [] }), 'GET /api/repos': respond({ repos: [] }) })

    render(
      <MemoryRouter>
        <Videos />
      </MemoryRouter>
    )
    await user.click(screen.getByRole('button', { name: 'New video' }))
    expect(screen.getByRole('heading', { name: 'New video' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('heading', { name: 'New video' })).toBeNull()
  })

  it('opens the studio of the video it creates', async () => {
    const user = userEvent.setup()
    mockApi({
      'GET /api/videos': respond({ videos: [] }),
      'GET /api/repos': respond({ repos: [{ fullName: 'reveni/app' }] }),
      'POST /api/videos': respond({ video: { id: VIDEO_ID, title: 'Refunds', stage: 'drafting' } }, 201),
    })

    render(
      <MemoryRouter initialEntries={['/videos']}>
        <Routes>
          <Route path="/videos" element={<Videos />} />
          <Route path="/videos/:id" element={<p>Studio page</p>} />
        </Routes>
      </MemoryRouter>
    )
    await user.click(screen.getByRole('button', { name: 'New video' }))
    await user.type(screen.getByRole('textbox', { name: 'What should the video tell?' }), 'How refunds work')
    await user.click(await screen.findByRole('checkbox', { name: 'reveni/app' }))
    await user.click(screen.getByRole('button', { name: 'Create video' }))

    expect(await screen.findByText('Studio page')).toBeInTheDocument()
  })
})
