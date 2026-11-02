import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import VideoStudio from './VideoStudio.jsx'
import { readyVersionFixture, storyboardVideoFixture } from './__fixtures__/video.js'

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

function respondBlob(content) {
  return { ok: true, status: 200, blob: async () => new Blob([content]) }
}

function productionVideo(versions, overrides = {}) {
  return {
    ...storyboardVideoFixture,
    status: versions[0].status,
    stage: 'production',
    versions,
    ...overrides,
  }
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
      status: 'queued',
      stage: 'production',
      versions: [{ ...readyVersionFixture, status: 'queued', previewReady: false, hasVideo: false }],
      queuePosition: 1,
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

    expect(
      await screen.findByText('Another video is being generated. Yours starts in about 15 min.')
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Video' })).toBeInTheDocument()
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

describe('VideoStudio in production', () => {
  const VERSION_URL = `${VIDEO_URL}/versions`
  const BUNDLE = '<!doctype html><html><body><div id="stage"></div></body></html>'

  beforeEach(() => {
    let created = 0
    URL.createObjectURL = vi.fn(() => {
      created += 1
      return `blob:file-${created}`
    })
    URL.revokeObjectURL = vi.fn()
  })

  it('shows the wait in the queue and cancels it', async () => {
    const user = userEvent.setup()
    const queued = { ...readyVersionFixture, status: 'queued', previewReady: false, hasVideo: false }
    const cancelled = { ...queued, status: 'cancelled' }
    mockApi({
      [`GET ${VIDEO_URL}`]: respond({ video: productionVideo([queued], { queuePosition: 2 }) }),
      [`POST ${VIDEO_URL}/cancel`]: respond({ video: productionVideo([cancelled]) }),
    })
    render(
      <MemoryRouter>
        <VideoStudio id={VIDEO_ID} />
      </MemoryRouter>
    )

    expect(
      await screen.findByText('Another video is being generated. Yours starts in about 30 min.')
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(await screen.findByText('This version was cancelled.')).toBeInTheDocument()
    expect(callsTo('POST', `${VIDEO_URL}/cancel`)).toHaveLength(1)
  })

  it('follows the generation with the steps, the contact sheets and the notes', async () => {
    const running = {
      ...readyVersionFixture,
      status: 'running',
      phase: 'composing',
      progress: 35,
      step: 'Checking the reading time of every caption',
      events: [{ at: '2026-10-30T10:12:00Z', text: 'Wrote the scenes of the intro' }],
      frames: [{ id: 11, times: [0, 3, 6], createdAt: '2026-10-30T10:13:00Z' }],
      previewReady: false,
      hasVideo: false,
    }
    mockApi({
      [`GET ${VIDEO_URL}`]: respond({ video: productionVideo([running]) }),
      [`GET ${VIDEO_URL}/frames/11`]: respondBlob('png'),
    })
    render(
      <MemoryRouter>
        <VideoStudio id={VIDEO_ID} />
      </MemoryRouter>
    )

    const steps = await screen.findByRole('list', { name: 'Generation steps' })
    expect(within(steps).getByText('Composing')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText('Checking the reading time of every caption')).toBeInTheDocument()
    expect(screen.getByText('Wrote the scenes of the intro')).toBeInTheDocument()
    expect(await screen.findByAltText('Contact sheet of 0:00–0:06 · 3 frames')).toHaveAttribute('src', 'blob:file-1')
    expect(
      screen.getByText('You can close this page: Soporti messages you on Slack when it is ready.')
    ).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeDisabled()
    expect(callsTo('GET', `${VERSION_URL}/1/preview`)).toHaveLength(0)
  })

  it('plays the live preview while the MP4 renders', async () => {
    const rendering = {
      ...readyVersionFixture,
      status: 'running',
      phase: 'rendering',
      progress: 60,
      etaSeconds: 120,
      hasVideo: false,
    }
    mockApi({
      [`GET ${VIDEO_URL}`]: respond({ video: productionVideo([rendering]) }),
      [`GET ${VERSION_URL}/1/preview`]: respond({ html: BUNDLE }),
    })
    render(
      <MemoryRouter>
        <VideoStudio id={VIDEO_ID} />
      </MemoryRouter>
    )

    const frame = await screen.findByTitle('Live preview of version 1')
    expect(frame).toHaveAttribute('sandbox', 'allow-scripts')
    expect(frame).toHaveAttribute('srcdoc', BUNDLE)
    expect(screen.getByRole('progressbar', { name: 'Render progress' })).toHaveAttribute('aria-valuenow', '60')
    expect(screen.getByText('Rendering the MP4 · 60% · About 2 min left')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download MP4' })).toBeDisabled()
    expect(screen.getByText('Sending a change stops the current render and starts a new version.')).toBeInTheDocument()
  })

  it('plays the MP4 fetched with the token and offers it as a download', async () => {
    mockApi({
      [`GET ${VIDEO_URL}`]: respond({ video: productionVideo([readyVersionFixture]) }),
      [`GET ${VERSION_URL}/1/video`]: respondBlob('mp4'),
    })
    const { unmount } = render(
      <MemoryRouter>
        <VideoStudio id={VIDEO_ID} />
      </MemoryRouter>
    )

    expect(await screen.findByLabelText('Version 1')).toHaveAttribute('src', 'blob:file-1')
    expect(screen.getByRole('link', { name: 'Download MP4' })).toHaveAttribute('href', 'blob:file-1')
    expect(screen.getByRole('link', { name: 'Download MP4' })).toHaveAttribute(
      'download',
      'liquid-email-templates-v1.mp4'
    )
    expect(callsTo('GET', `${VERSION_URL}/1/video`)[0][1].headers.Authorization).toBe('Bearer tok')
    expect(screen.queryByRole('tablist')).toBeNull()

    unmount()

    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:file-1')
  })

  it('switches versions, revoking the previous MP4, and renders an old version again', async () => {
    const user = userEvent.setup()
    const latest = { ...readyVersionFixture, version: 3 }
    const second = { ...readyVersionFixture, version: 2 }
    const first = { ...readyVersionFixture, hasVideo: false }
    const rerendering = { ...first, kind: 'render', status: 'queued' }
    mockApi({
      [`GET ${VIDEO_URL}`]: respond({ video: productionVideo([latest, second, first]) }),
      [`GET ${VERSION_URL}/3/video`]: respondBlob('v3'),
      [`GET ${VERSION_URL}/2/video`]: respondBlob('v2'),
      [`GET ${VERSION_URL}/1/preview`]: respond({ html: BUNDLE }),
      [`POST ${VERSION_URL}/1/render`]: respond({ video: productionVideo([latest, second, rerendering]) }, 202),
    })
    render(
      <MemoryRouter>
        <VideoStudio id={VIDEO_ID} />
      </MemoryRouter>
    )

    expect(await screen.findByLabelText('Version 3')).toHaveAttribute('src', 'blob:file-1')
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['v1', 'v2', 'v3'])
    expect(screen.getByRole('tab', { name: 'v3' })).toHaveAttribute('aria-selected', 'true')

    await user.click(screen.getByRole('tab', { name: 'v2' }))
    expect(await screen.findByLabelText('Version 2')).toHaveAttribute('src', 'blob:file-2')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:file-1')

    await user.click(screen.getByRole('tab', { name: 'v1' }))
    expect(await screen.findByTitle('Live preview of version 1')).toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:file-2')
    await user.click(screen.getByRole('button', { name: 'Render this version' }))

    expect(callsTo('POST', `${VERSION_URL}/1/render`)).toHaveLength(1)
    expect(
      await screen.findByText('This version is queued: it renders once the videos ahead of it are done.')
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  })

  it('copies a public link to the version', async () => {
    const user = userEvent.setup()
    mockApi({
      [`GET ${VIDEO_URL}`]: respond({ video: productionVideo([readyVersionFixture]) }),
      [`GET ${VERSION_URL}/1/video`]: respondBlob('mp4'),
      [`POST ${VERSION_URL}/1/share`]: respond({ url: '/api/share/videos/abc123' }),
    })
    render(
      <MemoryRouter>
        <VideoStudio id={VIDEO_ID} />
      </MemoryRouter>
    )

    await user.click(await screen.findByRole('button', { name: 'Copy link' }))

    expect(await screen.findByDisplayValue(`${window.location.origin}/api/share/videos/abc123`)).toBeInTheDocument()
    expect(callsTo('POST', `${VERSION_URL}/1/share`)).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByDisplayValue(`${window.location.origin}/api/share/videos/abc123`)).toBeNull()
  })

  it('creates a variant with the requested change and opens it', async () => {
    const user = userEvent.setup()
    const variantId = 'b1c2d3e4-5f60-4a71-8b92-c3d4e5f60718'
    mockApi({
      [`GET ${VIDEO_URL}`]: respond({ video: productionVideo([readyVersionFixture]) }),
      [`GET ${VERSION_URL}/1/video`]: respondBlob('mp4'),
      [`POST ${VIDEO_URL}/variants`]: respond({ video: { ...storyboardVideoFixture, id: variantId } }, 201),
    })
    render(
      <MemoryRouter initialEntries={[`/videos/${VIDEO_ID}`]}>
        <Routes>
          <Route path={`/videos/${VIDEO_ID}`} element={<VideoStudio id={VIDEO_ID} />} />
          <Route path={`/videos/${variantId}`} element={<p>Variant studio</p>} />
        </Routes>
      </MemoryRouter>
    )

    await user.click(await screen.findByRole('button', { name: 'Create variant' }))
    const dialog = screen.getByRole('dialog', { name: 'Create a variant' })
    await user.type(within(dialog).getByRole('textbox', { name: 'What should change?' }), 'Brand it for Acme')
    await user.click(within(dialog).getByRole('button', { name: 'Create variant' }))

    expect(await screen.findByText('Variant studio')).toBeInTheDocument()
    expect(JSON.parse(callsTo('POST', `${VIDEO_URL}/variants`)[0][1].body)).toEqual({ request: 'Brand it for Acme' })
  })

  it('shows why a version failed and retries it', async () => {
    const user = userEvent.setup()
    const failed = {
      ...readyVersionFixture,
      status: 'failed',
      error: 'The page failed to boot.',
      previewReady: false,
      hasVideo: false,
    }
    const retried = { ...failed, status: 'queued', error: null }
    mockApi({
      [`GET ${VIDEO_URL}`]: respond({ video: productionVideo([failed]) }),
      [`POST ${VERSION_URL}/1/retry`]: respond({ video: productionVideo([retried], { queuePosition: 1 }) }, 202),
    })
    render(
      <MemoryRouter>
        <VideoStudio id={VIDEO_ID} />
      </MemoryRouter>
    )

    expect(await screen.findByText('The page failed to boot.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(
      await screen.findByText('Another video is being generated. Yours starts in about 15 min.')
    ).toBeInTheDocument()
    expect(callsTo('POST', `${VERSION_URL}/1/retry`)).toHaveLength(1)
  })

  it('keeps polling an older version rendering again under a ready latest one until its MP4 is ready', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const latest = { ...readyVersionFixture, version: 2 }
    const first = { ...readyVersionFixture, hasVideo: false }
    const rendering = { ...first, kind: 'render', status: 'running', phase: 'rendering', progress: 40 }
    const routes = {
      [`GET ${VIDEO_URL}`]: respond({ video: productionVideo([latest, first]) }),
      [`GET ${VERSION_URL}/2/video`]: respondBlob('v2'),
      [`GET ${VERSION_URL}/1/preview`]: respond({ html: BUNDLE }),
      [`GET ${VERSION_URL}/1/video`]: respondBlob('v1'),
      [`POST ${VERSION_URL}/1/render`]: respond({ video: productionVideo([latest, rendering]) }, 202),
    }
    mockApi(routes)
    render(
      <MemoryRouter>
        <VideoStudio id={VIDEO_ID} />
      </MemoryRouter>
    )

    await user.click(await screen.findByRole('tab', { name: 'v1' }))
    await user.click(await screen.findByRole('button', { name: 'Render this version' }))
    expect(await screen.findByText('Rendering the MP4 · 40%')).toBeInTheDocument()

    routes[`GET ${VIDEO_URL}`] = respond({
      video: productionVideo([latest, { ...first, kind: 'render', hasVideo: true }]),
    })
    await vi.advanceTimersByTimeAsync(2000)

    expect(await screen.findByLabelText('Version 1')).toHaveAttribute('src', expect.stringMatching(/^blob:/))
    expect(callsTo('GET', `${VERSION_URL}/1/video`)).toHaveLength(1)
    vi.useRealTimers()
  })

  it('polls the video and shows the preview once it is ready', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const composing = {
      ...readyVersionFixture,
      status: 'running',
      phase: 'composing',
      previewReady: false,
      hasVideo: false,
    }
    const rendering = { ...composing, phase: 'rendering', progress: 5, previewReady: true }
    const routes = {
      [`GET ${VIDEO_URL}`]: respond({ video: productionVideo([composing]) }),
      [`GET ${VERSION_URL}/1/preview`]: respond({ html: BUNDLE }),
    }
    mockApi(routes)
    render(
      <MemoryRouter>
        <VideoStudio id={VIDEO_ID} />
      </MemoryRouter>
    )
    expect(await screen.findByText('The frames Soporti reviews appear here as it composes.')).toBeInTheDocument()

    routes[`GET ${VIDEO_URL}`] = respond({ video: productionVideo([rendering]) })
    await vi.advanceTimersByTimeAsync(2000)

    expect(await screen.findByTitle('Live preview of version 1')).toBeInTheDocument()
    expect(callsTo('GET', VIDEO_URL)).toHaveLength(2)
    vi.useRealTimers()
  })
})
