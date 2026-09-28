import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminShopify from './AdminShopify.jsx'

beforeEach(() => {
  vi.restoreAllMocks()
})

const TOKEN_URL = 'https://tokens.example.com/shopify/{{store}}'
const URL_PLACEHOLDER = 'https://tokens.example.com/shopify/{{store}}'

function mockGet({ tokenUrl = '', authorizationConfigured = false } = {}) {
  return { ok: true, status: 200, json: async () => ({ tokenUrl, authorizationConfigured }) }
}

describe('AdminShopify', () => {
  it('shows configured and the saved URL once the token service URL is set', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ tokenUrl: TOKEN_URL, authorizationConfigured: true }))

    render(<AdminShopify token="tok" onLogout={vi.fn()} />)

    expect(await screen.findAllByText('configured')).toHaveLength(2)
    expect(screen.getByDisplayValue(TOKEN_URL)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /remove/i })).toHaveLength(2)
  })

  it('shows not configured without a token service URL', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet())

    render(<AdminShopify token="tok" onLogout={vi.fn()} />)

    expect(await screen.findAllByText('not configured')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
  })

  it('saves the token service URL', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ tokenUrl: TOKEN_URL }) })
    const user = userEvent.setup()

    render(<AdminShopify token="tok" onLogout={vi.fn()} />)
    const input = await screen.findByPlaceholderText(URL_PLACEHOLDER)

    await user.click(input)
    await user.paste(TOKEN_URL)
    await user.click(screen.getAllByRole('button', { name: /^save$/i })[0])

    expect(await screen.findByText('configured')).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledTimes(2)
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/shopify/token-url')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ tokenUrl: TOKEN_URL })
  })

  it('saves the Authorization header and clears the input (write-only)', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ tokenUrl: TOKEN_URL }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ authorizationConfigured: true }) })
    const user = userEvent.setup()

    render(<AdminShopify token="tok" onLogout={vi.fn()} />)
    const input = await screen.findByPlaceholderText('Authorization header value')

    await user.type(input, 'Bearer internal-secret')
    await user.click(screen.getAllByRole('button', { name: /^save$/i })[1])

    expect(await screen.findAllByText('configured')).toHaveLength(2)
    expect(input).toHaveValue('')
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/shopify/token-authorization')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ authorization: 'Bearer internal-secret' })
  })

  it('removes the token service URL', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ tokenUrl: TOKEN_URL }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ tokenUrl: '' }) })
    const user = userEvent.setup()

    render(<AdminShopify token="tok" onLogout={vi.fn()} />)
    await screen.findByDisplayValue(TOKEN_URL)

    await user.click(screen.getByRole('button', { name: /remove/i }))

    expect(await screen.findAllByText('not configured')).toHaveLength(2)
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ tokenUrl: '' })
  })

  it('surfaces a URL validation error from the server', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'The token service URL must contain the {{store}} placeholder.' }),
      })
    const user = userEvent.setup()

    render(<AdminShopify token="tok" onLogout={vi.fn()} />)
    const input = await screen.findByPlaceholderText(URL_PLACEHOLDER)

    await user.click(input)
    await user.paste('https://tokens.example.com/token')
    await user.click(screen.getAllByRole('button', { name: /^save$/i })[0])

    expect(await screen.findByText(/must contain the \{\{store\}\} placeholder/)).toBeInTheDocument()
  })

  it('logs out on a 401', async () => {
    const onLogout = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })

    render(<AdminShopify token="expired" onLogout={onLogout} />)

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalledTimes(1)
    })
  })
})
