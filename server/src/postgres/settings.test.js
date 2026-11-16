import { describe, it, expect, vi, beforeEach } from 'vitest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const listPostgresConnections = vi.fn()
const createPostgresConnection = vi.fn()
const updatePostgresConnection = vi.fn()
const deletePostgresConnection = vi.fn()
vi.mock('../db/postgres-connections.js', () => ({
  listPostgresConnections,
  createPostgresConnection,
  updatePostgresConnection,
  deletePostgresConnection,
}))

const {
  parsePostgresConnection,
  parsePostgresConnectionChanges,
  getPostgresConnections,
  describePostgresConnection,
  addPostgresConnection,
  editPostgresConnection,
  removePostgresConnection,
  isPostgresConfigured,
  getPostgresMaxRows,
  setPostgresMaxRows,
  DUPLICATE_POSTGRES_CONNECTION,
  POSTGRES_MAX_ROWS_KEY,
  DEFAULT_MAX_ROWS,
  _resetPostgresSettingsCacheForTests,
} = await import('./settings.js')

const CREATED_AT = new Date('2026-10-01T10:00:00Z')
const PRODUCTION = { id: 1, name: 'production', connectionString: 'postgresql://u:p@host/prod', createdAt: CREATED_AT }
const BILLING = { id: 2, name: 'Billing', connectionString: 'postgresql://u:p@host/billing', createdAt: CREATED_AT }
const NAME_ERROR = 'The name must be between 1 and 60 characters, on a single line.'
const CONNECTION_STRING_ERROR = 'That does not look like a valid PostgreSQL connection string.'

beforeEach(() => {
  vi.clearAllMocks()
  getConfigValue.mockReset()
  _resetPostgresSettingsCacheForTests()
  listPostgresConnections.mockResolvedValue([PRODUCTION, BILLING])
})

describe('parsePostgresConnection', () => {
  it('trims both values', () => {
    expect(parsePostgresConnection({ name: '  prod ', connectionString: ' postgresql://host/db  ' })).toEqual({
      value: { name: 'prod', connectionString: 'postgresql://host/db' },
    })
  })

  it.each([
    { kind: 'an empty name', name: '   ' },
    { kind: 'a name over 60 characters', name: 'a'.repeat(61) },
    { kind: 'a multi-line name', name: 'one\ntwo' },
    { kind: 'a name that is not text', name: 7 },
  ])('rejects $kind', ({ name }) => {
    expect(parsePostgresConnection({ name, connectionString: 'postgresql://host/db' })).toEqual({ error: NAME_ERROR })
  })

  it('accepts a name of exactly 60 characters', () => {
    expect(parsePostgresConnection({ name: 'a'.repeat(60), connectionString: 'postgresql://host/db' }).value).toEqual({
      name: 'a'.repeat(60),
      connectionString: 'postgresql://host/db',
    })
  })

  it.each([
    { kind: 'an empty connection string', connectionString: '' },
    { kind: 'a connection string over 2000 characters', connectionString: 'p'.repeat(2001) },
    { kind: 'a multi-line connection string', connectionString: 'postgresql://host/db\nSELECT 1' },
    { kind: 'a missing connection string', connectionString: undefined },
  ])('rejects $kind', ({ connectionString }) => {
    expect(parsePostgresConnection({ name: 'prod', connectionString })).toEqual({ error: CONNECTION_STRING_ERROR })
  })

  it('rejects a missing body', () => {
    expect(parsePostgresConnection()).toEqual({ error: NAME_ERROR })
  })
})

describe('parsePostgresConnectionChanges', () => {
  it('keeps only the fields that were sent, trimmed', () => {
    expect(parsePostgresConnectionChanges({ name: ' billing ' })).toEqual({ value: { name: 'billing' } })
    expect(parsePostgresConnectionChanges({ connectionString: ' postgresql://host/db ', name: null })).toEqual({
      value: { connectionString: 'postgresql://host/db' },
    })
  })

  it('needs at least one field', () => {
    expect(parsePostgresConnectionChanges({})).toEqual({ error: 'Send a new name or a new connection string.' })
    expect(parsePostgresConnectionChanges()).toEqual({ error: 'Send a new name or a new connection string.' })
  })

  it('validates each field that was sent', () => {
    expect(parsePostgresConnectionChanges({ name: '' })).toEqual({ error: NAME_ERROR })
    expect(parsePostgresConnectionChanges({ connectionString: 'a\nb' })).toEqual({ error: CONNECTION_STRING_ERROR })
  })
})

describe('getPostgresConnections', () => {
  it('returns the stored connections and caches them between calls', async () => {
    expect(await getPostgresConnections()).toEqual([PRODUCTION, BILLING])
    await getPostgresConnections()

    expect(listPostgresConnections).toHaveBeenCalledTimes(1)
  })

  it('reloads after an add, an edit and a remove', async () => {
    createPostgresConnection.mockResolvedValue({ id: 3, name: 'replica', createdAt: CREATED_AT })
    updatePostgresConnection.mockResolvedValue({ id: 1, name: 'prod', createdAt: CREATED_AT })
    deletePostgresConnection.mockResolvedValue(true)

    await getPostgresConnections()
    await addPostgresConnection({ name: 'replica', connectionString: 'postgresql://host/replica' })
    await getPostgresConnections()
    await editPostgresConnection(1, { name: 'prod' })
    await getPostgresConnections()
    await removePostgresConnection(2)
    await getPostgresConnections()

    expect(listPostgresConnections).toHaveBeenCalledTimes(4)
  })
})

