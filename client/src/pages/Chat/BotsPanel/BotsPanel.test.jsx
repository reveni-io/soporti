import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import BotsPanel from './BotsPanel.jsx'

const TRIAGER = {
  id: 3,
  name: 'Ticket triager',
  description: 'Reviews the new Zendesk tickets every morning.',
  profile: 'support',
  avatarSeed: 'seed-3',
  unreadCount: 0,
}

const RELEASES = {
  id: 4,
  name: 'Release notes',
  description: 'Writes the release notes from the merged PRs.',
  profile: 'tech',
  avatarSeed: 'seed-4',
  unreadCount: 2,
}

describe('BotsPanel', () => {
  it('shows a loading line while the bots load', () => {
    render(<BotsPanel bots={[]} loading error={null} onCreate={vi.fn()} />, { wrapper: MemoryRouter })

    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('shows why the bots could not be loaded', () => {
    render(<BotsPanel bots={[]} loading={false} error="Failed to load your bots" onCreate={vi.fn()} />, {
      wrapper: MemoryRouter,
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load your bots')
  })

  it('keeps showing the bots when a later refresh fails', () => {
    render(<BotsPanel bots={[TRIAGER]} loading={false} error="Failed to load your bots" onCreate={vi.fn()} />, {
      wrapper: MemoryRouter,
    })

    expect(screen.getByRole('link', { name: /ticket triager/i })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('explains what a bot is when there are none and offers to create one', async () => {
    const onCreate = vi.fn()
    const user = userEvent.setup()
    render(<BotsPanel bots={[]} loading={false} error={null} onCreate={onCreate} />, { wrapper: MemoryRouter })

    expect(screen.getByRole('heading', { name: 'Your own assistants' })).toBeInTheDocument()
    expect(screen.getByText(/private assistant with a job you describe/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Create a bot' }))

    expect(onCreate).toHaveBeenCalledTimes(1)
  })

  it('lists each bot as a card linking to its chat', () => {
    render(<BotsPanel bots={[TRIAGER, RELEASES]} loading={false} error={null} onCreate={vi.fn()} />, {
      wrapper: MemoryRouter,
    })

    const triager = screen.getByRole('link', { name: /ticket triager/i })
    expect(triager).toHaveAttribute('href', '/bots/3')
    expect(triager).toHaveTextContent('Reviews the new Zendesk tickets every morning.')
    expect(screen.getByRole('link', { name: /release notes/i })).toHaveAttribute('href', '/bots/4')
  })

  it('draws each bot with its own animated avatar style', () => {
    const sunny = { ...TRIAGER, avatarStyle: { shape: 'sun', hue: 55, tone: 'bright' } }
    render(<BotsPanel bots={[sunny, RELEASES]} loading={false} error={null} onCreate={vi.fn()} />, {
      wrapper: MemoryRouter,
    })

    const avatar = screen.getByRole('link', { name: /ticket triager/i }).querySelector('svg.bot-avatar')
    expect(avatar.querySelectorAll('circle').length).toBeGreaterThanOrEqual(6)
    expect(avatar.querySelector('g')).toHaveClass('mo-always')
    expect(screen.getByRole('link', { name: /release notes/i }).querySelector('svg.bot-avatar')).toBeInTheDocument()
  })

  it('marks the bots with something new', () => {
    render(<BotsPanel bots={[TRIAGER, RELEASES]} loading={false} error={null} onCreate={vi.fn()} />, {
      wrapper: MemoryRouter,
    })

    expect(screen.getByLabelText('2 new')).toHaveTextContent('2')
    expect(screen.getAllByText(/^\d+$/)).toHaveLength(1)
  })

  it('creates a bot from the header', async () => {
    const onCreate = vi.fn()
    const user = userEvent.setup()
    render(<BotsPanel bots={[TRIAGER]} loading={false} error={null} onCreate={onCreate} />, { wrapper: MemoryRouter })

    await user.click(screen.getByRole('button', { name: 'New bot' }))

    expect(onCreate).toHaveBeenCalledTimes(1)
  })

  it('opens the sidebar from the header', async () => {
    const onOpenSidebar = vi.fn()
    const user = userEvent.setup()
    render(<BotsPanel bots={[]} loading={false} error={null} onCreate={vi.fn()} onOpenSidebar={onOpenSidebar} />, {
      wrapper: MemoryRouter,
    })

    await user.click(screen.getByRole('button', { name: 'Open sidebar' }))

    expect(onOpenSidebar).toHaveBeenCalledTimes(1)
  })
})
