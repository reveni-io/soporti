import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AppTab from './AppTab.jsx'

const IPHONE_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'

function pushState(overrides = {}) {
  return {
    isChecking: false,
    isSupported: true,
    needsInstall: false,
    permission: 'default',
    isSubscribed: false,
    isBusy: false,
    error: null,
    testResult: null,
    enable: vi.fn(),
    disable: vi.fn(),
    sendTest: vi.fn(),
    ...overrides,
  }
}

function promptEvent() {
  const event = new Event('beforeinstallprompt', { cancelable: true })
  event.prompt = vi.fn().mockResolvedValue()
  return event
}

beforeEach(() => {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false })
})

afterEach(() => {
  vi.restoreAllMocks()
  delete navigator.userAgent
})

describe('AppTab', () => {
  describe('install', () => {
    it('says the app is already installed when it runs as the installed app', () => {
      window.matchMedia.mockReturnValue({ matches: true })

      render(<AppTab push={pushState()} />)

      expect(screen.getByText("You're using the installed app.")).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument()
    })

    it('installs the app from the prompt the browser offers', async () => {
      vi.resetModules()
      const { captureInstallPrompt } = await import('../../../../pwa/install-prompt.js')
      const { default: FreshAppTab } = await import('./AppTab.jsx')
      captureInstallPrompt()
      const event = promptEvent()
      const user = userEvent.setup()

      render(<FreshAppTab push={pushState()} />)
      act(() => {
        window.dispatchEvent(event)
      })
      await user.click(screen.getByRole('button', { name: 'Install' }))

      expect(event.prompt).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument()
    })

    it('confirms the install once the browser reports it', async () => {
      vi.resetModules()
      const { captureInstallPrompt } = await import('../../../../pwa/install-prompt.js')
      const { default: FreshAppTab } = await import('./AppTab.jsx')
      captureInstallPrompt()

      render(<FreshAppTab push={pushState()} />)
      act(() => {
        window.dispatchEvent(new Event('appinstalled'))
      })

      expect(screen.getByText(/Soporti is installed\. Open it from your home screen/)).toBeInTheDocument()
    })

    it('shows iPhone users how to add the app from the Share menu', () => {
      Object.defineProperty(navigator, 'userAgent', { value: IPHONE_AGENT, configurable: true })

      render(<AppTab push={pushState()} />)

      expect(screen.getByText('Add to Home Screen')).toBeInTheDocument()
    })

    it('points desktop users to the install icon of the browser', () => {
      render(<AppTab push={pushState()} />)

      expect(screen.getByText(/install icon in your browser's address bar/)).toBeInTheDocument()
    })
  })

  describe('notifications', () => {
    it('waits while it checks this device', () => {
      render(<AppTab push={pushState({ isChecking: true })} />)

      expect(screen.getByText('Checking this device…')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Turn on' })).not.toBeInTheDocument()
    })

    it('asks iPhone users to install the app before turning notifications on', () => {
      render(<AppTab push={pushState({ needsInstall: true, isSupported: false })} />)

      expect(screen.getByText(/notifications only work in the installed app/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Turn on' })).not.toBeInTheDocument()
    })

    it('says when this browser cannot receive notifications', () => {
      render(<AppTab push={pushState({ isSupported: false })} />)

      expect(screen.getByText("This browser can't receive notifications from Soporti.")).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Turn on' })).not.toBeInTheDocument()
    })

    it('explains how to unblock notifications the user denied', () => {
      render(<AppTab push={pushState({ permission: 'denied' })} />)

      expect(screen.getByText(/Notifications are blocked for Soporti/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Turn on' })).not.toBeInTheDocument()
    })

    it('turns notifications on', async () => {
      const push = pushState()
      const user = userEvent.setup()

      render(<AppTab push={push} />)
      expect(screen.getByText('Off')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Turn on' }))

      expect(push.enable).toHaveBeenCalledTimes(1)
    })

    it('sends a test notification and turns notifications off once they are on', async () => {
      const push = pushState({ permission: 'granted', isSubscribed: true })
      const user = userEvent.setup()

      render(<AppTab push={push} />)
      expect(screen.getByText('On')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Send a test notification' }))
      await user.click(screen.getByRole('button', { name: 'Turn off' }))

      expect(push.sendTest).toHaveBeenCalledTimes(1)
      expect(push.disable).toHaveBeenCalledTimes(1)
      expect(push.enable).not.toHaveBeenCalled()
    })

    it('shows the result of the test notification', () => {
      render(<AppTab push={pushState({ isSubscribed: true, testResult: 'Test notification sent to 2 devices.' })} />)

      expect(screen.getByRole('status')).toHaveTextContent('Test notification sent to 2 devices.')
    })

    it('shows why the last action failed', () => {
      render(<AppTab push={pushState({ error: 'Failed to turn on notifications on this device' })} />)

      expect(screen.getByText('Failed to turn on notifications on this device')).toHaveClass('alert--error')
      expect(screen.getByRole('button', { name: 'Turn on' })).toBeEnabled()
    })

    it('blocks the buttons while a change is in flight', () => {
      render(<AppTab push={pushState({ isSubscribed: true, isBusy: true })} />)

      expect(screen.getByRole('button', { name: 'Send a test notification' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Turn off' })).toBeDisabled()
    })
  })
})
