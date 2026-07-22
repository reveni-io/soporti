import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsModal from './SettingsModal.jsx'

beforeEach(() => {
  vi.restoreAllMocks()
})

function mockGet(instructions = '') {
  return { ok: true, status: 200, json: async () => ({ instructions }) }
}

describe('SettingsModal', () => {
  it('loads the saved instructions on mount', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet('I work on payments'))

    render(<SettingsModal token="tok" onClose={vi.fn()} onLogout={vi.fn()} />)

    expect(await screen.findByDisplayValue('I work on payments')).toBeInTheDocument()
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/user/instructions')
    expect(options.headers.Authorization).toBe('Bearer tok')
  })

  it('renders the title and character count', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet('abc'))

    render(<SettingsModal token="tok" onClose={vi.fn()} onLogout={vi.fn()} />)

    expect(screen.getByText('Custom instructions')).toBeInTheDocument()
    await screen.findByDisplayValue('abc')
    expect(screen.getByText(/3 \/ 50/)).toBeInTheDocument()
    expect(screen.queryByText(/over limit/)).not.toBeInTheDocument()
  })

  it('calls onLogout when the load returns 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    const onLogout = vi.fn()

    render(<SettingsModal token="tok" onClose={vi.fn()} onLogout={onLogout} />)

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalled()
    })
  })

  it('shows an error when the load fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })

    render(<SettingsModal token="tok" onClose={vi.fn()} onLogout={vi.fn()} />)

    expect(await screen.findByText('Failed to load instructions')).toBeInTheDocument()
  })

  it('shows the error message when the load request throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network down'))

    render(<SettingsModal token="tok" onClose={vi.fn()} onLogout={vi.fn()} />)

    expect(await screen.findByText('Network down')).toBeInTheDocument()
  })

  it('disables Save until the instructions change', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet('original'))
    const user = userEvent.setup()

    render(<SettingsModal token="tok" onClose={vi.fn()} onLogout={vi.fn()} />)
    await screen.findByDisplayValue('original')

    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()

    await user.type(screen.getByDisplayValue('original'), '!')
    expect(save).toBeEnabled()
  })

  it('saves the edited instructions and shows Saved', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet(''))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ instructions: 'Be concise' }) })
    const user = userEvent.setup()

    render(<SettingsModal token="tok" onClose={vi.fn()} onLogout={vi.fn()} />)
    const textarea = screen.getByPlaceholderText(/payments team/)
    await waitFor(() => expect(textarea).toBeEnabled())

    await user.type(textarea, 'Be concise')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(textarea).toHaveValue('Be concise')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/user/instructions')
    expect(options.method).toBe('PUT')
    expect(options.headers.Authorization).toBe('Bearer tok')
    expect(JSON.parse(options.body)).toEqual({ instructions: 'Be concise' })
  })

  it('shows Saving... while the save request is in flight', async () => {
    let resolveSave
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet(''))
      .mockReturnValueOnce(
        new Promise(resolve => {
          resolveSave = resolve
        })
      )
    const user = userEvent.setup()

    render(<SettingsModal token="tok" onClose={vi.fn()} onLogout={vi.fn()} />)
    const textarea = screen.getByPlaceholderText(/payments team/)
    await waitFor(() => expect(textarea).toBeEnabled())

    await user.type(textarea, 'hi')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled()
    expect(textarea).toBeDisabled()

    resolveSave({ ok: true, status: 200, json: async () => ({ instructions: 'hi' }) })
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('calls onLogout when the save returns 401', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet(''))
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
    const onLogout = vi.fn()
    const user = userEvent.setup()

    render(<SettingsModal token="tok" onClose={vi.fn()} onLogout={onLogout} />)
    const textarea = screen.getByPlaceholderText(/payments team/)
    await waitFor(() => expect(textarea).toBeEnabled())

    await user.type(textarea, 'hi')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalled()
    })
  })

  it('shows the server error when the save fails', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet(''))
      .mockResolvedValueOnce({ ok: false, status: 422, json: async () => ({ error: 'Instructions too long' }) })
    const user = userEvent.setup()

    render(<SettingsModal token="tok" onClose={vi.fn()} onLogout={vi.fn()} />)
    const textarea = screen.getByPlaceholderText(/payments team/)
    await waitFor(() => expect(textarea).toBeEnabled())

    await user.type(textarea, 'hi')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Instructions too long')).toBeInTheDocument()
  })

  it('shows a generic error when the save failure has no JSON body', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet(''))
      .mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.reject(new Error('bad json')) })
    const user = userEvent.setup()

    render(<SettingsModal token="tok" onClose={vi.fn()} onLogout={vi.fn()} />)
    const textarea = screen.getByPlaceholderText(/payments team/)
    await waitFor(() => expect(textarea).toBeEnabled())

    await user.type(textarea, 'hi')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Failed to save')).toBeInTheDocument()
  })

  it('flags instructions over the limit and disables Save', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet('x'.repeat(50_001)))

    render(<SettingsModal token="tok" onClose={vi.fn()} onLogout={vi.fn()} />)

    expect(await screen.findByText(/over limit/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('calls onClose from the Close button and the X button', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet(''))
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(<SettingsModal token="tok" onClose={onClose} onLogout={vi.fn()} />)

    // Both the footer button and the header X are named "Close".
    const closeButtons = screen.getAllByRole('button', { name: 'Close' })
    expect(closeButtons).toHaveLength(2)
    await user.click(closeButtons[0])
    await user.click(closeButtons[1])
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('closes when clicking the overlay but not the modal itself', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet(''))
    const onClose = vi.fn()

    const { container } = render(<SettingsModal token="tok" onClose={onClose} onLogout={vi.fn()} />)
    await screen.findByPlaceholderText(/payments team/)

    fireEvent.click(container.querySelector('.settings-modal'))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(container.querySelector('.modal-overlay'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
