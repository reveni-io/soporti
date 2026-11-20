import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AwsAccounts from './AwsAccounts.jsx'

const PROD_ARN = 'arn:aws:iam::210987654321:role/reader-prod'
const DEV_ARN = 'arn:aws:iam::123456789012:role/reader-dev'

describe('AwsAccounts', () => {
  it('says the own account is read when none are listed', () => {
    render(<AwsAccounts savedAccounts={[]} onSave={vi.fn()} onLogout={vi.fn()} />)

    expect(screen.getByText(/the assistant reads the account Soporti runs against/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('adds an account with a lowercased name and saves the whole list in order', async () => {
    const onSave = vi.fn().mockResolvedValue()
    const user = userEvent.setup()

    render(<AwsAccounts savedAccounts={[{ name: 'prod', roleArn: PROD_ARN }]} onSave={onSave} onLogout={vi.fn()} />)
    await user.type(screen.getByLabelText('Account name'), ' Dev ')
    await user.type(screen.getByLabelText('Role ARN'), DEV_ARN)
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByRole('cell', { name: 'dev' })).toBeInTheDocument()
    expect(screen.getByLabelText('Account name')).toHaveValue('')

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith([
      { name: 'prod', roleArn: PROD_ARN },
      { name: 'dev', roleArn: DEV_ARN },
    ])
  })

  it('ignores a name that is already listed', async () => {
    const user = userEvent.setup()

    render(<AwsAccounts savedAccounts={[{ name: 'prod', roleArn: PROD_ARN }]} onSave={vi.fn()} onLogout={vi.fn()} />)
    await user.type(screen.getByLabelText('Account name'), 'prod')
    await user.type(screen.getByLabelText('Role ARN'), DEV_ARN)
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getAllByRole('cell', { name: 'prod' })).toHaveLength(1)
    expect(screen.queryByText(DEV_ARN)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('removes an account and saves the rest', async () => {
    const onSave = vi.fn().mockResolvedValue()
    const user = userEvent.setup()

    render(
      <AwsAccounts
        savedAccounts={[
          { name: 'prod', roleArn: PROD_ARN },
          { name: 'dev', roleArn: DEV_ARN },
        ]}
        onSave={onSave}
        onLogout={vi.fn()}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Remove prod' }))

    expect(screen.queryByText(PROD_ARN)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith([{ name: 'dev', roleArn: DEV_ARN }])
  })

  it('shows why the accounts could not be saved', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('The account name "prod" is used twice.'))
    const user = userEvent.setup()

    render(<AwsAccounts savedAccounts={[{ name: 'prod', roleArn: PROD_ARN }]} onSave={onSave} onLogout={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Remove prod' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('The account name "prod" is used twice.')).toBeInTheDocument()
  })
})
