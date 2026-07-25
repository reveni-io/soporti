import { describe, it, expect, vi, beforeEach } from 'vitest'

let queue = []
let calls = []
let dbCallCount = 0

function makeChain(op) {
  const call = { op, steps: {} }
  calls.push(call)
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
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
  getDb: () => {
    dbCallCount++
    return {
      select: () => makeChain('select'),
      insert: () => makeChain('insert'),
      update: () => makeChain('update'),
      delete: () => makeChain('delete'),
    }
  },
}))

const { listSkills, getSkillById, createSkill, updateSkill, deleteSkill, getSkillsByIds } = await import('./skills.js')

beforeEach(() => {
  queue = []
  calls = []
  dbCallCount = 0
})

describe('listSkills', () => {
  it('returns the rows from the DB', async () => {
    const rows = [{ id: 1, name: 'bug-triage' }]
    queue = [rows]
    expect(await listSkills(7)).toEqual(rows)
  })
})

describe('getSkillById', () => {
  it('returns the row when found', async () => {
    const row = { id: 1, name: 'bug-triage' }
    queue = [[row]]
    expect(await getSkillById(1, 7)).toEqual(row)
  })

  it('returns null when not found or not owned', async () => {
    queue = [[]]
    expect(await getSkillById(1, 7)).toBeNull()
  })
})

describe('createSkill', () => {
  it('inserts with a null description when none is provided', async () => {
    const created = { id: 1, name: 'bug-triage', description: null, instructions: 'do X' }
    queue = [[created]]

    const skill = await createSkill(7, { name: 'bug-triage', instructions: 'do X' })

    expect(skill).toEqual(created)
    const insert = calls.find(c => c.op === 'insert')
    expect(insert.steps.values).toEqual({ userId: 7, name: 'bug-triage', description: null, instructions: 'do X' })
  })

  it('propagates a unique-violation error unchanged', async () => {
    const dupErr = Object.assign(new Error('duplicate key'), { code: '23505' })
    queue = [dupErr]

    await expect(createSkill(7, { name: 'bug-triage', description: null, instructions: 'do X' })).rejects.toMatchObject(
      { code: '23505' }
    )
  })
})

describe('updateSkill', () => {
  it('returns null when no row matches (not found or not owned)', async () => {
    queue = [[]]
    expect(await updateSkill(1, 7, { name: 'bug-triage', description: null, instructions: 'do X' })).toBeNull()
  })

  it('returns the updated row and sets updatedAt', async () => {
    const updated = { id: 1, name: 'bug-triage', description: null, instructions: 'do Y' }
    queue = [[updated]]

    const skill = await updateSkill(1, 7, { name: 'bug-triage', description: null, instructions: 'do Y' })

    expect(skill).toEqual(updated)
    const update = calls.find(c => c.op === 'update')
    expect(update.steps.set).toMatchObject({ name: 'bug-triage', description: null, instructions: 'do Y' })
    expect(update.steps.set.updatedAt).toBeInstanceOf(Date)
  })
})

describe('deleteSkill', () => {
  it('returns true when a row was deleted', async () => {
    queue = [[{ id: 1 }]]
    expect(await deleteSkill(1, 7)).toBe(true)
  })

  it('returns false when nothing matched', async () => {
    queue = [[]]
    expect(await deleteSkill(1, 7)).toBe(false)
  })
})

describe('getSkillsByIds', () => {
  it('returns an empty array without touching the DB when ids is empty', async () => {
    expect(await getSkillsByIds([], 7)).toEqual([])
    expect(dbCallCount).toBe(0)
  })

  it('returns the rows from the DB when ids are provided', async () => {
    const rows = [{ id: 1, name: 'bug-triage' }]
    queue = [rows]
    expect(await getSkillsByIds([1, 2], 7)).toEqual(rows)
    expect(dbCallCount).toBe(1)
  })
})
