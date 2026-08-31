import { describe, it, expect, vi, beforeEach } from 'vitest'
import { asc, eq } from 'drizzle-orm'
import { subagents } from './schema.js'

let queue = []
let calls = []

function makeChain(op) {
  const call = { op, steps: {} }
  calls.push(call)
  const chain = {
    from: () => chain,
    where: condition => {
      call.steps.where = condition
      return chain
    },
    orderBy: order => {
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

const { listSubagents, listEnabledSubagents, getSubagentById, createSubagent, updateSubagent, deleteSubagent } =
  await import('./subagents.js')

const INPUT = {
  name: 'code_investigator',
  description: 'Owns the codebase.',
  instructions: 'Read code and report findings.',
  provider: 'anthropic',
  model: 'claude-sonnet-5',
  tools: ['search_code'],
  exclusive: true,
  enabled: true,
}

beforeEach(() => {
  queue = []
  calls = []
})

describe('listSubagents', () => {
  it('returns every row ordered by name, without scoping to an owner', async () => {
    const rows = [{ id: 1, name: 'code_investigator' }]
    queue = [rows]

    expect(await listSubagents()).toEqual(rows)
    const [select] = calls
    expect(select.steps.orderBy).toEqual(asc(subagents.name))
    expect(select.steps.where).toBeUndefined()
  })
})

describe('listEnabledSubagents', () => {
  it('returns only the enabled rows, ordered by name', async () => {
    const rows = [{ id: 2, name: 'context_gatherer', enabled: true }]
    queue = [rows]

    expect(await listEnabledSubagents()).toEqual(rows)
    const [select] = calls
    expect(select.steps.where).toEqual(eq(subagents.enabled, true))
    expect(select.steps.orderBy).toEqual(asc(subagents.name))
  })
})

describe('getSubagentById', () => {
  it('returns the row when found', async () => {
    const row = { id: 1, name: 'code_investigator' }
    queue = [[row]]

    expect(await getSubagentById(1)).toEqual(row)
    expect(calls[0].steps.where).toEqual(eq(subagents.id, 1))
  })

  it('returns null when no row matches', async () => {
    queue = [[]]
    expect(await getSubagentById(99)).toBeNull()
  })
})

describe('createSubagent', () => {
  it('inserts the row it was given and returns it', async () => {
    const created = { id: 1, ...INPUT }
    queue = [[created]]

    expect(await createSubagent(INPUT)).toEqual(created)
    const insert = calls.find(c => c.op === 'insert')
    expect(insert.steps.values).toEqual(INPUT)
  })

  it('stores an inheriting subagent with a null provider and model', async () => {
    queue = [[{ id: 1 }]]

    await createSubagent({ ...INPUT, provider: undefined, model: undefined })

    const insert = calls.find(c => c.op === 'insert')
    expect(insert.steps.values.provider).toBeNull()
    expect(insert.steps.values.model).toBeNull()
  })

  it('propagates a unique-violation error unchanged', async () => {
    queue = [Object.assign(new Error('duplicate key'), { code: '23505' })]

    await expect(createSubagent(INPUT)).rejects.toMatchObject({ code: '23505' })
  })
})

describe('updateSubagent', () => {
  it('returns the updated row and stamps updatedAt', async () => {
    const updated = { id: 1, ...INPUT, description: 'Owns the codebase and Sentry.' }
    queue = [[updated]]

    expect(await updateSubagent(1, { ...INPUT, description: 'Owns the codebase and Sentry.' })).toEqual(updated)
    const update = calls.find(c => c.op === 'update')
    expect(update.steps.set).toMatchObject({ name: INPUT.name, description: 'Owns the codebase and Sentry.' })
    expect(update.steps.set.updatedAt).toBeInstanceOf(Date)
    expect(update.steps.where).toEqual(eq(subagents.id, 1))
  })

  it('returns null when no row matches', async () => {
    queue = [[]]
    expect(await updateSubagent(99, INPUT)).toBeNull()
  })
})

describe('deleteSubagent', () => {
  it('returns true when a row was deleted', async () => {
    queue = [[{ id: 1 }]]
    expect(await deleteSubagent(1)).toBe(true)
  })

  it('returns false when nothing matched', async () => {
    queue = [[]]
    expect(await deleteSubagent(99)).toBe(false)
  })
})
