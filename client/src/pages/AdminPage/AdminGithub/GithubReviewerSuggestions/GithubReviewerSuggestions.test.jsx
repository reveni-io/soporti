import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GithubReviewerSuggestions from './GithubReviewerSuggestions.jsx'

const OFF = { enabled: false, newcomers: [] }

function renderSection({ settings = OFF, onSaved = vi.fn(), onLogout = vi.fn() } = {}) {
  render(<GithubReviewerSuggestions settings={settings} token="tok" onLogout={onLogout} onSaved={onSaved} />)
  return { onSaved, onLogout }
}

function respond(status, body) {
  return { ok: status < 400, status, json: async () => body }
}

function switchInput() {
  return screen.getByRole('checkbox', { name: /suggest reviewers/i })
}

function newcomersInput() {
  return screen.getByRole('textbox', { name: 'People new to the code' })
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('GithubReviewerSuggestions', () => {
  it('shows the saved switch and one newcomer per line, with nothing to save', () => {
    renderSection({ settings: { enabled: true, newcomers: ['ana', 'luis'] } })

    expect(switchInput()).toBeChecked()
    expect(newcomersInput()).toHaveValue('ana\nluis')
    expect(screen.getByRole('button', { name: 'Save suggestions' })).toBeDisabled()
    expect(screen.getByText(/works without Jev/)).toBeInTheDocument()
  })

  it('saves the switch and the newcomers split by lines, spaces or commas', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(respond(200, { reviewerSuggestions: { enabled: true, newcomers: ['ana', 'luis', 'marta'] } }))
    const user = userEvent.setup()
    const { onSaved } = renderSection()

    await user.click(switchInput())
    await user.type(newcomersInput(), 'ana, luis{Enter} marta ')
    await user.click(screen.getByRole('button', { name: 'Save suggestions' }))

    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/admin/config/github/reviewer-suggestions')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ enabled: true, newcomers: ['ana', 'luis', 'marta'] })
    expect(onSaved).toHaveBeenCalledWith({ enabled: true, newcomers: ['ana', 'luis', 'marta'] })
  })

  it('goes back to clean once the change is undone', async () => {
    const user = userEvent.setup()
    renderSection()

    await user.click(switchInput())
    expect(screen.getByRole('button', { name: 'Save suggestions' })).toBeEnabled()

    await user.click(switchInput())
    expect(screen.getByRole('button', { name: 'Save suggestions' })).toBeDisabled()
  })

  it('shows the server error and keeps the edit', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond(400, { error: '"ana garcia" is not a GitHub username.' }))
    const user = userEvent.setup()
    const { onSaved } = renderSection()

    await user.type(newcomersInput(), 'ana garcia')
    await user.click(screen.getByRole('button', { name: 'Save suggestions' }))

    expect(await screen.findByText('"ana garcia" is not a GitHub username.')).toBeInTheDocument()
    expect(newcomersInput()).toHaveValue('ana garcia')
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('logs out when the session expired', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond(401, { error: 'Unauthorized' }))
    const user = userEvent.setup()
    const { onLogout } = renderSection()

    await user.click(switchInput())
    await user.click(screen.getByRole('button', { name: 'Save suggestions' }))

    await vi.waitFor(() => expect(onLogout).toHaveBeenCalled())
  })
})
