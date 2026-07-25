import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../../../services/services.js'
import ValueField from './ValueField.jsx'

describe('ValueField', () => {
  it('shows the saved value and keeps Save disabled until it changes', async () => {
    const user = userEvent.setup()
    render(<ValueField savedValue="my-org" onSave={vi.fn()} onLogout={vi.fn()} placeholder="my-org" />)

    const input = screen.getByPlaceholderText('my-org')
    expect(input).toHaveValue('my-org')
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()

    await user.type(input, '-2')

    expect(screen.getByRole('button', { name: /save/i })).toBeEnabled()
  })

  it('saves the trimmed value and confirms it', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<ValueField savedValue="" onSave={onSave} onLogout={vi.fn()} placeholder="my-org" />)

    await user.type(screen.getByPlaceholderText('my-org'), '  acme  ')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(onSave).toHaveBeenCalledWith('acme')
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('follows a new saved value coming from the server', () => {
    const { rerender } = render(
      <ValueField savedValue="100" onSave={vi.fn()} onLogout={vi.fn()} placeholder="100" type="number" />
    )

    rerender(<ValueField savedValue="250" onSave={vi.fn()} onLogout={vi.fn()} placeholder="100" type="number" />)

    expect(screen.getByRole('spinbutton')).toHaveValue(250)
  })

  it('only offers Remove when it is removable and a value is stored', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    const { rerender } = render(
      <ValueField savedValue="" onSave={onSave} onLogout={vi.fn()} placeholder="client-id" removable />
    )

    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()

    rerender(<ValueField savedValue="abc" onSave={onSave} onLogout={vi.fn()} placeholder="client-id" removable />)
    await user.click(screen.getByRole('button', { name: /remove/i }))

    expect(onSave).toHaveBeenCalledWith('')
  })

  it('shows the error and keeps the edit when saving fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new ApiError('The model cannot be empty.', 400))
    const user = userEvent.setup()
    render(<ValueField savedValue="gpt-4o" onSave={onSave} onLogout={vi.fn()} placeholder="gpt-4o" />)

    const input = screen.getByPlaceholderText('gpt-4o')
    await user.clear(input)
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByText('The model cannot be empty.')).toBeInTheDocument()
    expect(input).toHaveValue('')
  })

  it('logs out instead of showing an error on a 401', async () => {
    const onLogout = vi.fn()
    const onSave = vi.fn().mockRejectedValue(new ApiError('Unauthorized', 401))
    const user = userEvent.setup()
    render(<ValueField savedValue="" onSave={onSave} onLogout={onLogout} placeholder="my-org" />)

    await user.type(screen.getByPlaceholderText('my-org'), 'x')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Unauthorized')).not.toBeInTheDocument()
  })
})
