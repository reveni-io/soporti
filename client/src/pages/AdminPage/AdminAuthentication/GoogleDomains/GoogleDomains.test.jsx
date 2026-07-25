import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../../../../services/services.js'
import GoogleDomains from './GoogleDomains.jsx'

describe('GoogleDomains', () => {
  it('warns when no domain restricts sign-in', () => {
    render(<GoogleDomains savedDomains={[]} onSave={vi.fn()} onLogout={vi.fn()} />)

    expect(screen.getByText('No domains configured.')).toBeInTheDocument()
    expect(screen.getByText(/anyone with a Google account will be able to sign in/i)).toBeInTheDocument()
  })

  it('adds a domain lowercased and saves the whole list', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<GoogleDomains savedDomains={['acme.com']} onSave={onSave} onLogout={vi.fn()} />)

    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled()

    await user.type(screen.getByPlaceholderText('example.com'), 'Example.ORG')
    await user.click(screen.getByRole('button', { name: /add/i }))

    expect(screen.getByText('example.org')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('example.com')).toHaveValue('')

    await user.click(screen.getByRole('button', { name: /^save$/i }))

    expect(onSave).toHaveBeenCalledWith(['acme.com', 'example.org'])
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('ignores a duplicate domain', async () => {
    const user = userEvent.setup()
    render(<GoogleDomains savedDomains={['acme.com']} onSave={vi.fn()} onLogout={vi.fn()} />)

    await user.type(screen.getByPlaceholderText('example.com'), 'acme.com')
    await user.click(screen.getByRole('button', { name: /add/i }))

    expect(screen.getAllByText('acme.com')).toHaveLength(1)
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled()
  })

  it('removes a domain', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<GoogleDomains savedDomains={['acme.com', 'other.com']} onSave={onSave} onLogout={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Remove acme.com' }))
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    expect(onSave).toHaveBeenCalledWith(['other.com'])
  })

  it('shows the error when saving fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new ApiError('bad domain', 400))
    const user = userEvent.setup()
    render(<GoogleDomains savedDomains={[]} onSave={onSave} onLogout={vi.fn()} />)

    await user.type(screen.getByPlaceholderText('example.com'), 'nope')
    await user.click(screen.getByRole('button', { name: /add/i }))
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    expect(await screen.findByText('bad domain')).toBeInTheDocument()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('logs out on a 401', async () => {
    const onLogout = vi.fn()
    const onSave = vi.fn().mockRejectedValue(new ApiError('Unauthorized', 401))
    const user = userEvent.setup()
    render(<GoogleDomains savedDomains={[]} onSave={onSave} onLogout={onLogout} />)

    await user.type(screen.getByPlaceholderText('example.com'), 'x.com')
    await user.click(screen.getByRole('button', { name: /add/i }))
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    expect(onLogout).toHaveBeenCalledTimes(1)
  })
})
