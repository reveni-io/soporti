import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../../../services/services.js'
import SecretField from './SecretField.jsx'

describe('SecretField', () => {
  it('masks the value and keeps Save disabled until something is typed', async () => {
    const user = userEvent.setup()
    render(<SecretField placeholder="Auth token" configured={false} onSave={vi.fn()} onLogout={vi.fn()} />)

    const input = screen.getByPlaceholderText('Auth token')
    expect(input).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()

    await user.type(input, 'sk-123')

    expect(screen.getByRole('button', { name: /save/i })).toBeEnabled()
  })

  it('saves the trimmed value and clears the input afterwards', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<SecretField placeholder="Auth token" configured={false} onSave={onSave} onLogout={vi.fn()} />)

    const input = screen.getByPlaceholderText('Auth token')
    await user.type(input, '  sk-123  ')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith('sk-123')
    expect(input).toHaveValue('')
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('shows the replacement placeholder and a Remove button once configured', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <SecretField
        placeholder="Auth token"
        configuredPlaceholder="Paste a new token to replace it"
        configured
        onSave={onSave}
        onLogout={vi.fn()}
      />
    )

    expect(screen.getByPlaceholderText('Paste a new token to replace it')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /remove/i }))

    expect(onSave).toHaveBeenCalledWith('')
  })

  it('keeps the typed value and shows the error when saving fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new ApiError('That does not look like a valid token.', 400))
    const user = userEvent.setup()
    render(<SecretField placeholder="Auth token" configured={false} onSave={onSave} onLogout={vi.fn()} />)

    await user.type(screen.getByPlaceholderText('Auth token'), 'bad')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByText('That does not look like a valid token.')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Auth token')).toHaveValue('bad')
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('logs out instead of showing an error on a 401', async () => {
    const onLogout = vi.fn()
    const onSave = vi.fn().mockRejectedValue(new ApiError('Unauthorized', 401))
    const user = userEvent.setup()
    render(<SecretField placeholder="Auth token" configured={false} onSave={onSave} onLogout={onLogout} />)

    await user.type(screen.getByPlaceholderText('Auth token'), 'x')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Unauthorized')).not.toBeInTheDocument()
  })

  it('fills the visible input from the generator', async () => {
    const user = userEvent.setup()
    render(
      <SecretField
        placeholder="Webhook secret"
        configured={false}
        onSave={vi.fn()}
        onLogout={vi.fn()}
        masked={false}
        onGenerate={() => 'generated-secret'}
      />
    )

    const input = screen.getByPlaceholderText('Webhook secret')
    expect(input).toHaveAttribute('type', 'text')

    await user.click(screen.getByRole('button', { name: /generate/i }))

    expect(input).toHaveValue('generated-secret')
  })

  it('uses the labels it is given', () => {
    render(
      <SecretField
        placeholder="Webhook secret"
        configured
        onSave={vi.fn()}
        onLogout={vi.fn()}
        saveLabel="Save secret"
        removeLabel="Disable"
      />
    )

    expect(screen.getByRole('button', { name: 'Save secret' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Disable' })).toBeInTheDocument()
  })
})
