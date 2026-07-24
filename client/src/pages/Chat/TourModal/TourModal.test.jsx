import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TourModal from './TourModal.jsx'

const github = { id: 'github', name: 'GitHub', description: 'Explore repositories' }
const notion = { id: 'notion', name: 'Notion', description: 'Search Notion' }
const helpjuice = { id: 'helpjuice', name: 'Helpjuice', description: 'Help center articles' }
const sentry = { id: 'sentry', name: 'Sentry', description: 'Inspect errors' }

const defaultProps = {
  integrations: [github, notion, sentry],
  onClose: vi.fn(),
  onTryExample: vi.fn(),
}

async function goToStep(user, title) {
  for (let i = 0; i < 10; i++) {
    if (screen.queryByText(title)) return
    await user.click(screen.getByText('Next'))
  }
  throw new Error(`Step "${title}" not found`)
}

describe('TourModal', () => {
  it('starts on the intro step', () => {
    render(<TourModal {...defaultProps} />)
    expect(screen.getByText('Meet Soporti')).toBeInTheDocument()
    expect(screen.queryByText('Back')).not.toBeInTheDocument()
  })

  it('navigates forward and backward through the steps', async () => {
    const user = userEvent.setup()
    render(<TourModal {...defaultProps} />)

    await user.click(screen.getByText('Next'))
    expect(screen.getByText('Choose where it looks')).toBeInTheDocument()

    await user.click(screen.getByText('Back'))
    expect(screen.getByText('Meet Soporti')).toBeInTheDocument()
  })

  it('only includes capability steps for configured integrations', () => {
    render(<TourModal {...defaultProps} integrations={[github]} />)
    // 3 general steps + code + tips
    expect(screen.getAllByLabelText(/go to step/i)).toHaveLength(5)
  })

  it('shows the integration chips of a capability step', async () => {
    const user = userEvent.setup()
    render(<TourModal {...defaultProps} />)

    await goToStep(user, 'Ask how the product works')
    expect(screen.getByText('GitHub')).toBeInTheDocument()
  })

  it('filters examples by configured integration', async () => {
    const user = userEvent.setup()
    render(<TourModal {...defaultProps} integrations={[github, notion, helpjuice]} />)

    await goToStep(user, 'Search the company docs')
    expect(screen.getByText(/Notion say about the customer onboarding/)).toBeInTheDocument()
    expect(screen.getByText(/help articles say about refunds/)).toBeInTheDocument()
    expect(screen.queryByText(/Google Drive/)).not.toBeInTheDocument()
  })

  it('calls onTryExample with the example text', async () => {
    const onTryExample = vi.fn()
    const user = userEvent.setup()
    render(<TourModal {...defaultProps} onTryExample={onTryExample} />)

    await goToStep(user, 'Ask how the product works')
    const example = 'How are webhook deliveries retried when the receiving server is down?'
    await user.click(screen.getByText(example))
    expect(onTryExample).toHaveBeenCalledWith(example)
  })

  it('mixes examples from both integrations of the data step', async () => {
    const postgres = { id: 'postgres', name: 'Database', description: 'Query the database' }
    const shopify = { id: 'shopify', name: 'Shopify', description: 'Query Shopify' }
    const user = userEvent.setup()
    render(<TourModal {...defaultProps} integrations={[github, postgres, shopify]} />)

    await goToStep(user, 'Look up live data')
    expect(screen.getByText(/active customers do we have/)).toBeInTheDocument()
    expect(screen.getByText(/order #12345 in Shopify/)).toBeInTheDocument()
  })

  it('shows Start asking on the last step and closes with it', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<TourModal {...defaultProps} onClose={onClose} />)

    await goToStep(user, 'A few tips before you start')
    expect(screen.queryByText('Next')).not.toBeInTheDocument()

    await user.click(screen.getByText('Start asking'))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<TourModal {...defaultProps} onClose={onClose} />)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on overlay click but not on modal click', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { container } = render(<TourModal {...defaultProps} onClose={onClose} />)

    await user.click(screen.getByText('Meet Soporti'))
    expect(onClose).not.toHaveBeenCalled()

    await user.click(container.querySelector('.tour-modal__overlay'))
    expect(onClose).toHaveBeenCalled()
  })

  it('jumps to a step through its dot', async () => {
    const user = userEvent.setup()
    render(<TourModal {...defaultProps} />)

    const dots = screen.getAllByLabelText(/go to step/i)
    await user.click(dots[dots.length - 1])
    expect(screen.getByText('A few tips before you start')).toBeInTheDocument()
  })
})
