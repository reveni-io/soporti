import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NewVideoModal from './NewVideoModal.jsx'

const VIDEO = { id: '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601', title: 'Refunds', stage: 'drafting' }
const REPOS = [
  { fullName: 'reveni/app', description: 'Merchant dashboard', language: 'TypeScript' },
  { fullName: 'reveni/api', description: 'Backend', language: 'Python' },
]

function respond(body, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

function mockApi(routes = {}) {
  const all = {
    'GET /api/repos': respond({ repos: REPOS }),
    'POST /api/videos': respond({ video: VIDEO }, 201),
    ...routes,
  }
  global.fetch = vi.fn().mockImplementation((url, options = {}) => {
    const response = all[`${options.method ?? 'GET'} ${url.split('?')[0]}`]
    return Promise.resolve(response ?? respond({}, 404))
  })
}

function createCall() {
  return global.fetch.mock.calls.filter(([url, options]) => url === '/api/videos' && options.method === 'POST')
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('NewVideoModal', () => {
  it('shows inline errors and sends nothing when the brief is incomplete', async () => {
    mockApi()
    const user = userEvent.setup()
    render(<NewVideoModal token="tok" onLogout={vi.fn()} onClose={vi.fn()} onCreated={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Create video' }))

    expect(screen.getByText('Describe what the video should tell.')).toBeInTheDocument()
    expect(screen.getByText('Pick at least one repo.')).toBeInTheDocument()
    expect(createCall()).toHaveLength(0)
  })

  it('clears an inline error as soon as the field is fixed', async () => {
    mockApi()
    const user = userEvent.setup()
    render(<NewVideoModal token="tok" onLogout={vi.fn()} onClose={vi.fn()} onCreated={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Create video' }))
    await user.type(screen.getByRole('textbox', { name: 'What should the video tell?' }), 'Refunds')

    expect(screen.queryByText('Describe what the video should tell.')).toBeNull()
    expect(screen.getByText('Pick at least one repo.')).toBeInTheDocument()
  })

  it('creates the video with the whole brief and hands it back', async () => {
    mockApi()
    const onCreated = vi.fn()
    const user = userEvent.setup()
    render(<NewVideoModal token="tok" onLogout={vi.fn()} onClose={vi.fn()} onCreated={onCreated} />)

    await user.type(screen.getByRole('textbox', { name: 'What should the video tell?' }), '  How refunds work  ')
    await user.click(await screen.findByRole('checkbox', { name: /reveni\/api/ }))
    await user.click(screen.getByRole('checkbox', { name: /reveni\/app/ }))
    await user.type(screen.getByRole('textbox', { name: 'Folder (optional)' }), 'apps/refunds')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Audience' }), 'sales')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'es')
    await user.click(screen.getByRole('radio', { name: '9:16' }))
    await user.click(screen.getByRole('radio', { name: '~60 s' }))
    await user.click(screen.getByRole('radio', { name: 'Fast' }))
    await user.click(screen.getByRole('button', { name: 'Create video' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(onCreated).toHaveBeenCalledWith(VIDEO)
    expect(createCall()).toHaveLength(1)
    expect(JSON.parse(createCall()[0][1].body)).toEqual({
      brief: {
        idea: 'How refunds work',
        repos: ['reveni/api', 'reveni/app'],
        path: 'apps/refunds',
        audience: 'sales',
        language: 'es',
        format: '9:16',
        durationSeconds: 60,
        pace: 'fast',
        attachments: [],
      },
    })
  })

  it('sends the defaults: no folder, relaxed pace, 16:9 and about 30 seconds', async () => {
    mockApi()
    const onCreated = vi.fn()
    const user = userEvent.setup()
    render(<NewVideoModal token="tok" onLogout={vi.fn()} onClose={vi.fn()} onCreated={onCreated} />)

    expect(screen.getByRole('radio', { name: 'Relaxed' })).toBeChecked()
    expect(screen.getByText(/on-screen text stays long enough to read/)).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: 'What should the video tell?' }), 'Refunds')
    await user.click(await screen.findByRole('checkbox', { name: /reveni\/app/ }))
    await user.click(screen.getByRole('button', { name: 'Create video' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(JSON.parse(createCall()[0][1].body).brief).toEqual({
      idea: 'Refunds',
      repos: ['reveni/app'],
      path: null,
      audience: 'merchants',
      language: 'en',
      format: '16:9',
      durationSeconds: 30,
      pace: 'relaxed',
      attachments: [],
    })
  })

  it('offers a 10-second video', async () => {
    mockApi()
    const onCreated = vi.fn()
    const user = userEvent.setup()
    render(<NewVideoModal token="tok" onLogout={vi.fn()} onClose={vi.fn()} onCreated={onCreated} />)

    await user.type(screen.getByRole('textbox', { name: 'What should the video tell?' }), 'Refunds')
    await user.click(await screen.findByRole('checkbox', { name: /reveni\/app/ }))
    await user.click(screen.getByRole('radio', { name: '~10 s' }))
    await user.click(screen.getByRole('button', { name: 'Create video' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(createCall()).toHaveLength(1)
    expect(JSON.parse(createCall()[0][1].body).brief.durationSeconds).toBe(10)
  })

  it('uploads attachments and sends documents as text and images by id', async () => {
    mockApi({
      'POST /api/attachments': respond({ attachment: { name: 'spec.pdf', text: 'Refund rules', truncated: false } }),
    })
    const onCreated = vi.fn()
    const user = userEvent.setup()
    render(<NewVideoModal token="tok" onLogout={vi.fn()} onClose={vi.fn()} onCreated={onCreated} />)

    await user.type(screen.getByRole('textbox', { name: 'What should the video tell?' }), 'Refunds')
    await user.click(await screen.findByRole('checkbox', { name: /reveni\/app/ }))
    await user.upload(
      screen.getByLabelText('Attach files'),
      new File(['%PDF'], 'spec.pdf', { type: 'application/pdf' })
    )
    expect(await screen.findByText('spec.pdf')).toBeInTheDocument()

    mockApi({ 'POST /api/attachments': respond({ attachment: { name: 'logo.png', imageId: 'img-1' } }) })
    await user.upload(screen.getByLabelText('Attach files'), new File(['png'], 'logo.png', { type: 'image/png' }))
    expect(await screen.findByText('logo.png')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Create video' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    const upload = global.fetch.mock.calls.find(([url]) => url.startsWith('/api/attachments?'))
    expect(upload[0]).toBe('/api/attachments?name=logo.png')
    expect(upload[1].headers['Content-Type']).toBe('image/png')
    expect(JSON.parse(createCall()[0][1].body).brief.attachments).toEqual([
      { name: 'spec.pdf', text: 'Refund rules' },
      { name: 'logo.png', imageId: 'img-1' },
    ])
  })

  it('removes an attachment from the brief', async () => {
    mockApi({ 'POST /api/attachments': respond({ attachment: { name: 'logo.png', imageId: 'img-1' } }) })
    const user = userEvent.setup()
    render(<NewVideoModal token="tok" onLogout={vi.fn()} onClose={vi.fn()} onCreated={vi.fn()} />)

    await user.upload(screen.getByLabelText('Attach files'), new File(['png'], 'logo.png', { type: 'image/png' }))
    await user.click(await screen.findByTitle('Remove logo.png'))

    expect(screen.queryByText('logo.png')).toBeNull()
  })

  it('shows the error the server returns', async () => {
    mockApi({ 'POST /api/videos': respond({ error: 'The repo reveni/app is not available.' }, 400) })
    const onCreated = vi.fn()
    const user = userEvent.setup()
    render(<NewVideoModal token="tok" onLogout={vi.fn()} onClose={vi.fn()} onCreated={onCreated} />)

    await user.type(screen.getByRole('textbox', { name: 'What should the video tell?' }), 'Refunds')
    await user.click(await screen.findByRole('checkbox', { name: /reveni\/app/ }))
    await user.click(screen.getByRole('button', { name: 'Create video' }))

    expect(await screen.findByText('The repo reveni/app is not available.')).toBeInTheDocument()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('logs out when the session expired on submit', async () => {
    mockApi({ 'POST /api/videos': respond({}, 401) })
    const onLogout = vi.fn()
    const user = userEvent.setup()
    render(<NewVideoModal token="tok" onLogout={onLogout} onClose={vi.fn()} onCreated={vi.fn()} />)

    await user.type(screen.getByRole('textbox', { name: 'What should the video tell?' }), 'Refunds')
    await user.click(await screen.findByRole('checkbox', { name: /reveni\/app/ }))
    await user.click(screen.getByRole('button', { name: 'Create video' }))

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1))
  })

  it('closes with the close button and with Escape', async () => {
    mockApi()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<NewVideoModal token="tok" onLogout={vi.fn()} onClose={onClose} onCreated={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Close' }))
    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
