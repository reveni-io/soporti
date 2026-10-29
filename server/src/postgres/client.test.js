import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

const mockQuery = vi.fn()
const mockEnd = vi.fn(async () => {})
const mockClientQuery = vi.fn()
const mockRelease = vi.fn()
let checkedOutClient = null

vi.mock('pg', () => ({
  default: {
    Pool: class {
      constructor() {
        this.on = vi.fn()
      }
      query(...args) {
        return mockQuery(...args)
      }
      connect() {
        checkedOutClient = Object.assign(new EventEmitter(), { query: mockClientQuery, release: mockRelease })
        return Promise.resolve(checkedOutClient)
      }
      end() {
        return mockEnd()
      }
    },
  },
}))

const getPostgresConnection = vi.fn(async () => 'postgresql://localhost:5432/testdb')
const isPostgresConfigured = vi.fn(async () => true)
const getPostgresMaxRows = vi.fn(async () => 100)
vi.mock('./settings.js', () => ({ getPostgresConnection, isPostgresConfigured, getPostgresMaxRows }))

const { isConfigured, listSchemas, listTables, describeTable, runQuery, shutdown } = await import('./client.js')

function stubReadOnlyQuery(outcome) {
  mockClientQuery.mockImplementation(async query => {
    if (typeof query === 'string') return {}
    if (outcome instanceof Error) throw outcome
    return outcome
  })
}

function dataQueries() {
  return mockClientQuery.mock.calls.map(([query]) => query).filter(query => typeof query !== 'string')
}

describe('isConfigured', () => {
  it('reflects the stored connection', async () => {
    isPostgresConfigured.mockResolvedValueOnce(true)
    expect(await isConfigured()).toBe(true)
    isPostgresConfigured.mockResolvedValueOnce(false)
    expect(await isConfigured()).toBe(false)
  })
})

describe('listSchemas', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns schema names', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ schema_name: 'public' }, { schema_name: 'analytics' }],
    })
    const schemas = await listSchemas()
    expect(schemas).toEqual(['public', 'analytics'])
  })
})

describe('listTables', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns formatted table info', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { table_name: 'users', table_type: 'BASE TABLE', approx_row_count: '1000' },
        { table_name: 'orders', table_type: 'BASE TABLE', approx_row_count: null },
      ],
    })
    const tables = await listTables('public')
    expect(tables).toEqual([
      { name: 'users', type: 'BASE TABLE', approxRows: 1000 },
      { name: 'orders', type: 'BASE TABLE', approxRows: 0 },
    ])
  })
})

describe('describeTable', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns columns and foreign keys', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, ordinal_position: 1 },
          { column_name: 'name', data_type: 'text', is_nullable: 'YES', column_default: null, ordinal_position: 2 },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ column_name: 'id' }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            column_name: 'user_id',
            foreign_schema: 'public',
            foreign_table: 'users',
            foreign_column: 'id',
          },
        ],
      })

    const result = await describeTable('public', 'orders')
    expect(result.columns).toEqual([
      { name: 'id', type: 'integer', nullable: false, default: null, primaryKey: true },
      { name: 'name', type: 'text', nullable: true, default: null, primaryKey: false },
    ])
    expect(result.foreignKeys).toEqual([{ column: 'user_id', references: 'public.users.id' }])
  })
})

