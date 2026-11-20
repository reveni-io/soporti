import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../pwa/service-worker.js', () => ({ onAppUpdated: vi.fn() }))

const { onAppUpdated } = await import('../../pwa/service-worker.js')
const { default: UpdateToast } = await import('./UpdateToast.jsx')

let announceUpdate

beforeEach(() => {
  vi.clearAllMocks()
  onAppUpdated.mockImplementation(listener => {
    announceUpdate = listener
    return () => {}
  })
})

describe('UpdateToast', () => {
  it('renders nothing while the app is up to date', () => {
    render(<UpdateToast />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('tells the user a new version is ready once the service worker updates', () => {
    render(<UpdateToast />)

    act(() => announceUpdate())

    expect(screen.getByRole('status')).toHaveTextContent('A new version of Soporti is ready.')
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument()
  })

  it('reloads the page when the user asks for the new version', async () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { reload }, writable: true, configurable: true })
    render(<UpdateToast />)
    act(() => announceUpdate())

    await userEvent.click(screen.getByRole('button', { name: /reload/i }))

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('goes away when dismissed', async () => {
    render(<UpdateToast />)
    act(() => announceUpdate())

    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
