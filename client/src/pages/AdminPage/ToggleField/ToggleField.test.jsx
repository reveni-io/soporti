import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ToggleField from './ToggleField.jsx'

describe('ToggleField', () => {
  it('renders the label, the hint and the stored value', () => {
    render(<ToggleField enabled label="Allow it" hint="Off by default." onSave={vi.fn()} onLogout={vi.fn()} />)

    expect(screen.getByText('Allow it')).toBeInTheDocument()
    expect(screen.getByText('Off by default.')).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('only saves when the button is pressed, then shows Saved', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(<ToggleField enabled={false} label="Allow it" hint="" onSave={onSave} onLogout={vi.fn()} />)

    await user.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(onSave).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith(true)
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('shows the error when saving fails and keeps the edited value', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Nope.'))
    const user = userEvent.setup()

    render(<ToggleField enabled={false} label="Allow it" hint="" onSave={onSave} onLogout={vi.fn()} />)

    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Nope.')).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('logs out when the save is unauthorized', async () => {
    const unauthorized = Object.assign(new Error('Unauthorized'), { status: 401 })
    const onLogout = vi.fn()
    const user = userEvent.setup()

    render(
      <ToggleField
        enabled={false}
        label="Allow it"
        hint=""
        onSave={vi.fn().mockRejectedValue(unauthorized)}
        onLogout={onLogout}
      />
    )

    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onLogout).toHaveBeenCalledTimes(1)
  })
})
