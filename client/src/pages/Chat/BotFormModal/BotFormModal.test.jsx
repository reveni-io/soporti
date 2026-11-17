import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BotAvatar from '../../../common/BotAvatar/BotAvatar.jsx'
import BotFormModal from './BotFormModal.jsx'

const TRIAGER = {
  id: 3,
  name: 'Ticket triager',
  description: 'Reviews the new Zendesk tickets.',
  profile: 'tech',
  avatarSeed: 'seed-3',
  unreadCount: 0,
}

function respond(body, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

function avatarSource(container) {
  return container.querySelector('img.bot-avatar').getAttribute('src')
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('BotFormModal', () => {
  it('creates a bot with the name, description, profile and avatar picked', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({ bot: { ...TRIAGER, id: 8 } }, 201))
    const onCreated = vi.fn()
    const user = userEvent.setup()
    render(<BotFormModal token="tok" onClose={vi.fn()} onCreated={onCreated} />)

    expect(screen.getByRole('dialog', { name: 'New bot' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create bot' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: /^support/i })).toBeChecked()

    await user.type(screen.getByRole('textbox', { name: 'Name' }), ' Ticket triager ')
    await user.type(screen.getByRole('textbox', { name: 'What is it for?' }), 'Reviews the new Zendesk tickets.')
    await user.click(screen.getByRole('radio', { name: /^tech/i }))
    await user.click(screen.getByRole('button', { name: 'Create bot' }))

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/bots')
    expect(options.method).toBe('POST')
    const body = JSON.parse(options.body)
    expect(body).toEqual({
      name: 'Ticket triager',
      description: 'Reviews the new Zendesk tickets.',
      profile: 'tech',
      avatarSeed: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
    expect(onCreated).toHaveBeenCalledTimes(1)
    expect(onCreated).toHaveBeenCalledWith({ ...TRIAGER, id: 8 })
  })

  it('shows that the bot is writing its greeting while it is created', async () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    render(<BotFormModal token="tok" onClose={vi.fn()} onCreated={vi.fn()} />)

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Triager')
    await user.type(screen.getByRole('textbox', { name: 'What is it for?' }), 'Tickets')
    await user.click(screen.getByRole('button', { name: 'Create bot' }))

    expect(screen.getByRole('status')).toHaveTextContent('Triager is writing its greeting…')
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled()
  })

  it('cannot create a bot without a description', async () => {
    const user = userEvent.setup()
    render(<BotFormModal token="tok" onClose={vi.fn()} onCreated={vi.fn()} />)

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Triager')
    await user.type(screen.getByRole('textbox', { name: 'What is it for?' }), '   ')

    expect(screen.getByRole('button', { name: 'Create bot' })).toBeDisabled()
  })

  it('shuffles the avatar and sends the new one', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({ bot: TRIAGER }, 201))
    const user = userEvent.setup()
    const { container } = render(<BotFormModal token="tok" onClose={vi.fn()} onCreated={vi.fn()} />)
    const before = avatarSource(container)

    await user.click(screen.getByRole('button', { name: 'Shuffle avatar' }))
    const after = avatarSource(container)
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Triager')
    await user.type(screen.getByRole('textbox', { name: 'What is it for?' }), 'Tickets')
    await user.click(screen.getByRole('button', { name: 'Create bot' }))

    const { avatarSeed } = JSON.parse(global.fetch.mock.calls[0][1].body)
    const { container: sent } = render(<BotAvatar seed={avatarSeed} size={64} />)
    expect(after).not.toBe(before)
    expect(avatarSource(sent)).toBe(after)
  })

  it('shows why the bot could not be created and stays open', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({ error: 'You can only have 10 bots.' }, 422))
    const onCreated = vi.fn()
    const user = userEvent.setup()
    render(<BotFormModal token="tok" onClose={vi.fn()} onCreated={onCreated} />)

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Triager')
    await user.type(screen.getByRole('textbox', { name: 'What is it for?' }), 'Tickets')
    await user.click(screen.getByRole('button', { name: 'Create bot' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('You can only have 10 bots.')
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('logs out when creating the bot answers 401', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({}, 401))
    const onLogout = vi.fn()
    const user = userEvent.setup()
    render(<BotFormModal token="tok" onClose={vi.fn()} onLogout={onLogout} onCreated={vi.fn()} />)

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Triager')
    await user.type(screen.getByRole('textbox', { name: 'What is it for?' }), 'Tickets')
    await user.click(screen.getByRole('button', { name: 'Create bot' }))

    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('edits a bot starting from what it has', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({ bot: { ...TRIAGER, name: 'Queue triager' } }))
    const onUpdated = vi.fn()
    const user = userEvent.setup()
    render(<BotFormModal bot={TRIAGER} token="tok" onClose={vi.fn()} onUpdated={onUpdated} />)

    expect(screen.getByRole('dialog', { name: 'Edit bot' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'What is it for?' })).toHaveValue('Reviews the new Zendesk tickets.')
    expect(screen.getByRole('radio', { name: /^tech/i })).toBeChecked()

    await user.clear(screen.getByRole('textbox', { name: 'Name' }))
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Queue triager')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/bots/3')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({
      name: 'Queue triager',
      description: 'Reviews the new Zendesk tickets.',
      profile: 'tech',
      avatarSeed: 'seed-3',
    })
    expect(onUpdated).toHaveBeenCalledTimes(1)
    expect(onUpdated).toHaveBeenCalledWith({ ...TRIAGER, name: 'Queue triager' })
  })

  it('offers no delete while creating a bot', () => {
    render(<BotFormModal token="tok" onClose={vi.fn()} onCreated={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Delete bot' })).not.toBeInTheDocument()
  })

  it('asks before deleting the bot', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({ ok: true }))
    const onDeleted = vi.fn()
    const user = userEvent.setup()
    render(<BotFormModal bot={TRIAGER} token="tok" onClose={vi.fn()} onDeleted={onDeleted} />)

    await user.click(screen.getByRole('button', { name: 'Delete bot' }))

    expect(screen.getByRole('group', { name: 'Delete this bot?' })).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/bots/3')
    expect(options.method).toBe('DELETE')
    expect(onDeleted).toHaveBeenCalledTimes(1)
    expect(onDeleted).toHaveBeenCalledWith(TRIAGER)
  })

  it('shows why the bot could not be deleted', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({}, 500))
    const onDeleted = vi.fn()
    const user = userEvent.setup()
    render(<BotFormModal bot={TRIAGER} token="tok" onClose={vi.fn()} onDeleted={onDeleted} />)

    await user.click(screen.getByRole('button', { name: 'Delete bot' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to delete the bot')
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('closes without saving', async () => {
    global.fetch = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<BotFormModal bot={TRIAGER} token="tok" onClose={onClose} onUpdated={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
