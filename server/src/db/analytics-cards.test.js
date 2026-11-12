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
    where: condition => {
      call.steps.where = condition
      return chain
    },
    orderBy: (...order) => {
      call.steps.orderBy = order
      return chain
    },
    limit: () => chain,
    set: v => {
      call.steps.set = v
      return chain
    },
    values: v => {
      call.steps.values = v
      return chain
    },
    returning: columns => {
      call.steps.returning = columns
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

const handle = {
  select: () => makeChain('select'),
  insert: table => makeChain('insert', table),
  update: table => makeChain('update', table),
  delete: table => makeChain('delete', table),
  transaction: vi.fn(fn => fn(handle)),
}

vi.mock('./index.js', () => ({ getDb: () => handle }))

const {
  listCards,
  listCardLayouts,
  countCards,
  getCard,
  getCardDashboardId,
  createCard,
  claimCard,
  saveGeneratedChart,
  failCard,
  setCardStep,
  updateCard,
  saveCardLayouts,
  deleteCard,
  failInterruptedCards,
} = await import('./analytics-cards.js')

const CARD_ID = '8c1d2e3f-4a5b-4c6d-9e7f-a0b1c2d3e4f5'
const OTHER_ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601'
const DASHBOARD_ID = '5b0c9d1e-2f3a-4b4c-8d5e-6f7a8b9c0d1e'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const CARD_FIELDS = [
  'id',
  'title',
  'prompt',
  'sql',
  'chart',
  'layout',
  'status',
  'step',
  'error',
  'createdAt',
  'updatedAt',
]
const LAYOUT = { x: 0, y: 0, w: 6, h: 4 }
const CHART = {
  type: 'bar',
  xKey: 'week',
  groupKey: null,
  series: [{ key: 'returns', label: 'Returns' }],
  stacked: false,
}
const QUERY = 'SELECT week, returns FROM weekly_returns'
const ROW = { id: CARD_ID, title: 'Returns per week', status: 'ready', sql: QUERY, chart: CHART, layout: LAYOUT }
const GENERATING = '("analytics_cards"."id" = $1 and "analytics_cards"."status" = $2)'

const dialect = new PgDialect()

function render(expression) {
  const { sql, params } = dialect.sqlToQuery(expression)

  return { sql, params }
}

function inAccessibleDashboard(firstParam) {
  return `"analytics_cards"."dashboard_id" in (select "analytics_dashboards"."id" from "analytics_dashboards" where ("analytics_dashboards"."user_id" = $${firstParam} or "analytics_dashboards"."shared" = $${firstParam + 1}))`
}

const ACCESSIBLE_CARD = `("analytics_cards"."id" = $1 and ${inAccessibleDashboard(2)})`
const DASHBOARD_CARDS = `("analytics_cards"."dashboard_id" = $1 and ${inAccessibleDashboard(2)})`

beforeEach(() => {
  vi.clearAllMocks()
  queue = []
  calls = []
})

describe('listCards', () => {
  it('lists the cards of a dashboard the user can open, in the API shape, oldest first', async () => {
    queue = [[ROW]]

    expect(await listCards(DASHBOARD_ID, 7)).toEqual([ROW])
    expect(calls).toHaveLength(1)
    expect(calls[0].target).toBe('analytics_cards')
    expect(render(calls[0].steps.where)).toEqual({ sql: DASHBOARD_CARDS, params: [DASHBOARD_ID, 7, true] })
    expect(calls[0].steps.orderBy.map(expression => render(expression).sql)).toEqual([
      '"analytics_cards"."created_at" asc',
      '"analytics_cards"."id" asc',
    ])
  })
})

describe('listCardLayouts', () => {
  it('returns the grid position of every card of the dashboard', async () => {
    queue = [[{ layout: LAYOUT }, { layout: { x: 6, y: 0, w: 6, h: 4 } }]]

    expect(await listCardLayouts(DASHBOARD_ID, 7)).toEqual([LAYOUT, { x: 6, y: 0, w: 6, h: 4 }])
    expect(render(calls[0].steps.where)).toEqual({ sql: DASHBOARD_CARDS, params: [DASHBOARD_ID, 7, true] })
  })
})

describe('countCards', () => {
  it('counts the cards of the dashboard and how many are generating', async () => {
    queue = [[{ total: 12, generating: 2 }]]

    expect(await countCards(DASHBOARD_ID, 7)).toEqual({ total: 12, generating: 2 })
    expect(calls[0].target).toBe('analytics_cards')
    expect(render(calls[0].steps.where)).toEqual({ sql: DASHBOARD_CARDS, params: [DASHBOARD_ID, 7, true] })
  })

  it('counts zero when the query returns nothing', async () => {
    queue = [[]]

    expect(await countCards(DASHBOARD_ID, 7)).toEqual({ total: 0, generating: 0 })
  })
})

describe('getCard', () => {
  it('returns a card of a dashboard the user owns or that is shared', async () => {
    queue = [[ROW]]

    expect(await getCard(CARD_ID, 7)).toEqual(ROW)
    expect(render(calls[0].steps.where)).toEqual({ sql: ACCESSIBLE_CARD, params: [CARD_ID, 7, true] })
  })

  it('returns null when the card is missing or its dashboard is private to someone else', async () => {
    queue = [[]]

    expect(await getCard(CARD_ID, 9)).toBeNull()
    expect(render(calls[0].steps.where).params).toEqual([CARD_ID, 9, true])
  })
})

describe('getCardDashboardId', () => {
  it('returns the dashboard of a card the user can open', async () => {
    queue = [[{ dashboardId: DASHBOARD_ID }]]

    expect(await getCardDashboardId(CARD_ID, 7)).toBe(DASHBOARD_ID)
    expect(render(calls[0].steps.where)).toEqual({ sql: ACCESSIBLE_CARD, params: [CARD_ID, 7, true] })
  })

  it('returns null when the card is missing or not accessible', async () => {
    queue = [[]]

    expect(await getCardDashboardId(CARD_ID, 9)).toBeNull()
  })
})

describe('createCard', () => {
  it('inserts a generating card in the dashboard and returns it in the API shape', async () => {
    const created = { ...ROW, status: 'generating', step: 'Starting', sql: null, chart: null }
    queue = [[created]]

    const card = await createCard(DASHBOARD_ID, {
      title: 'Returns per week',
      prompt: 'Returns per week',
      layout: LAYOUT,
    })

    expect(card).toEqual(created)
    expect(calls).toHaveLength(1)
    expect(calls[0].target).toBe('analytics_cards')
    expect(calls[0].steps.values).toEqual({
      id: expect.stringMatching(UUID_RE),
      dashboardId: DASHBOARD_ID,
      title: 'Returns per week',
      prompt: 'Returns per week',
      layout: LAYOUT,
      status: 'generating',
      step: 'Starting',
    })
    expect(Object.keys(calls[0].steps.returning)).toEqual(CARD_FIELDS)
  })
})

describe('claimCard', () => {
  it('moves an accessible card in one of the given statuses to generating with the new prompt', async () => {
    const claimed = { ...ROW, status: 'generating', step: 'Starting', prompt: 'Make it monthly' }
    queue = [[claimed]]

    const card = await claimCard(CARD_ID, 7, { from: ['ready', 'failed'], prompt: 'Make it monthly' })

    expect(card).toEqual(claimed)
    expect(render(calls[0].steps.where)).toEqual({
      sql: `(${ACCESSIBLE_CARD} and "analytics_cards"."status" in ($4, $5))`,
      params: [CARD_ID, 7, true, 'ready', 'failed'],
    })
    expect(calls[0].steps.set).toEqual({
      status: 'generating',
      step: 'Starting',
      error: null,
      prompt: 'Make it monthly',
      updatedAt: expect.any(Date),
    })
    expect(Object.keys(calls[0].steps.returning)).toEqual(CARD_FIELDS)
  })

  it('keeps the prompt of the card when none is given', async () => {
    queue = [[{ ...ROW, status: 'generating' }]]

    await claimCard(CARD_ID, 7, { from: ['failed'] })

    expect(render(calls[0].steps.where).params).toEqual([CARD_ID, 7, true, 'failed'])
    expect(calls[0].steps.set).not.toHaveProperty('prompt')
  })

  it('returns null when the card is missing, not accessible or in another status', async () => {
    queue = [[]]

    expect(await claimCard(CARD_ID, 9, { from: ['failed'] })).toBeNull()
  })
})

describe('the writes of a running generation', () => {
  it('stores the chart of a generating card and makes it ready, whoever can see its dashboard by then', async () => {
    queue = [[{ id: CARD_ID }]]

    const saved = await saveGeneratedChart(CARD_ID, { title: 'Returns per week', sql: QUERY, chart: CHART })

    expect(saved).toBe(true)
    expect(render(calls[0].steps.where)).toEqual({ sql: GENERATING, params: [CARD_ID, 'generating'] })
    expect(calls[0].steps.set).toEqual({
      title: 'Returns per week',
      sql: QUERY,
      chart: CHART,
      status: 'ready',
      step: null,
      error: null,
      updatedAt: expect.any(Date),
    })
  })

  it('fails a generating card with the error and keeps its query and chart', async () => {
    queue = [[{ id: CARD_ID }]]

    expect(await failCard(CARD_ID, 'Try again.')).toBe(true)
    expect(render(calls[0].steps.where)).toEqual({ sql: GENERATING, params: [CARD_ID, 'generating'] })
    expect(calls[0].steps.set).toEqual({
      status: 'failed',
      step: null,
      error: 'Try again.',
      updatedAt: expect.any(Date),
    })
  })

  it('stores the step of a generating card', async () => {
    queue = [[{ id: CARD_ID }]]

    expect(await setCardStep(CARD_ID, 'Trying a query')).toBe(true)
    expect(render(calls[0].steps.where)).toEqual({ sql: GENERATING, params: [CARD_ID, 'generating'] })
    expect(calls[0].steps.set).toEqual({ step: 'Trying a query', updatedAt: expect.any(Date) })
  })

  it.each([
    { write: 'saveGeneratedChart', run: () => saveGeneratedChart(CARD_ID, { title: 'T', sql: QUERY, chart: CHART }) },
    { write: 'failCard', run: () => failCard(CARD_ID, 'Try again.') },
    { write: 'setCardStep', run: () => setCardStep(CARD_ID, 'Trying a query') },
  ])('$write returns false when the card is gone or no longer generating', async ({ run }) => {
    queue = [[]]

    expect(await run()).toBe(false)
  })
})

describe('updateCard', () => {
  it('saves a new query with its chart, makes the card ready and clears its error', async () => {
    queue = [[ROW]]

    const card = await updateCard(CARD_ID, 7, { title: 'Weekly returns', sql: QUERY, chart: CHART })

    expect(card).toEqual(ROW)
    expect(render(calls[0].steps.where)).toEqual({
      sql: `(${ACCESSIBLE_CARD} and "analytics_cards"."status" <> $4)`,
      params: [CARD_ID, 7, true, 'generating'],
    })
    expect(calls[0].steps.set).toEqual({
      title: 'Weekly returns',
      sql: QUERY,
      chart: CHART,
      status: 'ready',
      error: null,
      updatedAt: expect.any(Date),
    })
    expect(Object.keys(calls[0].steps.returning)).toEqual(CARD_FIELDS)
  })

  it('makes the card ready only when it already has a query if the edit brings none', async () => {
    queue = [[ROW]]

    await updateCard(CARD_ID, 7, { title: 'Weekly returns' })

    const { set } = calls[0].steps
    expect(set.title).toBe('Weekly returns')
    expect(set).not.toHaveProperty('sql')
    expect(render(set.status)).toEqual({
      sql: 'case when "analytics_cards"."sql" is null then "analytics_cards"."status" else $1 end',
      params: ['ready'],
    })
    expect(render(set.error).sql).toBe(
      'case when "analytics_cards"."sql" is null then "analytics_cards"."error" else null end'
    )
  })

  it('returns null when the card is missing, not accessible or generating', async () => {
    queue = [[]]

    expect(await updateCard(CARD_ID, 9, { title: 'Weekly returns' })).toBeNull()
  })
})

describe('saveCardLayouts', () => {
  it('stores every position in one transaction, only for the cards of that dashboard', async () => {
    await saveCardLayouts(DASHBOARD_ID, 7, [
      { id: CARD_ID, x: 0, y: 0, w: 6, h: 4 },
      { id: OTHER_ID, x: 6, y: 0, w: 6, h: 8 },
    ])

    expect(handle.transaction).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(2)
    expect(calls[0].steps.set).toEqual({ layout: { x: 0, y: 0, w: 6, h: 4 } })
    expect(render(calls[0].steps.where)).toEqual({
      sql: `("analytics_cards"."id" = $1 and ("analytics_cards"."dashboard_id" = $2 and ${inAccessibleDashboard(3)}))`,
      params: [CARD_ID, DASHBOARD_ID, 7, true],
    })
    expect(calls[1].steps.set).toEqual({ layout: { x: 6, y: 0, w: 6, h: 8 } })
    expect(render(calls[1].steps.where).params).toEqual([OTHER_ID, DASHBOARD_ID, 7, true])
  })

  it('writes nothing for an empty list', async () => {
    await saveCardLayouts(DASHBOARD_ID, 7, [])

    expect(calls).toHaveLength(0)
  })
})

describe('deleteCard', () => {
  it('deletes a card of a dashboard the user can open', async () => {
    queue = [[{ id: CARD_ID }]]

    expect(await deleteCard(CARD_ID, 7)).toBe(true)
    expect(calls[0].op).toBe('delete')
    expect(render(calls[0].steps.where)).toEqual({ sql: ACCESSIBLE_CARD, params: [CARD_ID, 7, true] })
  })

  it('returns false when the card is missing or not accessible', async () => {
    queue = [[]]

    expect(await deleteCard(CARD_ID, 9)).toBe(false)
  })
})

describe('failInterruptedCards', () => {
  it('fails every generating card and counts them', async () => {
    queue = [[{ id: CARD_ID }, { id: OTHER_ID }]]

    expect(await failInterruptedCards('Interrupted.')).toBe(2)
    expect(render(calls[0].steps.where)).toEqual({ sql: '"analytics_cards"."status" = $1', params: ['generating'] })
    expect(calls[0].steps.set).toEqual({
      status: 'failed',
      step: null,
      error: 'Interrupted.',
      updatedAt: expect.any(Date),
    })
  })
})
