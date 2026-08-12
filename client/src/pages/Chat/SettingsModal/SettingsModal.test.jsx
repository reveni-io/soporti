import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsModal from './SettingsModal.jsx'

beforeEach(() => {
  vi.restoreAllMocks()
})

function mockApi() {
  return vi.fn(async url => {
    if (url.includes('/api/user/instructions')) {
      return { ok: true, status: 200, json: async () => ({ instructions: '' }) }
    }
    if (url.includes('/api/user/granola')) {
      return { ok: true, status: 200, json: async () => ({ connected: false }) }
    }
    if (url.includes('/api/api-keys')) {
      return { ok: true, status: 200, json: async () => ({ apiKeys: [] }) }
    }
    return { ok: false, status: 404, json: async () => ({}) }
  })
}

function skillStore() {
  return { skills: [], loading: false, error: null, reload: vi.fn(async () => {}) }
}

describe('SettingsModal', () => {
  it('shows the Custom instructions tab by default', async () => {
    global.fetch = mockApi()

    render(<SettingsModal token="tok" onClose={vi.fn()} onLogout={vi.fn()} skills={skillStore()} />)

    expect(await screen.findByPlaceholderText(/payments team/)).toBeInTheDocument()
  })

  it('switches to the Skills tab', async () => {
    global.fetch = mockApi()
    const user = userEvent.setup()

    render(<SettingsModal token="tok" onClose={vi.fn()} onLogout={vi.fn()} skills={skillStore()} />)
    await screen.findByPlaceholderText(/payments team/)

    await user.click(screen.getByRole('tab', { name: 'Skills' }))

    expect(await screen.findByText('No skills yet.')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/payments team/)).not.toBeInTheDocument()
  })

  it('switches to the API keys tab and forwards the selected sources', async () => {
    global.fetch = mockApi()
    const user = userEvent.setup()

    render(
      <SettingsModal
        token="tok"
        onClose={vi.fn()}
        onLogout={vi.fn()}
        skills={skillStore()}
        selectedSources={['reveni-io/soporti']}
      />
    )
    await screen.findByPlaceholderText(/payments team/)

    await user.click(screen.getByRole('tab', { name: 'API keys' }))

    expect(await screen.findByText('No API keys yet.')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox'))
    expect(screen.getByText('reveni-io/soporti')).toBeInTheDocument()
  })

  it('switches to the Connections tab', async () => {
    global.fetch = mockApi()
    const user = userEvent.setup()

    render(<SettingsModal token="tok" onClose={vi.fn()} onLogout={vi.fn()} skills={skillStore()} />)
    await screen.findByPlaceholderText(/payments team/)

    await user.click(screen.getByRole('tab', { name: 'Connections' }))

    expect(await screen.findByText('Not connected')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/payments team/)).not.toBeInTheDocument()
  })

  it('calls onClose from the Close button and the X button', async () => {
    global.fetch = mockApi()
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(<SettingsModal token="tok" onClose={onClose} onLogout={vi.fn()} skills={skillStore()} />)

    const closeButtons = screen.getAllByRole('button', { name: 'Close' })
    expect(closeButtons).toHaveLength(2)
    await user.click(closeButtons[0])
    await user.click(closeButtons[1])
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('closes when clicking the overlay but not the modal itself', async () => {
    global.fetch = mockApi()
    const onClose = vi.fn()

    const { container } = render(
      <SettingsModal token="tok" onClose={onClose} onLogout={vi.fn()} skills={skillStore()} />
    )
    await screen.findByPlaceholderText(/payments team/)

    const modal = container.querySelector('.settings-modal')
    fireEvent.mouseDown(modal)
    fireEvent.click(modal)
    expect(onClose).not.toHaveBeenCalled()

    const overlay = container.querySelector('.modal-overlay')
    fireEvent.mouseDown(overlay)
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('stays open when a text selection started inside ends on the overlay', async () => {
    global.fetch = mockApi()
    const onClose = vi.fn()

    const { container } = render(
      <SettingsModal token="tok" onClose={onClose} onLogout={vi.fn()} skills={skillStore()} />
    )
    const textarea = await screen.findByPlaceholderText(/payments team/)

    fireEvent.mouseDown(textarea)
    fireEvent.click(container.querySelector('.modal-overlay'))

    expect(onClose).not.toHaveBeenCalled()
  })
})
