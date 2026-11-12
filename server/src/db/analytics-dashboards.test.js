import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

let queue = []
let calls = []

function tableName(ref) {
  return ref?.[Symbol.for('drizzle:Name')] ?? null
}

function makeChain(op, target) {
  const call = { op, target: tableName(target), steps: {} }
  calls.push(call)
  const chain = {
    from: table => {
      call.target = tableName(table)
      return chain
    },
    innerJoin: (table, on) => {
      call.steps.join = { table: tableName(table), on }
      return chain
    },
    where: condition => {
      call.steps.where = condition
      return chain
    },
    orderBy: (...order) => {
      call.steps.orderBy = order
      return chain
    },
    limit: () => chain,
    for: strength => {
      call.steps.lock = strength
      return chain
    },
    set: v => {
      call.steps.set = v
      return chain
    },
    values: v => {
      call.steps.values = v
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

const handle = {
  select: columns => {
    const chain = makeChain('select')
    calls.at(-1).steps.columns = columns
    return chain
  },
  insert: table => makeChain('insert', table),
  update: table => makeChain('update', table),
  delete: table => makeChain('delete', table),
  transaction: vi.fn(fn => fn(handle)),
}

vi.mock('./index.js', () => ({ getDb: () => handle }))

const { analyticsCards } = await import('./schema.js')
const {
  inAccessibleDashboard,
  listDashboards,
  getDashboard,
  countDashboards,
  createDashboard,
  ensureDashboard,
  updateDashboard,
  deleteDashboard,
} = await import('./analytics-dashboards.js')

const DASHBOARD_ID = '5b0c9d1e-2f3a-4b4c-8d5e-6f7a8b9c0d1e'
const CARD_ID = '8c1d2e3f-4a5b-4c6d-9e7f-a0b1c2d3e4f5'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const DASHBOARD_FIELDS = ['id', 'name', 'shared', 'isOwner', 'ownerName', 'createdAt', 'updatedAt']
const OWNED = '("analytics_dashboards"."id" = $1 and "analytics_dashboards"."user_id" = $2)'
const ROW = {
  id: DASHBOARD_ID,
  name: 'Returns overview',
  shared: false,
  isOwner: true,
  ownerName: 'Sergio Zamarro',
  createdAt: '2026-11-12T10:00:00.000Z',
  updatedAt: '2026-11-12T10:00:00.000Z',
}

const dialect = new PgDialect()

function render(expression) {
  const { sql, params } = dialect.sqlToQuery(expression)

  return { sql, params }
}

beforeEach(() => {
  vi.clearAllMocks()
  queue = []
  calls = []
})

describe('inAccessibleDashboard', () => {
  it('matches the dashboards the user owns and the ones shared with the team, and nothing else', () => {
    expect(render(inAccessibleDashboard(analyticsCards.dashboardId, 7))).toEqual({
      sql: '"analytics_cards"."dashboard_id" in (select "analytics_dashboards"."id" from "analytics_dashboards" where ("analytics_dashboards"."user_id" = $1 or "analytics_dashboards"."shared" = $2))',
      params: [7, true],
    })
  })
})

describe('listDashboards', () => {
  it('lists the dashboards the user can open, in the API shape, with the owner joined', async () => {
    queue = [[ROW]]

    expect(await listDashboards(7)).toEqual([ROW])
    expect(calls).toHaveLength(1)
    expect(calls[0].target).toBe('analytics_dashboards')
    expect(Object.keys(calls[0].steps.columns)).toEqual(DASHBOARD_FIELDS)
    expect(calls[0].steps.join.table).toBe('users')
    expect(render(calls[0].steps.join.on).sql).toBe('"users"."id" = "analytics_dashboards"."user_id"')
    expect(render(calls[0].steps.where)).toEqual({
      sql: '("analytics_dashboards"."user_id" = $1 or "analytics_dashboards"."shared" = $2)',
      params: [7, true],
    })
  })

  it('tells whether the caller is the owner and names the owner, falling back to their email', async () => {
    queue = [[ROW]]

    await listDashboards(7)

    const { isOwner, ownerName } = calls[0].steps.columns
    expect(render(isOwner)).toEqual({ sql: '"analytics_dashboards"."user_id" = $1', params: [7] })
    expect(render(ownerName).sql).toBe(`coalesce(nullif("users"."name", ''), "users"."email", '')`)
  })

  it('puts the own dashboards first, oldest first, then the shared ones by name', async () => {
    queue = [[]]

    await listDashboards(7)

    expect(calls[0].steps.orderBy.map(expression => render(expression).sql)).toEqual([
      '"analytics_dashboards"."user_id" = $1 desc',
      'case when "analytics_dashboards"."user_id" = $1 then "analytics_dashboards"."created_at" end',
      'lower("analytics_dashboards"."name") asc',
      '"analytics_dashboards"."id" asc',
    ])
  })
})

describe('getDashboard', () => {
  it('returns a dashboard the user owns or that is shared', async () => {
    queue = [[{ ...ROW, shared: true, isOwner: false }]]

    expect(await getDashboard(DASHBOARD_ID, 9)).toEqual({ ...ROW, shared: true, isOwner: false })
    expect(render(calls[0].steps.where)).toEqual({
      sql: '("analytics_dashboards"."id" = $1 and ("analytics_dashboards"."user_id" = $2 or "analytics_dashboards"."shared" = $3))',
      params: [DASHBOARD_ID, 9, true],
    })
  })

  it('returns null when the dashboard is missing or private to someone else', async () => {
    queue = [[]]

    expect(await getDashboard(DASHBOARD_ID, 9)).toBeNull()
  })
})

describe('countDashboards', () => {
  it('counts the dashboards the user owns, not the ones shared with them', async () => {
    queue = [[{ total: 3 }]]

    expect(await countDashboards(7)).toBe(3)
    expect(render(calls[0].steps.where)).toEqual({ sql: '"analytics_dashboards"."user_id" = $1', params: [7] })
  })

  it('counts zero when the query returns nothing', async () => {
    queue = [[]]

    expect(await countDashboards(7)).toBe(0)
  })
})

describe('createDashboard', () => {
  it('inserts a private dashboard for the user and returns it in the API shape', async () => {
    queue = [[], [ROW]]

    const dashboard = await createDashboard(7, 'Returns overview')

    expect(dashboard).toEqual(ROW)
    expect(calls).toHaveLength(2)
    expect(calls[0].op).toBe('insert')
    expect(calls[0].target).toBe('analytics_dashboards')
    expect(calls[0].steps.values).toEqual({
      id: expect.stringMatching(UUID_RE),
      userId: 7,
      name: 'Returns overview',
    })
    expect(render(calls[1].steps.where).params).toEqual([calls[0].steps.values.id, 7, true])
  })
})

describe('ensureDashboard', () => {
  it('creates the first dashboard of a user who has none', async () => {
    queue = [[{ id: 7 }], [], []]

    await ensureDashboard(7)

    expect(handle.transaction).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(3)
    expect(calls[2].op).toBe('insert')
    expect(calls[2].steps.values).toEqual({ id: expect.stringMatching(UUID_RE), userId: 7, name: 'My dashboard' })
  })

  it('locks the row of the user first, so two concurrent first requests cannot both create one', async () => {
    queue = [[{ id: 7 }], [], []]

    await ensureDashboard(7)

    expect(calls[0].target).toBe('users')
    expect(calls[0].steps.lock).toBe('update')
    expect(render(calls[0].steps.where)).toEqual({ sql: '"users"."id" = $1', params: [7] })
    expect(calls[1].target).toBe('analytics_dashboards')
    expect(render(calls[1].steps.where)).toEqual({ sql: '"analytics_dashboards"."user_id" = $1', params: [7] })
  })

  it('creates nothing when the user already has a dashboard', async () => {
    queue = [[{ id: 7 }], [{ id: DASHBOARD_ID }]]

    await ensureDashboard(7)

    expect(calls).toHaveLength(2)
    expect(calls.some(call => call.op === 'insert')).toBe(false)
  })
})

describe('updateDashboard', () => {
  it('renames or shares a dashboard of its owner and returns it in the API shape', async () => {
    queue = [[{ id: DASHBOARD_ID }], [{ ...ROW, name: 'Refunds', shared: true }]]

    const dashboard = await updateDashboard(DASHBOARD_ID, 7, { name: 'Refunds', shared: true })

    expect(dashboard).toEqual({ ...ROW, name: 'Refunds', shared: true })
    expect(calls[0].op).toBe('update')
    expect(calls[0].steps.set).toEqual({ name: 'Refunds', shared: true, updatedAt: expect.any(Date) })
    expect(render(calls[0].steps.where)).toEqual({ sql: OWNED, params: [DASHBOARD_ID, 7] })
  })

  it('changes nothing for someone who is not the owner, even on a shared dashboard', async () => {
    queue = [[]]

    expect(await updateDashboard(DASHBOARD_ID, 9, { shared: false })).toBeNull()
    expect(calls).toHaveLength(1)
    expect(render(calls[0].steps.where)).toEqual({ sql: OWNED, params: [DASHBOARD_ID, 9] })
  })
})

describe('deleteDashboard', () => {
  it('deletes a dashboard of its owner and returns the cards that were generating', async () => {
    queue = [[{ id: CARD_ID }], [{ id: DASHBOARD_ID }]]

    expect(await deleteDashboard(DASHBOARD_ID, 7)).toEqual([CARD_ID])
    expect(calls[0].target).toBe('analytics_cards')
    expect(render(calls[0].steps.where)).toEqual({
      sql: '("analytics_cards"."dashboard_id" = $1 and "analytics_cards"."status" = $2)',
      params: [DASHBOARD_ID, 'generating'],
    })
    expect(calls[1].op).toBe('delete')
    expect(calls[1].target).toBe('analytics_dashboards')
    expect(render(calls[1].steps.where)).toEqual({ sql: OWNED, params: [DASHBOARD_ID, 7] })
  })

  it('returns an empty list when no card was generating', async () => {
    queue = [[], [{ id: DASHBOARD_ID }]]

    expect(await deleteDashboard(DASHBOARD_ID, 7)).toEqual([])
  })

  it('deletes nothing and returns null for someone who is not the owner', async () => {
    queue = [[{ id: CARD_ID }], []]

    expect(await deleteDashboard(DASHBOARD_ID, 9)).toBeNull()
    expect(render(calls[1].steps.where)).toEqual({ sql: OWNED, params: [DASHBOARD_ID, 9] })
  })
})
