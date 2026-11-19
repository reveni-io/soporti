import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AwsAccessKeyForm from './AwsAccessKeyForm.jsx'

const ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE'
const SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'

describe('AwsAccessKeyForm', () => {
  it('saves both halves of the key together and clears the inputs', async () => {
    const onSave = vi.fn().mockResolvedValue()
    const user = userEvent.setup()

    render(<AwsAccessKeyForm configured={false} onSave={onSave} onLogout={vi.fn()} />)
    const save = screen.getByRole('button', { name: 'Save key' })
    expect(save).toBeDisabled()

    await user.type(screen.getByLabelText('Access key ID'), ` ${ACCESS_KEY_ID} `)
    expect(save).toBeDisabled()
    await user.type(screen.getByLabelText('Secret access key'), SECRET_ACCESS_KEY)
    await user.click(save)

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith({ accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY })
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(screen.getByLabelText('Access key ID')).toHaveValue('')
    expect(screen.getByLabelText('Secret access key')).toHaveValue('')
  })

  it('removes a stored key with two empty values', async () => {
    const onSave = vi.fn().mockResolvedValue()
    const user = userEvent.setup()

    render(<AwsAccessKeyForm configured onSave={onSave} onLogout={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith({ accessKeyId: '', secretAccessKey: '' })
  })

  it('offers no Remove button while no key is stored', () => {
    render(<AwsAccessKeyForm configured={false} onSave={vi.fn()} onLogout={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
  })

  it('keeps what was typed and shows the error when the key is rejected', async () => {
    const onSave = vi
      .fn()
      .mockRejectedValue(new Error('That does not look like an AWS secret access key (40 characters).'))
    const user = userEvent.setup()

    render(<AwsAccessKeyForm configured={false} onSave={onSave} onLogout={vi.fn()} />)
    await user.type(screen.getByLabelText('Access key ID'), ACCESS_KEY_ID)
    await user.type(screen.getByLabelText('Secret access key'), 'short')
    await user.click(screen.getByRole('button', { name: 'Save key' }))

    expect(
      await screen.findByText('That does not look like an AWS secret access key (40 characters).')
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Access key ID')).toHaveValue(ACCESS_KEY_ID)
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })
})
