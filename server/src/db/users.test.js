import { describe, it, expect, vi, beforeEach } from 'vitest'

// Chainable fake for drizzle's query builder: every chained method returns the
// same object, and awaiting it consumes the next queued result (or rejects if
// an Error was queued). One queued entry per executed query, in order.
let queue = []
let calls = []

function makeChain(op, arg) {
  const call = { op, arg, steps: {} }
  calls.push(call)
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => chain,
    orderBy: () => chain,
    set: v => {
      call.steps.set = v
      return chain
    },
    values: v => {
      call.steps.values = v
      return chain
    },
    returning: () => chain,
    onConflictDoUpdate: v => {
      call.steps.onConflict = v
      return chain
    },
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
    select: arg => makeChain('select', arg),
    update: arg => makeChain('update', arg),
    insert: arg => makeChain('insert', arg),
  }),
}))

const { upsertGoogleUser, findUserByEmail, createUserWithPassword, countAdmins, listUsers, setAdminCredentials } =
  await import('./users.js')

beforeEach(() => {
  queue = []
  calls = []
})

describe('upsertGoogleUser', () => {
  it('updates the profile when the googleId is already known', async () => {
    const existing = { id: 1, googleId: 'g-1', email: 'a@x.io', role: 'user' }
    const updated = { ...existing, name: 'Ada' }
    queue = [[existing], [updated]]

    const user = await upsertGoogleUser({ googleId: 'g-1', email: 'A@X.io', name: 'Ada', picture: null })

    expect(user).toEqual(updated)
    const update = calls.find(c => c.op === 'update')
    expect(update.steps.set.email).toBe('a@x.io')
    expect(update.steps.set).not.toHaveProperty('role')
  })

  it('links the googleId to an existing row with the same email', async () => {
    const byEmail = { id: 2, googleId: null, email: 'b@x.io', name: 'Bea', picture: null, role: 'admin' }
    const linked = { ...byEmail, googleId: 'g-2' }
    queue = [[], [byEmail], [linked]]

    const user = await upsertGoogleUser({ googleId: 'g-2', email: 'B@X.io', name: null, picture: 'pic.png' })

    expect(user).toEqual(linked)
    const update = calls.find(c => c.op === 'update')
    expect(update.steps.set.googleId).toBe('g-2')
    // Existing name is kept when Google doesn't provide one; role never changes.
    expect(update.steps.set.name).toBe('Bea')
    expect(update.steps.set.picture).toBe('pic.png')
    expect(update.steps.set).not.toHaveProperty('role')
  })

  it('inserts a new row with a normalized email when no match exists', async () => {
    const inserted = { id: 3, googleId: 'g-3', email: 'c@x.io', role: 'user' }
    queue = [[], [], [inserted]]

    const user = await upsertGoogleUser({ googleId: 'g-3', email: '  C@X.io ', name: 'Cid', picture: null })

    expect(user).toEqual(inserted)
    const insert = calls.find(c => c.op === 'insert')
    expect(insert.steps.values.email).toBe('c@x.io')
  })

  it('retries once when the insert hits a unique violation race', async () => {
    const raceErr = Object.assign(new Error('duplicate key'), { code: '23505' })
    const existing = { id: 4, googleId: 'g-4', email: 'd@x.io', role: 'user' }
    const updated = { ...existing, name: 'Dot' }
    // 1st attempt: no googleId, no email, insert fails; 2nd: found by googleId.
    queue = [[], [], raceErr, [existing], [updated]]

    const user = await upsertGoogleUser({ googleId: 'g-4', email: 'd@x.io', name: 'Dot', picture: null })

    expect(user).toEqual(updated)
  })

  it('propagates non-unique-violation insert errors', async () => {
    const dbErr = Object.assign(new Error('connection lost'), { code: '08006' })
    queue = [[], [], dbErr]

    await expect(upsertGoogleUser({ googleId: 'g-5', email: 'e@x.io', name: null, picture: null })).rejects.toThrow(
      'connection lost'
    )
  })
})

describe('findUserByEmail', () => {
  it('returns the row (including passwordHash) or null', async () => {
    const row = { id: 1, email: 'a@x.io', passwordHash: 'hash', role: 'user' }
    queue = [[row]]
    expect(await findUserByEmail(' A@X.io ')).toEqual(row)

    queue = [[]]
    expect(await findUserByEmail('missing@x.io')).toBeNull()
  })
})

describe('createUserWithPassword', () => {
  it('inserts with normalized email and defaults role to user', async () => {
    const created = { id: 5, email: 'f@x.io', role: 'user' }
    queue = [[created]]

    const user = await createUserWithPassword({ email: ' F@X.io ', name: null, passwordHash: 'hash' })

    expect(user).toEqual(created)
    const insert = calls.find(c => c.op === 'insert')
    expect(insert.steps.values).toMatchObject({ email: 'f@x.io', role: 'user', passwordHash: 'hash' })
  })
})

describe('countAdmins', () => {
  it('returns the admin count', async () => {
    queue = [[{ value: 2 }]]
    expect(await countAdmins()).toBe(2)

    queue = [[]]
    expect(await countAdmins()).toBe(0)
  })
})

describe('listUsers', () => {
  it('derives auth-method flags and never exposes the password hash', async () => {
    queue = [
      [
        {
          id: 1,
          email: 'a@x.io',
          name: 'Ada',
          role: 'admin',
          googleId: 'g-1',
          slackId: null,
          passwordHash: 'hash',
          createdAt: 'c',
          lastLoginAt: 'l',
        },
      ],
    ]

    const [user] = await listUsers()

    expect(user).toMatchObject({ email: 'a@x.io', hasGoogle: true, hasSlack: false, hasPassword: true })
    expect(user).not.toHaveProperty('passwordHash')
    expect(user).not.toHaveProperty('googleId')
  })

  it('exposes the slackId for Slack-only identities (used as a display label)', async () => {
    queue = [
      [
        {
          id: 2,
          email: null,
          name: null,
          role: 'user',
          googleId: null,
          slackId: 'U123',
          passwordHash: null,
          createdAt: 'c',
          lastLoginAt: 'l',
        },
      ],
    ]

    const [user] = await listUsers()

    expect(user).toMatchObject({ slackId: 'U123', hasSlack: true, hasGoogle: false, hasPassword: false })
  })
})

describe('setAdminCredentials', () => {
  it('promotes an existing row with the same email to admin', async () => {
    const existing = { id: 6, email: 'g@x.io', name: 'Gus', role: 'user' }
    const promoted = { ...existing, role: 'admin' }
    queue = [[existing], [promoted]]

    const user = await setAdminCredentials({ email: 'G@X.io', name: null, passwordHash: 'hash' })

    expect(user).toEqual(promoted)
    const update = calls.find(c => c.op === 'update')
    expect(update.steps.set).toMatchObject({ role: 'admin', passwordHash: 'hash', name: 'Gus' })
  })

  it('inserts a new admin row when the email does not exist', async () => {
    const created = { id: 7, email: 'h@x.io', role: 'admin' }
    queue = [[], [created]]

    const user = await setAdminCredentials({ email: 'h@x.io', name: 'Hal', passwordHash: 'hash' })

    expect(user).toEqual(created)
    const insert = calls.find(c => c.op === 'insert')
    expect(insert.steps.values).toMatchObject({ email: 'h@x.io', role: 'admin', passwordHash: 'hash', name: 'Hal' })
  })
})
