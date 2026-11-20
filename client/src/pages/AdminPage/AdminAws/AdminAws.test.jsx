import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminAws from './AdminAws.jsx'

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

const ROLE_ARN = 'arn:aws:iam::123456789012:role/monitoring-hub'
const READER_ARN = 'arn:aws:iam::210987654321:role/monitoring-reader'

function configResponse({
  enabled = false,
  region = '',
  accessKeyConfigured = false,
  roleArn = '',
  accounts = [],
} = {}) {
  return jsonResponse({ enabled, region, accessKeyConfigured, roleArn, accounts })
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('AdminAws', () => {
  it('starts off, reading the environment region and credentials', async () => {
    global.fetch = vi.fn().mockResolvedValue(configResponse())

    render(<AdminAws token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('off')).toBeInTheDocument()
    expect(screen.getByText('not set — using the environment')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /let the assistant read aws/i })).not.toBeChecked()
    expect(screen.getByPlaceholderText('eu-central-1')).toHaveValue('')
    expect(screen.getByText('ecs:DescribeTasks')).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][0]).toContain('/api/admin/config/aws')
  })

  it('shows a saved region and key without revealing the key', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(configResponse({ enabled: true, region: 'eu-central-1', accessKeyConfigured: true }))

    render(<AdminAws token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('on')).toBeInTheDocument()
    expect(screen.getByText('configured')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('eu-central-1')).toHaveValue('eu-central-1')
    expect(screen.getByLabelText('Access key ID')).toHaveValue('')
  })

  it('turns the integration on', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(configResponse())
      .mockResolvedValueOnce(jsonResponse({ enabled: true }))
    const user = userEvent.setup()

    render(<AdminAws token="tok" onLogout={vi.fn()} />)
    await screen.findByText('off')
    await user.click(screen.getByRole('checkbox', { name: /let the assistant read aws/i }))
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0])

    expect(await screen.findByText('on')).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledTimes(2)
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/aws/enabled')
    expect(JSON.parse(options.body)).toEqual({ enabled: true })
  })

  it('saves the region', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(configResponse())
      .mockResolvedValueOnce(jsonResponse({ region: 'eu-west-1' }))
    const user = userEvent.setup()

    render(<AdminAws token="tok" onLogout={vi.fn()} />)
    await screen.findByText('off')
    await user.type(screen.getByPlaceholderText('eu-central-1'), 'eu-west-1')
    await user.click(screen.getAllByRole('button', { name: 'Save' })[1])

    expect(await screen.findByDisplayValue('eu-west-1')).toBeInTheDocument()
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/aws/region')
    expect(JSON.parse(options.body)).toEqual({ region: 'eu-west-1' })
  })

  it('shows the saved role and accounts', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(configResponse({ roleArn: ROLE_ARN, accounts: [{ name: 'prod', roleArn: READER_ARN }] }))

    render(<AdminAws token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByDisplayValue(ROLE_ARN)).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'prod' })).toBeInTheDocument()
    expect(screen.getByText(READER_ARN)).toBeInTheDocument()
  })

  it('saves the role to assume', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(configResponse())
      .mockResolvedValueOnce(jsonResponse({ roleArn: ROLE_ARN }))
    const user = userEvent.setup()

    render(<AdminAws token="tok" onLogout={vi.fn()} />)
    await screen.findByText('off')
    await user.type(screen.getByPlaceholderText('arn:aws:iam::123456789012:role/monitoring-hub'), ROLE_ARN)
    await user.click(screen.getAllByRole('button', { name: 'Save' })[2])

    expect(await screen.findByRole('button', { name: 'Remove' })).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledTimes(2)
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/aws/role-arn')
    expect(JSON.parse(options.body)).toEqual({ roleArn: ROLE_ARN })
  })

  it('saves the accounts and shows what the server kept', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(configResponse())
      .mockResolvedValueOnce(jsonResponse({ accounts: [{ name: 'prod', roleArn: READER_ARN }] }))
    const user = userEvent.setup()

    render(<AdminAws token="tok" onLogout={vi.fn()} />)
    await screen.findByText('off')
    await user.type(screen.getByLabelText('Account name'), 'prod')
    await user.type(screen.getByLabelText('Role ARN'), READER_ARN)
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await user.click(screen.getAllByRole('button', { name: 'Save' })[3])

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledTimes(2)
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/aws/accounts')
    expect(JSON.parse(options.body)).toEqual({ accounts: [{ name: 'prod', roleArn: READER_ARN }] })
  })

  it('saves an access key and shows it as configured', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(configResponse())
      .mockResolvedValueOnce(jsonResponse({ accessKeyConfigured: true }))
    const user = userEvent.setup()

    render(<AdminAws token="tok" onLogout={vi.fn()} />)
    await screen.findByText('off')
    await user.type(screen.getByLabelText('Access key ID'), 'AKIAIOSFODNN7EXAMPLE')
    await user.type(screen.getByLabelText('Secret access key'), 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')
    await user.click(screen.getByRole('button', { name: 'Save key' }))

    expect(await screen.findByText('configured')).toBeInTheDocument()
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/aws/access-key')
    expect(JSON.parse(options.body)).toEqual({
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    })
  })

  it('shows the error when the settings cannot be loaded', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: 'Failed to load the AWS settings.' }, 500))

    render(<AdminAws token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('Failed to load the AWS settings.')).toBeInTheDocument()
  })

  it('logs out on a 401 while loading', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: 'Unauthorized' }, 401))
    const onLogout = vi.fn()

    render(<AdminAws token="tok" onLogout={onLogout} />)

    await vi.waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1))
  })
})