describe('describePostgresConnection', () => {
  it('never includes the connection string', () => {
    expect(describePostgresConnection(PRODUCTION)).toEqual({ id: 1, name: 'production', createdAt: CREATED_AT })
  })
})

describe('addPostgresConnection', () => {
  it('creates the connection', async () => {
    createPostgresConnection.mockResolvedValue({ id: 3, name: 'replica', createdAt: CREATED_AT })

    const created = await addPostgresConnection({ name: 'replica', connectionString: 'postgresql://host/replica' })

    expect(created).toEqual({ id: 3, name: 'replica', createdAt: CREATED_AT })
    expect(createPostgresConnection).toHaveBeenCalledTimes(1)
    expect(createPostgresConnection).toHaveBeenCalledWith({
      name: 'replica',
      connectionString: 'postgresql://host/replica',
    })
  })

  it('rejects a duplicate name without regard to case, without inserting', async () => {
    const failure = await addPostgresConnection({ name: 'BILLING', connectionString: 'x' }).catch(err => err)

    expect(failure.code).toBe(DUPLICATE_POSTGRES_CONNECTION)
    expect(failure.message).toBe('A database with this name is already connected.')
    expect(createPostgresConnection).not.toHaveBeenCalled()
  })
})

describe('editPostgresConnection', () => {
  it('passes the changes through and returns the summary', async () => {
    updatePostgresConnection.mockResolvedValue({ id: 1, name: 'main', createdAt: CREATED_AT })

    const updated = await editPostgresConnection(1, { name: 'main' })

    expect(updated).toEqual({ id: 1, name: 'main', createdAt: CREATED_AT })
    expect(updatePostgresConnection).toHaveBeenCalledTimes(1)
    expect(updatePostgresConnection).toHaveBeenCalledWith(1, { name: 'main' })
  })

  it('rejects a rename onto the name of another connection', async () => {
    const failure = await editPostgresConnection(1, { name: 'billing' }).catch(err => err)

    expect(failure.code).toBe(DUPLICATE_POSTGRES_CONNECTION)
    expect(updatePostgresConnection).not.toHaveBeenCalled()
  })

  it('allows changing the case of its own name', async () => {
    updatePostgresConnection.mockResolvedValue({ id: 2, name: 'billing', createdAt: CREATED_AT })

    await editPostgresConnection(2, { name: 'billing' })

    expect(updatePostgresConnection).toHaveBeenCalledWith(2, { name: 'billing' })
  })

  it('does not look at names when only the connection string changes', async () => {
    updatePostgresConnection.mockResolvedValue(null)

    expect(await editPostgresConnection(9, { connectionString: 'postgresql://host/new' })).toBeNull()
    expect(listPostgresConnections).not.toHaveBeenCalled()
  })
})

describe('removePostgresConnection', () => {
  it('passes the result through', async () => {
    deletePostgresConnection.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    expect(await removePostgresConnection(1)).toBe(true)
    expect(await removePostgresConnection(99)).toBe(false)
    expect(deletePostgresConnection).toHaveBeenCalledTimes(2)
    expect(deletePostgresConnection).toHaveBeenNthCalledWith(1, 1)
  })
})

describe('isPostgresConfigured', () => {
  it('reflects whether any connection is stored', async () => {
    expect(await isPostgresConfigured()).toBe(true)

    _resetPostgresSettingsCacheForTests()
    listPostgresConnections.mockResolvedValue([])
    expect(await isPostgresConfigured()).toBe(false)
  })
})

describe('getPostgresMaxRows', () => {
  it('returns the default when unset or invalid', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await getPostgresMaxRows()).toBe(DEFAULT_MAX_ROWS)

    _resetPostgresSettingsCacheForTests()
    getConfigValue.mockResolvedValue('not-a-number')
    expect(await getPostgresMaxRows()).toBe(DEFAULT_MAX_ROWS)

    _resetPostgresSettingsCacheForTests()
    getConfigValue.mockResolvedValue(0)
    expect(await getPostgresMaxRows()).toBe(DEFAULT_MAX_ROWS)
  })

  it('returns the stored value and reads the right key', async () => {
    getConfigValue.mockResolvedValue(250)
    expect(await getPostgresMaxRows()).toBe(250)
    expect(getConfigValue).toHaveBeenCalledWith(POSTGRES_MAX_ROWS_KEY)
  })

  it('does not cap large values and floors fractional values', async () => {
    getConfigValue.mockResolvedValue(999999)
    expect(await getPostgresMaxRows()).toBe(999999)

    _resetPostgresSettingsCacheForTests()
    getConfigValue.mockResolvedValue(10.9)
    expect(await getPostgresMaxRows()).toBe(10)
  })
})

describe('setPostgresMaxRows', () => {
  it('stores the value and invalidates the cache', async () => {
    getConfigValue.mockResolvedValue(100)
    expect(await getPostgresMaxRows()).toBe(100)

    await setPostgresMaxRows(500)
    expect(setConfigValue).toHaveBeenCalledWith(POSTGRES_MAX_ROWS_KEY, 500)

    getConfigValue.mockResolvedValue(500)
    expect(await getPostgresMaxRows()).toBe(500)
  })

  it('clears with null (reverting to the default)', async () => {
    await setPostgresMaxRows(null)
    expect(setConfigValue).toHaveBeenCalledWith(POSTGRES_MAX_ROWS_KEY, null)

    getConfigValue.mockResolvedValue(null)
    expect(await getPostgresMaxRows()).toBe(DEFAULT_MAX_ROWS)
  })
})