describe('runQuery', () => {
  beforeEach(() => vi.clearAllMocks())

  it('executes SELECT queries', async () => {
    stubReadOnlyQuery({ rows: [{ id: 1, name: 'Alice' }], fields: [{ name: 'id' }, { name: 'name' }] })

    const result = await runQuery('SELECT * FROM users')

    expect(result.columns).toEqual(['id', 'name'])
    expect(result.rows).toEqual([{ id: 1, name: 'Alice' }])
    expect(result.rowCount).toBe(1)
    expect(result.truncated).toBe(false)
  })

  it('executes WITH (CTE) queries', async () => {
    stubReadOnlyQuery({ rows: [], fields: [{ name: 'count' }] })

    const result = await runQuery('WITH cte AS (SELECT 1) SELECT * FROM cte')

    expect(result.rowCount).toBe(0)
  })

  it('rejects non-SELECT queries', async () => {
    await expect(runQuery('INSERT INTO users VALUES (1)')).rejects.toThrow('Only SELECT')
    await expect(runQuery('DELETE FROM users')).rejects.toThrow('Only SELECT')
    await expect(runQuery('DROP TABLE users')).rejects.toThrow('Only SELECT')
    expect(mockClientQuery).not.toHaveBeenCalled()
  })

  it('marks results as truncated at 100 rows', async () => {
    stubReadOnlyQuery({ rows: Array.from({ length: 100 }, (_, i) => ({ id: i })), fields: [{ name: 'id' }] })

    const result = await runQuery('SELECT * FROM big_table')

    expect(result.truncated).toBe(true)
  })

  it('strips trailing semicolons', async () => {
    stubReadOnlyQuery({ rows: [], fields: [] })

    await runQuery('SELECT 1;')

    expect(dataQueries()[0].text).toBe('SELECT * FROM (SELECT 1) AS _q LIMIT 100')
  })

  it('applies the configured row cap to the LIMIT and truncation flag', async () => {
    getPostgresMaxRows.mockResolvedValueOnce(5)
    stubReadOnlyQuery({ rows: Array.from({ length: 5 }, (_, i) => ({ id: i })), fields: [{ name: 'id' }] })

    const result = await runQuery('SELECT * FROM t')

    expect(dataQueries()[0].text).toContain('LIMIT 5')
    expect(result.truncated).toBe(true)
  })

  it('runs the query alone in a read-only transaction that is always rolled back', async () => {
    stubReadOnlyQuery({ rows: [], fields: [] })

    await runQuery('SELECT * FROM t')

    expect(mockClientQuery.mock.calls.map(([query]) => query)).toEqual([
      'BEGIN READ ONLY',
      { text: 'SELECT * FROM (SELECT * FROM t) AS _q LIMIT 100', queryMode: 'extended' },
      'ROLLBACK',
    ])
    expect(mockRelease).toHaveBeenCalledTimes(1)
    expect(mockRelease).toHaveBeenCalledWith(undefined)
    expect(mockQuery).not.toHaveBeenCalled()
    expect(checkedOutClient.listenerCount('error')).toBe(0)
  })

  it('rolls back and releases the connection when Postgres refuses a query that hides a second statement', async () => {
    const refused = new Error('cannot insert multiple commands into a prepared statement')
    stubReadOnlyQuery(refused)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const failure = await runQuery('SELECT 1) a; DELETE FROM t; SELECT * FROM (SELECT 1').catch(err => err)

    expect(failure).toBe(refused)
    expect(dataQueries()).toEqual([
      {
        text: 'SELECT * FROM (SELECT 1) a; DELETE FROM t; SELECT * FROM (SELECT 1) AS _q LIMIT 100',
        queryMode: 'extended',
      },
    ])
    expect(mockClientQuery).toHaveBeenLastCalledWith('ROLLBACK')
    expect(mockRelease).toHaveBeenCalledTimes(1)
    expect(mockRelease).toHaveBeenCalledWith(undefined)
  })

  it('still rolls back and releases the connection when BEGIN fails', async () => {
    const beginFailure = new Error('connection terminated')
    mockClientQuery.mockImplementation(async query => {
      if (query === 'BEGIN READ ONLY') throw beginFailure
      return {}
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(runQuery('SELECT 1')).rejects.toBe(beginFailure)

    expect(mockClientQuery.mock.calls.map(([query]) => query)).toEqual(['BEGIN READ ONLY', 'ROLLBACK'])
    expect(mockRelease).toHaveBeenCalledTimes(1)
  })

  it('logs a connection that drops mid-query instead of crashing, and fails the query', async () => {
    const dropped = new Error('Connection terminated unexpectedly')
    mockClientQuery.mockImplementation(async query => {
      if (typeof query === 'string') return {}
      checkedOutClient.emit('error', dropped)
      throw dropped
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(runQuery('SELECT pg_sleep(60)')).rejects.toBe(dropped)

    expect(consoleError).toHaveBeenCalledWith('[postgres] Connection error during a query:', dropped.message)
    expect(checkedOutClient.listenerCount('error')).toBe(0)
  })

  it('discards the connection when the rollback fails', async () => {
    const rollbackFailure = new Error('connection terminated')
    mockClientQuery.mockImplementation(async query => {
      if (query === 'ROLLBACK') throw rollbackFailure
      return query === 'BEGIN READ ONLY' ? {} : { rows: [], fields: [] }
    })

    await runQuery('SELECT 1')

    expect(mockRelease).toHaveBeenCalledTimes(1)
    expect(mockRelease).toHaveBeenCalledWith(rollbackFailure)
  })
})

describe('error handling', () => {
  beforeEach(() => vi.clearAllMocks())

  it('listSchemas throws on query error', async () => {
    mockQuery.mockRejectedValue(new Error('connection failed'))
    await expect(listSchemas()).rejects.toThrow('connection failed')
  })

  it('listTables throws on query error', async () => {
    mockQuery.mockRejectedValue(new Error('timeout'))
    await expect(listTables()).rejects.toThrow('timeout')
  })

  it('describeTable throws on query error', async () => {
    mockQuery.mockRejectedValue(new Error('table not found'))
    await expect(describeTable('public', 'missing')).rejects.toThrow('table not found')
  })

  it('runQuery throws on query error', async () => {
    stubReadOnlyQuery(new Error('syntax error'))
    await expect(runQuery('SELECT bad')).rejects.toThrow('syntax error')
  })
})

describe('runQuery on an unknown column', () => {
  const ORDERS_ROWS = [
    { table_schema: 'public', table_name: 'orders', column_name: 'id' },
    { table_schema: 'public', table_name: 'orders', column_name: 'status' },
    { table_schema: 'public', table_name: 'customers', column_name: 'id' },
    { table_schema: 'public', table_name: 'customers', column_name: 'email' },
  ]

  function undefinedColumn(overrides = {}) {
    return Object.assign(new Error('column o.kind does not exist'), { code: '42703', ...overrides })
  }

  beforeEach(() => {
    mockQuery.mockReset()
    mockClientQuery.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it.each([
    {
      kind: 'lists the columns of every table in the query',
      error: undefinedColumn(),
      lookup: { rows: ORDERS_ROWS },
      message:
        'column o.kind does not exist Columns of the tables in this query: public.orders: id, status; public.customers: id, email.',
    },
    {
      kind: 'forwards the Postgres hint before the columns',
      error: undefinedColumn({ hint: 'Perhaps you meant to reference the column "o.kind_id".' }),
      lookup: { rows: ORDERS_ROWS.slice(0, 2) },
      message:
        'column o.kind does not exist Perhaps you meant to reference the column "o.kind_id". Columns of the tables in this query: public.orders: id, status.',
    },
    {
      kind: 'keeps a table name found in two schemas as two entries',
      error: undefinedColumn(),
      lookup: {
        rows: [
          { table_schema: 'public', table_name: 'orders', column_name: 'total' },
          { table_schema: 'shop', table_name: 'orders', column_name: 'status' },
        ],
      },
      message:
        'column o.kind does not exist Columns of the tables in this query: public.orders: total; shop.orders: status.',
    },
    {
      kind: 'keeps the plain message when no table in the query exists',
      error: undefinedColumn(),
      lookup: { rows: [] },
      message: 'column o.kind does not exist',
    },
  ])('$kind', async ({ error, lookup, message }) => {
    stubReadOnlyQuery(error)
    mockQuery.mockResolvedValueOnce(lookup)

    const failure = await runQuery('SELECT o.kind FROM orders o JOIN customers c ON c.id = o.customer_id').catch(
      err => err
    )

    expect(failure.message).toBe(message)
    expect(failure.code).toBe('42703')
    expect(failure.cause).toBe(error)
    expect(mockQuery).toHaveBeenCalledTimes(1)
  })

  it('keeps the original error when the column lookup itself fails', async () => {
    const error = undefinedColumn()
    stubReadOnlyQuery(error)
    mockQuery.mockRejectedValueOnce(new Error('permission denied'))

    const failure = await runQuery('SELECT o.kind FROM orders o').catch(err => err)

    expect(failure.message).toBe('column o.kind does not exist')
    expect(failure.code).toBe('42703')
    expect(failure.cause).toBe(error)
  })

  it.each([
    { kind: 'a syntax error', error: Object.assign(new Error('syntax error at or near "FORM"'), { code: '42601' }) },
    { kind: 'an error without a code', error: new Error('connection terminated') },
  ])('rethrows $kind unchanged without a lookup', async ({ error }) => {
    stubReadOnlyQuery(error)

    const failure = await runQuery('SELECT id FORM orders').catch(err => err)

    expect(failure).toBe(error)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('looks up every identifier of a wide query, the table after its many columns included', async () => {
    const columns = Array.from({ length: 80 }, (_, index) => `o.col_${index}`).join(', ')
    stubReadOnlyQuery(undefinedColumn())
    mockQuery.mockResolvedValueOnce({ rows: [] })

    await runQuery(`SELECT ${columns} FROM Shop.Orders o`).catch(() => {})

    expect(mockQuery).toHaveBeenCalledTimes(1)
    const [, [tokens]] = mockQuery.mock.calls[0]
    expect(tokens).toEqual(expect.arrayContaining(['orders', 'shop', 'col_79']))
    expect(new Set(tokens).size).toBe(tokens.length)
    expect(tokens.every(token => token === token.toLowerCase())).toBe(true)
  })

  it('suggests at most five tables in the order the lookup returns them', async () => {
    const rows = Array.from({ length: 7 }, (_, index) => ({
      table_schema: 'public',
      table_name: `t${index}`,
      column_name: 'id',
    }))
    stubReadOnlyQuery(undefinedColumn())
    mockQuery.mockResolvedValueOnce({ rows })

    const failure = await runQuery('SELECT x FROM t0').catch(err => err)

    expect(failure.message).toBe(
      'column o.kind does not exist Columns of the tables in this query: public.t0: id; public.t1: id; public.t2: id; public.t3: id; public.t4: id.'
    )
  })
})

describe('shutdown', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls pool.end and resets pool', async () => {
    mockQuery.mockResolvedValue({ rows: [] })
    await listSchemas()
    await shutdown()
    expect(mockEnd).toHaveBeenCalled()
  })

  it('does nothing when pool is already null', async () => {
    await shutdown()
    expect(mockEnd).not.toHaveBeenCalled()
  })
})

describe('connection rotation', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await shutdown()
    vi.clearAllMocks()
  })

  it('rebuilds the pool when the stored connection string changes', async () => {
    mockQuery.mockResolvedValue({ rows: [{ schema_name: 'public' }] })

    getPostgresConnection.mockResolvedValue('postgresql://localhost:5432/db-a')
    await listSchemas()
    expect(mockEnd).not.toHaveBeenCalled()

    getPostgresConnection.mockResolvedValue('postgresql://localhost:5432/db-b')
    await listSchemas()
    expect(mockEnd).toHaveBeenCalledTimes(1)
  })

  it('reuses the pool while the connection string is unchanged', async () => {
    mockQuery.mockResolvedValue({ rows: [] })
    getPostgresConnection.mockResolvedValue('postgresql://localhost:5432/db-a')

    await listSchemas()
    await listSchemas()

    expect(mockEnd).not.toHaveBeenCalled()
  })
})

describe('runQuery on a missing table', () => {
  function undefinedTable(name) {
    return Object.assign(new Error(`relation "${name}" does not exist`), { code: '42P01' })
  }

  beforeEach(() => {
    mockQuery.mockReset()
    mockClientQuery.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it.each([
    {
      kind: 'lists the tables whose name contains the missing one',
      error: undefinedTable('stores'),
      lookup: {
        rows: [
          { table_schema: 'public', table_name: 'stores_store' },
          { table_schema: 'shop', table_name: 'accounts_stores' },
        ],
      },
      searched: 'stores',
      message:
        'relation "stores" does not exist Tables whose name contains "stores": public.stores_store, shop.accounts_stores.',
    },
    {
      kind: 'searches by the table part of a schema-qualified name',
      error: undefinedTable('public.store'),
      lookup: { rows: [{ table_schema: 'public', table_name: 'stores_store' }] },
      searched: 'store',
      message: 'relation "public.store" does not exist Tables whose name contains "store": public.stores_store.',
    },
    {
      kind: 'points at list_database_tables when no table matches',
      error: undefinedTable('nope'),
      lookup: { rows: [] },
      searched: 'nope',
      message: 'relation "nope" does not exist No table name contains "nope": list them with list_database_tables.',
    },
  ])('$kind', async ({ error, lookup, searched, message }) => {
    stubReadOnlyQuery(error)
    mockQuery.mockResolvedValueOnce(lookup)

    const failure = await runQuery('SELECT * FROM stores').catch(err => err)

    expect(failure.message).toBe(message)
    expect(failure.code).toBe('42P01')
    expect(failure.cause).toBe(error)
    expect(mockQuery).toHaveBeenCalledTimes(1)
    expect(mockQuery.mock.calls[0][1][0]).toBe(searched)
  })

  it('leaves a missing FROM-clause entry unchanged', async () => {
    const alias = Object.assign(new Error('missing FROM-clause entry for table "o"'), { code: '42P01' })
    stubReadOnlyQuery(alias)

    await expect(runQuery('SELECT o.id FROM orders')).rejects.toBe(alias)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('keeps the hint short when the table lookup itself fails', async () => {
    stubReadOnlyQuery(undefinedTable('stores'))
    mockQuery.mockRejectedValueOnce(new Error('permission denied'))

    const failure = await runQuery('SELECT * FROM stores').catch(err => err)

    expect(failure.message).toBe(
      'relation "stores" does not exist No table name contains "stores": list them with list_database_tables.'
    )
  })
})

describe('runQuery cancelled by the database', () => {
  beforeEach(() => {
    mockQuery.mockReset()
    mockClientQuery.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('tells the agent how to narrow a query that hit the statement timeout', async () => {
    const timeout = Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' })
    stubReadOnlyQuery(timeout)

    const failure = await runQuery("SELECT * FROM events WHERE type ILIKE '%refund%'").catch(err => err)

    expect(failure.message).toMatch(/^canceling statement due to statement timeout The query ran longer/)
    expect(failure.code).toBe('57014')
    expect(failure.cause).toBe(timeout)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('leaves any other cancellation unchanged', async () => {
    const cancelled = Object.assign(new Error('canceling statement due to user request'), { code: '57014' })
    stubReadOnlyQuery(cancelled)

    await expect(runQuery('SELECT 1')).rejects.toBe(cancelled)
  })
})
