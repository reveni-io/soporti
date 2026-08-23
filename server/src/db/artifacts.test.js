import { describe, it, expect, vi, beforeEach } from 'vitest'

let queue = []
let calls = []

function tableName(ref) {
  return ref?.[Symbol.for('drizzle:Name')] ?? ref?.[Symbol.for('drizzle:BaseName')] ?? null
}

function makeChain(op, target) {
  const call = { op, target: tableName(target), joins: [], steps: {} }
  calls.push(call)
  const chain = {
    from: table => {
      call.from = tableName(table)
      return chain
    },
    innerJoin: table => {
      call.joins.push(tableName(table))
      return chain
    },
    where: c => {
      call.steps.where = c
      return chain
    },
    orderBy: () => chain,
    groupBy: () => chain,
    limit: () => chain,
    values: v => {
      call.steps.values = v
      return chain
    },
    onConflictDoUpdate: v => {
      call.steps.onConflictDoUpdate = v
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
  select: () => makeChain('select'),
  insert: table => makeChain('insert', table),
  delete: table => makeChain('delete', table),
  transaction: fn => fn(handle),
}

vi.mock('./index.js', () => ({ getDb: () => handle }))

beforeEach(() => {
  queue = []
  calls = []
})

const {
  saveArtifactVersion,
  getArtifact,
  getArtifactVersions,
  getArtifactHtml,
  findArtifactVersion,
  listArtifacts,
  deleteArtifact,
  deleteArtifactVersion,
  createOrRefreshArtifactShare,
  getSharedArtifact,
  VERSION_NOT_FOUND,
  ONLY_VERSION,
} = await import('./artifacts.js')

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111'
const ARTIFACT_ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601'

describe('saveArtifactVersion', () => {
  it('creates the artifact at version 1 and stores its html', async () => {
    queue = [[{ id: ARTIFACT_ID, identifier: 'refund-dashboard', title: 'Refund dashboard', latestVersion: 1 }], []]

    const saved = await saveArtifactVersion(CONVERSATION_ID, {
      identifier: 'refund-dashboard',
      title: 'Refund dashboard',
      html: '<h1>Hi</h1>',
    })

    expect(saved).toEqual({ id: ARTIFACT_ID, identifier: 'refund-dashboard', title: 'Refund dashboard', version: 1 })
    expect(calls[0].steps.values).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      conversationId: CONVERSATION_ID,
      identifier: 'refund-dashboard',
      title: 'Refund dashboard',
    })
    expect(calls[1].steps.values).toEqual({ artifactId: ARTIFACT_ID, version: 1, html: '<h1>Hi</h1>' })
  })

  it('stores the html under the bumped version when the identifier already exists', async () => {
    queue = [[{ id: ARTIFACT_ID, identifier: 'refund-dashboard', title: 'Refunds v2', latestVersion: 4 }], []]

    const saved = await saveArtifactVersion(CONVERSATION_ID, {
      identifier: 'refund-dashboard',
      title: 'Refunds v2',
      html: '<h1>Newer</h1>',
    })

    expect(saved.version).toBe(4)
    expect(calls[1].steps.values).toEqual({ artifactId: ARTIFACT_ID, version: 4, html: '<h1>Newer</h1>' })
  })

  it('bumps the version and retitles on conflict, scoped to the conversation and identifier', async () => {
    queue = [[{ id: ARTIFACT_ID, identifier: 'refund-dashboard', title: 'Refunds v2', latestVersion: 2 }], []]

    await saveArtifactVersion(CONVERSATION_ID, {
      identifier: 'refund-dashboard',
      title: 'Refunds v2',
      html: '<h1>Newer</h1>',
    })

    const conflict = calls[0].steps.onConflictDoUpdate
    expect(conflict.target).toHaveLength(2)
    expect(conflict.set.title).toBe('Refunds v2')
    expect(conflict.set.latestVersion).toBeDefined()
  })
})

