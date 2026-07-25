import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BootstrapForm from './BootstrapForm.jsx'

describe('BootstrapForm', () => {
  it('submits the trimmed credentials and the setup code', async () => {
    const onBootstrap = vi.fn().mockResolvedValue(true)
    const user = userEvent.setup()
    render(<BootstrapForm onBootstrap={onBootstrap} error={null} isLoading={false} />)

    await user.type(screen.getByPlaceholderText('Email'), '  boss@x.io  ')
    await user.type(screen.getByPlaceholderText('Name (optional)'), '  Boss  ')
    await user.type(screen.getByPlaceholderText(/^Password/), 'secret-password')
    await user.type(screen.getByPlaceholderText('Confirm password'), 'secret-password')
    await user.type(screen.getByPlaceholderText('Setup code'), '  code-from-logs  ')
    await user.click(screen.getByRole('button', { name: /create admin account/i }))

    expect(onBootstrap).toHaveBeenCalledWith('boss@x.io', 'secret-password', 'Boss', 'code-from-logs')
  })

  it('rejects mismatched passwords without calling the server', async () => {
    const onBootstrap = vi.fn()
    const user = userEvent.setup()
    render(<BootstrapForm onBootstrap={onBootstrap} error={null} isLoading={false} />)

    await user.type(screen.getByPlaceholderText('Email'), 'boss@x.io')
    await user.type(screen.getByPlaceholderText(/^Password/), 'secret-password')
    await user.type(screen.getByPlaceholderText('Confirm password'), 'different-one')
    await user.type(screen.getByPlaceholderText('Setup code'), 'code')
    await user.click(screen.getByRole('button', { name: /create admin account/i }))

    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument()
    expect(onBootstrap).not.toHaveBeenCalled()
  })

  it('omits an empty name', async () => {
    const onBootstrap = vi.fn().mockResolvedValue(true)
    const user = userEvent.setup()
    render(<BootstrapForm onBootstrap={onBootstrap} error={null} isLoading={false} />)

    await user.type(screen.getByPlaceholderText('Email'), 'boss@x.io')
    await user.type(screen.getByPlaceholderText(/^Password/), 'secret-password')
    await user.type(screen.getByPlaceholderText('Confirm password'), 'secret-password')
    await user.type(screen.getByPlaceholderText('Setup code'), 'code')
    await user.click(screen.getByRole('button', { name: /create admin account/i }))

    expect(onBootstrap).toHaveBeenCalledWith('boss@x.io', 'secret-password', undefined, 'code')
  })

  it('shows the error coming from the caller', () => {
    render(<BootstrapForm onBootstrap={vi.fn()} error="Invalid setup code." isLoading={false} />)

    expect(screen.getByText('Invalid setup code.')).toBeInTheDocument()
  })

  it('disables the form while it is loading', () => {
    render(<BootstrapForm onBootstrap={vi.fn()} error={null} isLoading />)

    expect(screen.getByRole('button', { name: /creating/i })).toBeDisabled()
    expect(screen.getByPlaceholderText('Email')).toBeDisabled()
  })
})
