import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AwsConnectionTest from './AwsConnectionTest.jsx'

const DENIED =
  'AWS denied ecs:ListClusters. Add it to the IAM policy of the role or user Soporti reads this account with.'
const OWN_ARN = 'arn:aws:sts::123456789012:assumed-role/soporti-task/abc'
const PROD_ARN = 'arn:aws:sts::210987654321:assumed-role/reader-prod/soporti'
const ASSUME_FAILED = 'AWS did not let Soporti assume arn:aws:iam::333333333333:role/reader-dev.'
const REPORT = {
  region: 'eu-central-1',
  runsAs: { account: '123456789012', arn: OWN_ARN },
  accounts: [
    {
      name: null,
      account: '123456789012',
      arn: OWN_ARN,
      checks: [
        { id: 'alarms', label: 'CloudWatch alarms', action: 'cloudwatch:DescribeAlarms', ok: true },
        { id: 'ecs', label: 'ECS clusters', action: 'ecs:ListClusters', ok: false, error: DENIED },
      ],
    },
  ],
}
const ACCOUNTS_REPORT = {
  region: 'eu-central-1',
  runsAs: { account: '123456789012', arn: OWN_ARN },
  accounts: [
    {
      name: 'prod',
      account: '210987654321',
      arn: PROD_ARN,
      checks: [{ id: 'alarms', label: 'CloudWatch alarms', action: 'cloudwatch:DescribeAlarms', ok: true }],
    },
    { name: 'dev', error: ASSUME_FAILED },
  ],
}

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('AwsConnectionTest', () => {
  it('shows the identity, the region and which permissions AWS allowed', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(REPORT))
    const user = userEvent.setup()

    render(<AwsConnectionTest token="tok" onLogout={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Test connection' }))

    expect(await screen.findByText('Connected')).toBeInTheDocument()
    expect(screen.getAllByText(OWN_ARN)).toHaveLength(2)
    expect(screen.getByText('eu-central-1')).toBeInTheDocument()
    expect(screen.getByText('allowed')).toBeInTheDocument()
    expect(screen.getByText('denied')).toBeInTheDocument()
    expect(screen.getByText(DENIED)).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/admin/config/aws/test')
    expect(options.method).toBe('POST')
  })

  it('shows why AWS could not be reached and drops the previous report', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(REPORT))
      .mockResolvedValueOnce(jsonResponse({ error: 'No AWS credentials were found.' }, 422))
    const user = userEvent.setup()

    render(<AwsConnectionTest token="tok" onLogout={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Test connection' }))
    await screen.findByText('Connected')
    await user.click(screen.getByRole('button', { name: 'Test connection' }))

    expect(await screen.findByText('No AWS credentials were found.')).toBeInTheDocument()
    expect(screen.queryByText(OWN_ARN)).not.toBeInTheDocument()
    expect(screen.queryByText('Connected')).not.toBeInTheDocument()
  })

  it('shows each account with the identity it reads as, and the ones it could not reach', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(ACCOUNTS_REPORT))
    const user = userEvent.setup()

    render(<AwsConnectionTest token="tok" onLogout={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Test connection' }))

    expect(await screen.findByRole('heading', { name: 'prod' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'dev' })).toBeInTheDocument()
    expect(screen.getByText(OWN_ARN)).toBeInTheDocument()
    expect(screen.getByText(PROD_ARN)).toBeInTheDocument()
    expect(screen.getByText('failed')).toBeInTheDocument()
    expect(screen.getByText(ASSUME_FAILED)).toBeInTheDocument()
    expect(screen.queryByText('Connected')).not.toBeInTheDocument()
  })

  it('logs out on a 401', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: 'Unauthorized' }, 401))
    const onLogout = vi.fn()
    const user = userEvent.setup()

    render(<AwsConnectionTest token="tok" onLogout={onLogout} />)
    await user.click(screen.getByRole('button', { name: 'Test connection' }))

    await vi.waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Unauthorized')).not.toBeInTheDocument()
  })
})
