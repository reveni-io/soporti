import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '../../../services/services.js'
import SelectField from './SelectField.jsx'

const OPTIONS = [
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Max' },
]

describe('SelectField', () => {
  it('preselects the saved value and keeps Save disabled until the selection changes', async () => {
    const user = userEvent.setup()
    render(
      <SelectField
        savedValue="max"
        options={OPTIONS}
        ariaLabel="Effort"
        saveLabel="Save effort"
        onSave={vi.fn()}
        onLogout={vi.fn()}
      />
    )

    const select = screen.getByRole('combobox', { name: 'Effort' })
    expect(select).toHaveValue('max')
    expect(screen.getByRole('option', { name: 'High' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save effort' })).toBeDisabled()

    await user.selectOptions(select, 'high')

    expect(screen.getByRole('button', { name: 'Save effort' })).toBeEnabled()
  })

  it('saves the selected value and confirms it', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <SelectField
        savedValue="max"
        options={OPTIONS}
        ariaLabel="Effort"
        saveLabel="Save effort"
        onSave={onSave}
        onLogout={vi.fn()}
      />
    )

    await user.selectOptions(screen.getByRole('combobox', { name: 'Effort' }), 'high')
    await user.click(screen.getByRole('button', { name: 'Save effort' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith('high')
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('shows the error and keeps the selection when saving fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new ApiError('That is not a supported reasoning effort.', 400))
    const user = userEvent.setup()
    render(
      <SelectField
        savedValue="max"
        options={OPTIONS}
        ariaLabel="Effort"
        saveLabel="Save effort"
        onSave={onSave}
        onLogout={vi.fn()}
      />
    )

    await user.selectOptions(screen.getByRole('combobox', { name: 'Effort' }), 'high')
    await user.click(screen.getByRole('button', { name: 'Save effort' }))

    expect(await screen.findByText('That is not a supported reasoning effort.')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Effort' })).toHaveValue('high')
  })

  it('logs out instead of showing an error on a 401', async () => {
    const onLogout = vi.fn()
    const onSave = vi.fn().mockRejectedValue(new ApiError('Unauthorized', 401))
    const user = userEvent.setup()
    render(
      <SelectField
        savedValue="max"
        options={OPTIONS}
        ariaLabel="Effort"
        saveLabel="Save effort"
        onSave={onSave}
        onLogout={onLogout}
      />
    )

    await user.selectOptions(screen.getByRole('combobox', { name: 'Effort' }), 'high')
    await user.click(screen.getByRole('button', { name: 'Save effort' }))

    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Unauthorized')).not.toBeInTheDocument()
  })
})
