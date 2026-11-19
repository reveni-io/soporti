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
    expect(screen.queryByRole('navigation', { name: 'Bots' })).not.toBeInTheDocument()
  })

  it('shows why the bots could not be loaded', () => {
    render(<BotsPanel bots={[]} loading={false} error="Failed to load your bots" onCreate={vi.fn()} />, {
      wrapper: MemoryRouter,
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load your bots')
  })

  it('keeps listing the bots when a later refresh fails', () => {
    render(<BotsPanel bots={[TRIAGER]} loading={false} error="Failed to load your bots" onCreate={vi.fn()} />, {
      wrapper: MemoryRouter,
    })

    expect(screen.getByRole('link', { name: /ticket triager/i })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('says there are no bots yet', () => {
    render(<BotsPanel bots={[]} loading={false} error={null} onCreate={vi.fn()} />, { wrapper: MemoryRouter })

    expect(screen.getByText('No bots yet.')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('lists every bot with a link to its chat', () => {
    render(<BotsPanel bots={[TRIAGER, RELEASES]} loading={false} error={null} onCreate={vi.fn()} />, {
      wrapper: MemoryRouter,
    })

    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(2)
    expect(links[0]).toHaveAttribute('href', '/bots/3')
    expect(links[0]).toHaveTextContent('Ticket triager')
    expect(links[0]).toHaveTextContent('Reviews the new Zendesk tickets every morning.')
    expect(links[1]).toHaveAttribute('href', '/bots/4')
  })

  it('marks the open bot and keeps the others listed', () => {
    render(
      <MemoryRouter initialEntries={['/bots/4']}>
        <BotsPanel bots={[TRIAGER, RELEASES]} loading={false} error={null} onCreate={vi.fn()} isBotOpen />
      </MemoryRouter>
    )

    expect(screen.getByRole('link', { name: /release notes/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /ticket triager/i })).not.toHaveAttribute('aria-current')
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

  it('shows which bots are answering with a thinking face', () => {
    render(<BotsPanel bots={[TRIAGER, RELEASES]} busyBotIds={[4]} loading={false} error={null} onCreate={vi.fn()} />, {
      wrapper: MemoryRouter,
    })

    const busy = screen.getByRole('link', { name: /release notes/i })
    expect(busy).toHaveTextContent('Thinking…')
    expect(busy).not.toHaveTextContent('Writes the release notes from the merged PRs.')
    expect(busy.querySelector('svg.bot-avatar > g')).toHaveClass('mo-expr')
    expect(screen.getByRole('link', { name: /ticket triager/i })).not.toHaveTextContent('Thinking…')
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

  it('expands the collapsed sidebar from the header', async () => {
    const onExpandSidebar = vi.fn()
    const user = userEvent.setup()
    render(
      <BotsPanel
        bots={[]}
        loading={false}
        error={null}
        onCreate={vi.fn()}
        isSidebarCollapsed
        onExpandSidebar={onExpandSidebar}
      />,
      { wrapper: MemoryRouter }
    )

    await user.click(screen.getByRole('button', { name: 'Expand sidebar' }))

    expect(onExpandSidebar).toHaveBeenCalledTimes(1)
  })
})
