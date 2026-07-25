import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SignInMethods from './SignInMethods.jsx'

describe('SignInMethods', () => {
  it('reflects which methods are enabled', () => {
    render(<SignInMethods googleEnabled passwordEnabled={false} saving={false} error={null} onToggle={vi.fn()} />)

    const [google, password] = screen.getAllByRole('checkbox')
    expect(google).toBeChecked()
    expect(password).not.toBeChecked()
  })

  it('reports which method was toggled', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(<SignInMethods googleEnabled passwordEnabled saving={false} error={null} onToggle={onToggle} />)

    const [google, password] = screen.getAllByRole('checkbox')
    await user.click(google)
    await user.click(password)

    expect(onToggle).toHaveBeenNthCalledWith(1, 'google')
    expect(onToggle).toHaveBeenNthCalledWith(2, 'password')
  })

  it('warns that the password form is hidden when it is disabled', () => {
    render(<SignInMethods googleEnabled passwordEnabled={false} saving={false} error={null} onToggle={vi.fn()} />)

    expect(screen.getByText(/cannot lock yourself out/i)).toBeInTheDocument()
    expect(screen.queryByText(/regular users cannot sign in at all/i)).not.toBeInTheDocument()
  })

  it('warns that nobody can sign in when both are disabled', () => {
    render(
      <SignInMethods googleEnabled={false} passwordEnabled={false} saving={false} error={null} onToggle={vi.fn()} />
    )

    expect(screen.getByText(/regular users cannot sign in at all/i)).toBeInTheDocument()
  })

  it('disables both switches while saving and shows the error', () => {
    render(<SignInMethods googleEnabled passwordEnabled saving error="Failed to save" onToggle={vi.fn()} />)

    screen.getAllByRole('checkbox').forEach(checkbox => expect(checkbox).toBeDisabled())
    expect(screen.getByText('Failed to save')).toBeInTheDocument()
  })
})
