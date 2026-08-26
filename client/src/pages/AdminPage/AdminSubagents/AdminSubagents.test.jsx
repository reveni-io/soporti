import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminSubagents from './AdminSubagents.jsx'

const SUBAGENT = {
  id: 9,
  name: 'code_investigator',
  description: 'Owns the codebase.',
  instructions: 'Read the code.',
  provider: 'anthropic',
  model: 'claude-sonnet-5',
  tools: ['search_code'],
  exclusive: true,
  enabled: true,
}

const CONFIG = {
  subagents: [SUBAGENT],
  providers: [
    { id: 'openai', label: 'OpenAI' },
    { id: 'anthropic', label: 'Anthropic' },
  ],
  tools: {
    groups: [{ id: 'repo', label: 'Repositories', configured: true, tools: ['search_code', 'get_file_contents'] }],
  },
  globalProvider: 'openai',
  globalModel: 'gpt-5.2',
}

function ok(body) {
  return { ok: true, status: 200, json: async () => body }
}

function respondWith(...bodies) {
  global.fetch = vi.fn()
  for (const body of bodies) global.fetch.mockResolvedValueOnce(ok(body))
  global.fetch.mockResolvedValue(ok(CONFIG))
}

beforeEach(() => {
  respondWith(CONFIG)
})

describe('AdminSubagents', () => {
  it('lists the stored subagents with the tree above them', async () => {
    render(<AdminSubagents token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('Owns the codebase.')).toBeInTheDocument()
    expect(screen.getByText('Soporti (main agent)')).toBeInTheDocument()
    expect(global.fetch.mock.calls[0][0]).toBe('/api/admin/subagents')
  })

  it('says so when there is no subagent yet', async () => {
    respondWith({ ...CONFIG, subagents: [] })
    render(<AdminSubagents token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('No subagents yet.')).toBeInTheDocument()
  })

  it('renders the error when the subagents cannot be loaded', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'db down' }) })
    render(<AdminSubagents token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('db down')).toBeInTheDocument()
  })

  it('logs out instead of rendering an error on an expired session', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) })
    const onLogout = vi.fn()
    render(<AdminSubagents token="tok" onLogout={onLogout} />)

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1))
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('opens the form for a new subagent', async () => {
    render(<AdminSubagents token="tok" onLogout={vi.fn()} />)

    await userEvent.click(await screen.findByRole('button', { name: '+ New subagent' }))

    expect(screen.getByText('New subagent')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('')
  })

  it('opens the form prefilled for an existing subagent', async () => {
    render(<AdminSubagents token="tok" onLogout={vi.fn()} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))

    expect(screen.getByText('Edit subagent')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('code_investigator')
  })

  it('returns to the list and reloads after a save', async () => {
    render(<AdminSubagents token="tok" onLogout={vi.fn()} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('button', { name: '+ New subagent' })).toBeInTheDocument()
    expect(global.fetch.mock.calls.filter(([url]) => url === '/api/admin/subagents')).toHaveLength(2)
  })

  it('asks for confirmation before deleting', async () => {
    render(<AdminSubagents token="tok" onLogout={vi.fn()} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      const del = global.fetch.mock.calls.find(([, options]) => options?.method === 'DELETE')
      expect(del[0]).toBe('/api/admin/subagents/9')
    })
  })

  it('backs out of a delete without calling the API', async () => {
    render(<AdminSubagents token="tok" onLogout={vi.fn()} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('flips enabled on the row through a full update', async () => {
    render(<AdminSubagents token="tok" onLogout={vi.fn()} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Disable' }))

    await waitFor(() => {
      const put = global.fetch.mock.calls.find(([, options]) => options?.method === 'PUT')
      expect(put[0]).toBe('/api/admin/subagents/9')
      expect(JSON.parse(put[1].body)).toEqual({
        name: 'code_investigator',
        description: 'Owns the codebase.',
        instructions: 'Read the code.',
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        tools: ['search_code'],
        exclusive: true,
        enabled: false,
      })
    })
  })

  it('offers to enable a disabled subagent again', async () => {
    respondWith({ ...CONFIG, subagents: [{ ...SUBAGENT, enabled: false }] })
    render(<AdminSubagents token="tok" onLogout={vi.fn()} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Enable' }))

    await waitFor(() => {
      const put = global.fetch.mock.calls.find(([, options]) => options?.method === 'PUT')
      expect(JSON.parse(put[1].body).enabled).toBe(true)
    })
  })

  it('shows the reason a toggle was refused', async () => {
    global.fetch = vi.fn().mockImplementation((_url, options) => {
      if (options?.method === 'PUT') {
        return Promise.resolve({
          ok: false,
          status: 422,
          json: async () => ({ error: 'You can have at most 8 enabled subagents. Disable one first.' }),
        })
      }
      return Promise.resolve(ok({ ...CONFIG, subagents: [{ ...SUBAGENT, enabled: false }] }))
    })
    render(<AdminSubagents token="tok" onLogout={vi.fn()} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Enable' }))

    expect(await screen.findByText('You can have at most 8 enabled subagents. Disable one first.')).toBeInTheDocument()
  })
})