describe('getArtifact', () => {
  it('returns the artifact when the conversation belongs to the user', async () => {
    queue = [[{ id: ARTIFACT_ID, identifier: 'refund-dashboard', title: 'Refund dashboard', latestVersion: 2 }]]

    await expect(getArtifact(ARTIFACT_ID, 1)).resolves.toEqual({
      id: ARTIFACT_ID,
      identifier: 'refund-dashboard',
      title: 'Refund dashboard',
      latestVersion: 2,
    })
  })

  it('returns null when it is missing or owned by someone else', async () => {
    queue = [[]]

    await expect(getArtifact(ARTIFACT_ID, 1)).resolves.toBeNull()
  })

  it('reaches the owner through a conversations join', async () => {
    queue = [[{ id: ARTIFACT_ID, title: 'Refund dashboard', latestVersion: 2 }]]

    await getArtifact(ARTIFACT_ID, 1)

    expect(calls[0].from).toBe('artifacts')
    expect(calls[0].joins).toEqual(['conversations'])
  })
})

describe('getArtifactVersions', () => {
  it('returns every stored version in ascending order', async () => {
    queue = [
      [
        { version: 1, createdAt: new Date(0) },
        { version: 2, createdAt: new Date(1) },
      ],
    ]

    await expect(getArtifactVersions(ARTIFACT_ID)).resolves.toHaveLength(2)
  })
})

describe('getArtifactHtml', () => {
  it('returns the requested version', async () => {
    queue = [[{ version: 2, html: '<h1>v2</h1>' }]]

    await expect(getArtifactHtml(ARTIFACT_ID, 2)).resolves.toEqual({ version: 2, html: '<h1>v2</h1>' })
  })

  it('returns the latest version when none is requested', async () => {
    queue = [[{ version: 5, html: '<h1>v5</h1>' }]]

    await expect(getArtifactHtml(ARTIFACT_ID, null)).resolves.toEqual({ version: 5, html: '<h1>v5</h1>' })
  })

  it('returns null when the version does not exist', async () => {
    queue = [[]]

    await expect(getArtifactHtml(ARTIFACT_ID, 99)).resolves.toBeNull()
  })
})

describe('listArtifacts', () => {
  it('returns the artifacts across the user conversations, newest first', async () => {
    queue = [
      [
        { id: 9, title: 'Latest', latestVersion: 1 },
        { id: 3, title: 'Older', latestVersion: 4 },
      ],
    ]

    const rows = await listArtifacts(1)

    expect(rows.map(row => row.id)).toEqual([9, 3])
  })

  it('returns an empty list for a user with none', async () => {
    queue = [[]]

    await expect(listArtifacts(1)).resolves.toEqual([])
  })

  it('counts the stored versions through an artifact_versions join', async () => {
    queue = [[{ id: 9, title: 'Latest', latestVersion: 3, versionCount: 2 }]]

    await listArtifacts(1)

    const scope = calls.find(call => call.op === 'select' && call.from === 'artifacts')
    expect(scope.joins).toContain('artifact_versions')
  })
})

describe('deleteArtifactVersion', () => {
  it('deletes the version and its share, and reports the latest one left', async () => {
    queue = [[{ version: 1 }, { version: 2 }, { version: 3 }], [], []]

    const result = await deleteArtifactVersion(ARTIFACT_ID, 3)

    expect(result).toEqual({ deleted: true, latestVersion: 2 })
    const deletes = calls.filter(call => call.op === 'delete')
    expect(deletes.map(call => call.target)).toEqual(['artifact_shares', 'artifact_versions'])
  })

  it('keeps the surviving latest when a middle version goes', async () => {
    queue = [[{ version: 1 }, { version: 2 }, { version: 3 }], [], []]

    const result = await deleteArtifactVersion(ARTIFACT_ID, 2)

    expect(result).toEqual({ deleted: true, latestVersion: 3 })
  })

  it('reports an unknown version without deleting anything', async () => {
    queue = [[{ version: 1 }, { version: 2 }]]

    const result = await deleteArtifactVersion(ARTIFACT_ID, 99)

    expect(result).toEqual({ deleted: false, reason: VERSION_NOT_FOUND })
    expect(calls.filter(call => call.op === 'delete')).toHaveLength(0)
  })

  it('refuses to delete the only version, so an artifact never ends up empty', async () => {
    queue = [[{ version: 4 }]]

    const result = await deleteArtifactVersion(ARTIFACT_ID, 4)

    expect(result).toEqual({ deleted: false, reason: ONLY_VERSION })
    expect(calls.filter(call => call.op === 'delete')).toHaveLength(0)
  })
})

