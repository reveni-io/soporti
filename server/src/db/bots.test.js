import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('drizzle-orm', async importOriginal => ({
  ...(await importOriginal()),
  and: (...preds) => ({ op: 'and', preds }),
  eq: (col, val) => ({ op: 'eq', col, val }),
}))

let queue = []
let calls = []

function makeChain(op) {
  const call = { op, steps: {} }
  calls.push(call)
  const chain = {
    from: () => chain,
    where: value => {
      call.steps.where = value
      return chain
    },
    orderBy: () => chain,
    limit: () => chain,
    set: value => {
      call.steps.set = value
      return chain
    },
    values: value => {
      call.steps.values = value
      return chain
    },
    returning: () => chain,
    then: (resolve, reject) => {
      const next = queue.shift()
      const promise = next instanceof Error ? Promise.reject(next) : Promise.resolve(next ?? [])
      return promise.then(resolve, reject)
    },
  }
  return chain
}

vi.mock('./index.js', () => ({
  getDb: () => ({
    select: () => makeChain('select'),
    insert: () => makeChain('insert'),
    update: () => makeChain('update'),
    delete: () => makeChain('delete'),
  }),
}))

const { bots } = await import('./schema.js')
const { listBots, countBots, getBot, createBot, updateBot, deleteBot, markBotRead, incrementBotUnread } =
  await import('./bots.js')

const OWNED_BOT = {
  op: 'and',
  preds: [
    { op: 'eq', col: bots.id, val: 4 },
    { op: 'eq', col: bots.userId, val: 7 },
  ],
}

const BOT_INPUT = { name: 'Triager', description: 'Triage tickets.', profile: 'support', avatarSeed: 'seed-1' }

beforeEach(() => {
  queue = []
  calls = []
})

describe('listBots', () => {
  it('returns the bots of the user', async () => {
    const rows = [{ id: 4, name: 'Triager' }]
    queue = [rows]

    expect(await listBots(7)).toEqual(rows)
    expect(calls[0].steps.where).toEqual({ op: 'eq', col: bots.userId, val: 7 })
  })
})

describe('countBots', () => {
  it('returns the total of the user, or 0 without a row', async () => {
    queue = [[{ total: 3 }], []]

    expect(await countBots(7)).toBe(3)
    expect(await countBots(7)).toBe(0)
  })
})

describe('getBot', () => {
  it('returns the bot when the user owns it', async () => {
    queue = [[{ id: 4, name: 'Triager' }]]

    expect(await getBot(4, 7)).toEqual({ id: 4, name: 'Triager' })
    expect(calls[0].steps.where).toEqual(OWNED_BOT)
  })

  it('returns null when it does not exist or is not owned', async () => {
    queue = [[]]

    expect(await getBot(4, 7)).toBeNull()
  })
})

describe('createBot', () => {
  it('inserts the bot for the user', async () => {
    queue = [[{ id: 4, ...BOT_INPUT }]]

    expect(await createBot(7, BOT_INPUT)).toEqual({ id: 4, ...BOT_INPUT })
    expect(calls[0].steps.values).toEqual({ userId: 7, ...BOT_INPUT })
  })
})

describe('updateBot', () => {
  it('updates the owned bot and stamps updatedAt', async () => {
    queue = [[{ id: 4, ...BOT_INPUT }]]

    expect(await updateBot(4, 7, BOT_INPUT)).toEqual({ id: 4, ...BOT_INPUT })
    expect(calls[0].steps.set).toMatchObject(BOT_INPUT)
    expect(calls[0].steps.set.updatedAt).toBeInstanceOf(Date)
    expect(calls[0].steps.where).toEqual(OWNED_BOT)
  })

  it('keeps the stored avatar when none is given', async () => {
    queue = [[{ id: 4 }]]

    await updateBot(4, 7, { ...BOT_INPUT, avatarSeed: null })

    expect(calls[0].steps.set).not.toHaveProperty('avatarSeed')
  })

  it('returns null when the bot is not owned', async () => {
    queue = [[]]

    expect(await updateBot(4, 7, BOT_INPUT)).toBeNull()
  })
})

describe('deleteBot', () => {
  it('reports whether an owned bot was deleted', async () => {
    queue = [[{ id: 4 }], []]

    expect(await deleteBot(4, 7)).toBe(true)
    expect(await deleteBot(4, 7)).toBe(false)
    expect(calls[0].steps.where).toEqual(OWNED_BOT)
  })
})

describe('markBotRead', () => {
  it('clears the unread count of an owned bot', async () => {
    queue = [[{ id: 4 }]]

    expect(await markBotRead(4, 7)).toBe(true)
    expect(calls[0].steps.set).toEqual({ unreadCount: 0 })
    expect(calls[0].steps.where).toEqual(OWNED_BOT)
  })

  it('returns false when the bot is not owned', async () => {
    queue = [[]]

    expect(await markBotRead(4, 7)).toBe(false)
  })
})

describe('incrementBotUnread', () => {
  it('adds one to the unread count of the bot', async () => {
    queue = [[]]

    await incrementBotUnread(4)

    expect(calls[0].op).toBe('update')
    expect(calls[0].steps.set.unreadCount).toBeDefined()
    expect(calls[0].steps.where).toEqual({ op: 'eq', col: bots.id, val: 4 })
  })
})
