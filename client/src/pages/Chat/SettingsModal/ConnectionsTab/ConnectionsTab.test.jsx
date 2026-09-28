import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ConnectionsTab from './ConnectionsTab.jsx'

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('ConnectionsTab', () => {
  it('lists every personal connection with its own state', async () => {
    global.fetch = vi.fn(async url => {
      if (url.includes('/api/user/zendesk')) {
        return jsonResponse({
          connected: true,
          subdomain: 'acme',
          email: 'ana@acme.com',
          writesEnabled: false,
        })
      }
      return jsonResponse({ connected: false })
    })

    render(<ConnectionsTab token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('Granola')).toBeInTheDocument()
    expect(await screen.findByText('Zendesk')).toBeInTheDocument()
    expect(screen.getByText('Not connected')).toBeInTheDocument()
    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })
})