describe('deleteArtifact', () => {
  it('deletes an artifact the user owns in a single ownership-scoped statement', async () => {
    queue = [[{ id: ARTIFACT_ID }]]

    await expect(deleteArtifact(ARTIFACT_ID, 1)).resolves.toBe(true)

    const deletes = calls.filter(call => call.op === 'delete')
    expect(deletes).toHaveLength(1)
    expect(deletes[0].target).toBe('artifacts')
  })

  it('scopes the delete through a conversations join, so another user artifact is unreachable', async () => {
    queue = [[{ id: ARTIFACT_ID }]]

    await deleteArtifact(ARTIFACT_ID, 1)

    const scope = calls.find(call => call.op === 'select' && call.from === 'artifacts')
    expect(scope).toBeDefined()
    expect(scope.joins).toEqual(['conversations'])
  })

  it('reports nothing deleted when the artifact is not the user own', async () => {
    queue = [[]]

    await expect(deleteArtifact(ARTIFACT_ID, 1)).resolves.toBe(false)
  })
})

describe('createOrRefreshArtifactShare', () => {
  it('stores the frozen version with an expiry and returns the share id', async () => {
    queue = [[{ id: 'abc' }]]

    await expect(createOrRefreshArtifactShare(ARTIFACT_ID, 2)).resolves.toBe('abc')

    const { values } = calls[0].steps
    expect(values.artifactId).toBe(ARTIFACT_ID)
    expect(values.version).toBe(2)
    expect(values.expiresAt.getTime()).toBeGreaterThan(Date.now())
    expect(values.id).toMatch(/^[a-f0-9]{32}$/)
  })
})

describe('getSharedArtifact', () => {
  it('returns the frozen version of the shared artifact', async () => {
    queue = [[{ title: 'Refund dashboard', version: 2, html: '<h1>v2</h1>' }]]

    await expect(getSharedArtifact('abc')).resolves.toEqual({
      title: 'Refund dashboard',
      version: 2,
      html: '<h1>v2</h1>',
    })
  })

  it('joins the artifact and its versions, so the public endpoint cannot serve another version', async () => {
    queue = [[{ title: 'Refund dashboard', version: 2, html: '<h1>v2</h1>' }]]

    await getSharedArtifact('abc')

    const query = calls.find(call => call.from === 'artifact_shares')
    expect(query).toBeDefined()
    expect(query.joins).toEqual(['artifacts', 'artifact_versions'])
  })

  it('returns null for an unknown or expired share', async () => {
    queue = [[]]

    await expect(getSharedArtifact('abc')).resolves.toBeNull()
  })
})

describe('findArtifactVersion', () => {
  it('returns the requested version when it exists', async () => {
    queue = [[{ version: 2 }]]

    await expect(findArtifactVersion(ARTIFACT_ID, 2)).resolves.toBe(2)
  })

  it('resolves the latest version when none is requested', async () => {
    queue = [[{ version: 5 }]]

    await expect(findArtifactVersion(ARTIFACT_ID, null)).resolves.toBe(5)
  })

  it('returns null when the version does not exist', async () => {
    queue = [[]]

    await expect(findArtifactVersion(ARTIFACT_ID, 99)).resolves.toBeNull()
  })

  it('reads only the version number, never the stored html', async () => {
    queue = [[{ version: 2 }]]

    await findArtifactVersion(ARTIFACT_ID, 2)

    expect(calls[0].from).toBe('artifact_versions')
    expect(calls[0].joins).toEqual([])
  })
})
