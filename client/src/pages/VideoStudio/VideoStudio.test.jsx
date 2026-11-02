import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import VideoStudio from './VideoStudio.jsx'
import { storyboardVideoFixture } from './__fixtures__/video.js'

const VIDEO_ID = storyboardVideoFixture.id
const VIDEO_URL = `/api/videos/${VIDEO_ID}`
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

function callsTo(method, url) {
  return global.fetch.mock.calls.filter(([calledUrl, options = {}]) => {
    return calledUrl === url && (options.method ?? 'GET') === method
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('VideoStudio', () => {
  it('shows the conversation and the storyboard side by side', async () => {
    mockApi({ [`GET ${VIDEO_URL}`]: respond({ video: storyboardVideoFixture }) })

    render(
      <MemoryRouter>
        <VideoStudio id={VIDEO_ID} />
      </MemoryRouter>
    )

    expect(screen.getByText('Loading the video…')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: 'Liquid email templates' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Conversation' })).toHaveTextContent('Explain Liquid templates')
    expect(screen.getByRole('region', { name: 'Storyboard' })).toHaveTextContent('Emails that sound like you')
  })

  it('shows the drafting state while the first storyboard is written', async () => {
    const drafting = { ...storyboardVideoFixture, status: 'drafting', stage: 'drafting', storyboard: null }
    mockApi({ [`GET ${VIDEO_URL}`]: respond({ video: drafting }) })

    render(
      <MemoryRouter>
        <VideoStudio id={VIDEO_ID} />
      </MemoryRouter>
    )

    expect(await screen.findByText('Reading the repos and drafting scenes…')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeDisabled()
  })

  it('shows the production placeholder once a version exists', async () => {
    const production = {
      ...storyboardVideoFixture,
      status: 'queued',
      stage: 'production',
      versions: [{ version: 1, status: 'queued', phase: null, progress: null }],
      queuePosition: 2,
    }
    mockApi({ [`GET ${VIDEO_URL}`]: respond({ video: production }) })

    render(
      <MemoryRouter>
        <VideoStudio id={VIDEO_ID} />
      </MemoryRouter>
    )

    expect(await screen.findByText('Position 2 in the queue.')).toBeInTheDocument()
    expect(screen.getByText('Queued')).toBeInTheDocument()
  })

  it('sends a message and shows the storyboard being revised', async () => {
    const user = userEvent.setup()
    const revising = {
      ...storyboardVideoFixture,
      status: 'drafting',
      stage: 'drafting',
      messages: [
        ...storyboardVideoFixture.messages,
        { id: 3, role: 'user', content: 'Make the intro shorter', version: null, createdAt: '2026-10-30T10:02:00Z' },
      ],
    }
    mockApi({
      [`GET ${VIDEO_URL}`]: respond({ video: storyboardVideoFixture }),
      [`POST ${VIDEO_URL}/messages`]: respond({ video: revising }, 202),
    })
    render(
      <MemoryRouter>
        <VideoStudio id={VIDEO_ID} />
      </MemoryRouter>
    )

    await user.type(await screen.findByRole('textbox', { name: 'Message' }), 'Make the intro shorter')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByText('Make the intro shorter')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('')
    expect(JSON.parse(callsTo('POST', `${VIDEO_URL}/messages`)[0][1].body)).toEqual({ text: 'Make the intro shorter' })
  })

  it('asks for generation and shows why the server refused it', async () => {
    const user = userEvent.setup()
    mockApi({
      [`GET ${VIDEO_URL}`]: respond({ video: storyboardVideoFixture }),
      [`POST ${VIDEO_URL}/generate`]: respond({ error: 'Video generation is not available yet.' }, 409),
    })
    render(
      <MemoryRouter>
        <VideoStudio id={VIDEO_ID} />
      </MemoryRouter>
    )

    await user.click(await screen.findByRole('button', { name: 'Generate video' }))

    expect(await screen.findByText('Video generation is not available yet.')).toBeInTheDocument()
    expect(callsTo('POST', `${VIDEO_URL}/generate`)).toHaveLength(1)
  })

  it('switches to production when generation starts', async () => {
    const user = userEvent.setup()
    const production = {
      ...storyboardVideoFixture,
      status: 'ready',
      stage: 'production',
      versions: [{ version: 1, status: 'ready', phase: null, progress: null }],
    }
    mockApi({
      [`GET ${VIDEO_URL}`]: respond({ video: storyboardVideoFixture }),
      [`POST ${VIDEO_URL}/generate`]: respond({ video: production }, 202),
    })
    render(
      <MemoryRouter>
        <VideoStudio id={VIDEO_ID} />
      </MemoryRouter>
    )

    await user.click(await screen.findByRole('button', { name: 'Generate video' }))

    expect(await screen.findByRole('heading', { name: 'Version 1' })).toBeInTheDocument()
  })

  it('drafts the storyboard again after a failure', async () => {
    const user = userEvent.setup()
    const failed = { ...storyboardVideoFixture, storyboard: null, storyboardError: 'The storyboard agent timed out.' }
    const redrafting = { ...failed, status: 'drafting', stage: 'drafting', storyboardError: null }
    mockApi({
      [`GET ${VIDEO_URL}`]: respond({ video: failed }),
      [`POST ${VIDEO_URL}/storyboard`]: respond({ video: redrafting }, 202),
    })
    render(
      <MemoryRouter>
        <VideoStudio id={VIDEO_ID} />
      </MemoryRouter>
    )

    await user.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Reading the repos and drafting scenes…')).toBeInTheDocument()
    expect(screen.queryByText('The storyboard agent timed out.')).toBeNull()
    expect(callsTo('POST', `${VIDEO_URL}/storyboard`)).toHaveLength(1)
  })

  it('deletes the video after confirming and goes back to the list', async () => {
    const user = userEvent.setup()
    mockApi({
      [`GET ${VIDEO_URL}`]: respond({ video: storyboardVideoFixture }),
      [`DELETE ${VIDEO_URL}`]: { ok: true, status: 204 },
    })
    render(
      <MemoryRouter initialEntries={[`/videos/${VIDEO_ID}`]}>
        <Routes>
          <Route path="/videos/:id" element={<VideoStudio id={VIDEO_ID} />} />
          <Route path="/videos" element={<p>Videos list</p>} />
        </Routes>
      </MemoryRouter>
    )

    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(await screen.findByText('Videos list')).toBeInTheDocument()
    expect(callsTo('DELETE', VIDEO_URL)).toHaveLength(1)
  })

  it('shows the error with a way back when the video cannot be loaded', async () => {
    mockApi({ [`GET ${VIDEO_URL}`]: respond({ error: 'Video not found.' }, 404) })

    render(
      <MemoryRouter>
        <VideoStudio id={VIDEO_ID} />
      </MemoryRouter>
    )

    expect(await screen.findByText('Video not found.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to videos' })).toHaveAttribute('href', '/videos')
  })

  it('logs out when the session expired', async () => {
    mockApi({ [`GET ${VIDEO_URL}`]: respond({}, 401) })

    render(
      <MemoryRouter>
        <VideoStudio id={VIDEO_ID} />
      </MemoryRouter>
    )

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1))
  })

  it('logs out when an action hits an expired session', async () => {
    const user = userEvent.setup()
    mockApi({
      [`GET ${VIDEO_URL}`]: respond({ video: storyboardVideoFixture }),
      [`POST ${VIDEO_URL}/generate`]: respond({}, 401),
    })
    render(
      <MemoryRouter>
        <VideoStudio id={VIDEO_ID} />
      </MemoryRouter>
    )

    await user.click(await screen.findByRole('button', { name: 'Generate video' }))

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1))
  })
})
