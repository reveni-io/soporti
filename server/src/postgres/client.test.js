import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

const mockQuery = vi.fn()
const mockEnd = vi.fn(async () => {})
const mockClientQuery = vi.fn()
const mockRelease = vi.fn()
const mockDefaultTypeParser = vi.fn()
let checkedOutClient = null

const createdPools = []

vi.mock('pg', () => ({
  default: {
    types: { getTypeParser: (...args) => mockDefaultTypeParser(...args) },
    Pool: class {
      constructor(options) {
        this.options = options
        this.on = vi.fn()
        createdPools.push(this)
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

const SINGLE_CONNECTION = [{ id: 1, name: 'production', connectionString: 'postgresql://localhost:5432/testdb' }]
const TWO_CONNECTIONS = [
  { id: 1, name: 'production', connectionString: 'postgresql://localhost:5432/prod?sslmode=require' },
  { id: 2, name: 'billing', connectionString: 'postgresql://localhost:5432/billing' },
]
const getPostgresConnections = vi.fn(async () => SINGLE_CONNECTION)
const isPostgresConfigured = vi.fn(async () => true)
const getPostgresMaxRows = vi.fn(async () => 100)
vi.mock('./settings.js', () => ({ getPostgresConnections, isPostgresConfigured, getPostgresMaxRows }))

const {
  isConfigured,
  listDatabases,
  resolveDatabase,
  listSchemas,
  listTables,
  describeTable,
  runQuery,
  runTypedQuery,
  ReadOnlyQueryError,
  UnknownDatabaseError,
  shutdown,
} = await import('./client.js')

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
    const schemas = await listSchemas(null)
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
    const tables = await listTables(null, 'public')
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

    const result = await describeTable(null, 'public', 'orders')
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

    const result = await runQuery(null, 'SELECT * FROM users')

    expect(result.columns).toEqual(['id', 'name'])
    expect(result.rows).toEqual([{ id: 1, name: 'Alice' }])
    expect(result.rowCount).toBe(1)
    expect(result.truncated).toBe(false)
  })

  it('executes WITH (CTE) queries', async () => {
    stubReadOnlyQuery({ rows: [], fields: [{ name: 'count' }] })

    const result = await runQuery(null, 'WITH cte AS (SELECT 1) SELECT * FROM cte')

    expect(result.rowCount).toBe(0)
  })

  it('rejects non-SELECT queries', async () => {
    await expect(runQuery(null, 'INSERT INTO users VALUES (1)')).rejects.toThrow('Only SELECT')
    await expect(runQuery(null, 'DELETE FROM users')).rejects.toThrow('Only SELECT')
    await expect(runQuery(null, 'DROP TABLE users')).rejects.toThrow('Only SELECT')
    expect(mockClientQuery).not.toHaveBeenCalled()
  })

  it('marks results as truncated at 100 rows', async () => {
    stubReadOnlyQuery({ rows: Array.from({ length: 100 }, (_, i) => ({ id: i })), fields: [{ name: 'id' }] })

    const result = await runQuery(null, 'SELECT * FROM big_table')

    expect(result.truncated).toBe(true)
  })

  it('strips trailing semicolons', async () => {
    stubReadOnlyQuery({ rows: [], fields: [] })

    await runQuery(null, 'SELECT 1;')

    expect(dataQueries()[0].text).toBe('SELECT * FROM (SELECT 1) AS _q LIMIT 100')
  })

  it('leaves every value to the default type parsers of the driver', async () => {
    stubReadOnlyQuery({ rows: [], fields: [] })

    await runQuery(null, 'SELECT created_at FROM orders')

    expect(Object.keys(dataQueries()[0])).toEqual(['text', 'queryMode'])
    expect(dataQueries()[0]).not.toHaveProperty('types')
  })

  it('applies the configured row cap to the LIMIT and truncation flag', async () => {
    getPostgresMaxRows.mockResolvedValueOnce(5)
    stubReadOnlyQuery({ rows: Array.from({ length: 5 }, (_, i) => ({ id: i })), fields: [{ name: 'id' }] })

    const result = await runQuery(null, 'SELECT * FROM t')

    expect(dataQueries()[0].text).toContain('LIMIT 5')
    expect(result.truncated).toBe(true)
  })

  it('runs the query alone in a read-only transaction that is always rolled back', async () => {
    stubReadOnlyQuery({ rows: [], fields: [] })

    await runQuery(null, 'SELECT * FROM t')

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

    const failure = await runQuery(null, 'SELECT 1) a; DELETE FROM t; SELECT * FROM (SELECT 1').catch(err => err)

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

    await expect(runQuery(null, 'SELECT 1')).rejects.toBe(beginFailure)

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

    await expect(runQuery(null, 'SELECT pg_sleep(60)')).rejects.toBe(dropped)

    expect(consoleError).toHaveBeenCalledWith('[postgres] Connection error during a query:', dropped.message)
    expect(checkedOutClient.listenerCount('error')).toBe(0)
  })

  it('discards the connection when the rollback fails', async () => {
    const rollbackFailure = new Error('connection terminated')
    mockClientQuery.mockImplementation(async query => {
      if (query === 'ROLLBACK') throw rollbackFailure
      return query === 'BEGIN READ ONLY' ? {} : { rows: [], fields: [] }
    })

    await runQuery(null, 'SELECT 1')

    expect(mockRelease).toHaveBeenCalledTimes(1)
    expect(mockRelease).toHaveBeenCalledWith(rollbackFailure)
  })
})

describe('error handling', () => {
  beforeEach(() => vi.clearAllMocks())

  it('listSchemas throws on query error', async () => {
    mockQuery.mockRejectedValue(new Error('connection failed'))
    await expect(listSchemas(null)).rejects.toThrow('connection failed')
  })

  it('listTables throws on query error', async () => {
    mockQuery.mockRejectedValue(new Error('timeout'))
    await expect(listTables(null)).rejects.toThrow('timeout')
  })

  it('describeTable throws on query error', async () => {
    mockQuery.mockRejectedValue(new Error('table not found'))
    await expect(describeTable(null, 'public', 'missing')).rejects.toThrow('table not found')
  })

  it('runQuery throws on query error', async () => {
    stubReadOnlyQuery(new Error('syntax error'))
    await expect(runQuery(null, 'SELECT bad')).rejects.toThrow('syntax error')
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

    const failure = await runQuery(null, 'SELECT o.kind FROM orders o JOIN customers c ON c.id = o.customer_id').catch(
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

    const failure = await runQuery(null, 'SELECT o.kind FROM orders o').catch(err => err)

    expect(failure.message).toBe('column o.kind does not exist')
    expect(failure.code).toBe('42703')
    expect(failure.cause).toBe(error)
  })

  it.each([
    { kind: 'a syntax error', error: Object.assign(new Error('syntax error at or near "FORM"'), { code: '42601' }) },
    { kind: 'an error without a code', error: new Error('connection terminated') },
  ])('rethrows $kind unchanged without a lookup', async ({ error }) => {
    stubReadOnlyQuery(error)

    const failure = await runQuery(null, 'SELECT id FORM orders').catch(err => err)

    expect(failure).toBe(error)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('looks up every identifier of a wide query, the table after its many columns included', async () => {
    const columns = Array.from({ length: 80 }, (_, index) => `o.col_${index}`).join(', ')
    stubReadOnlyQuery(undefinedColumn())
    mockQuery.mockResolvedValueOnce({ rows: [] })

    await runQuery(null, `SELECT ${columns} FROM Shop.Orders o`).catch(() => {})

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

    const failure = await runQuery(null, 'SELECT x FROM t0').catch(err => err)

    expect(failure.message).toBe(
      'column o.kind does not exist Columns of the tables in this query: public.t0: id; public.t1: id; public.t2: id; public.t3: id; public.t4: id.'
    )
  })
})

describe('shutdown', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls pool.end and resets pool', async () => {
    mockQuery.mockResolvedValue({ rows: [] })
    await listSchemas(null)
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
    getPostgresConnections.mockImplementation(async () => SINGLE_CONNECTION)
    createdPools.length = 0
    vi.clearAllMocks()
  })

  it('rebuilds the pool when the stored connection string changes', async () => {
    mockQuery.mockResolvedValue({ rows: [{ schema_name: 'public' }] })

    getPostgresConnections.mockResolvedValue([
      { id: 1, name: 'production', connectionString: 'postgresql://localhost:5432/db-a' },
    ])
    await listSchemas(null)
    expect(mockEnd).not.toHaveBeenCalled()

    getPostgresConnections.mockResolvedValue([
      { id: 1, name: 'production', connectionString: 'postgresql://localhost:5432/db-b' },
    ])
    await listSchemas(null)
    expect(mockEnd).toHaveBeenCalledTimes(1)
    expect(createdPools).toHaveLength(2)
  })

  it('reuses the pool while the connection string is unchanged', async () => {
    mockQuery.mockResolvedValue({ rows: [] })

    await listSchemas(null)
    await listSchemas(null)

    expect(mockEnd).not.toHaveBeenCalled()
    expect(createdPools).toHaveLength(1)
  })

  it('rebuilds only the pool of the connection whose string changed', async () => {
    mockQuery.mockResolvedValue({ rows: [] })
    getPostgresConnections.mockResolvedValue(TWO_CONNECTIONS)
    await listSchemas('production')
    await listSchemas('billing')
    expect(createdPools).toHaveLength(2)

    getPostgresConnections.mockResolvedValue([
      TWO_CONNECTIONS[0],
      { ...TWO_CONNECTIONS[1], connectionString: 'postgresql://localhost:5432/billing-2' },
    ])
    await listSchemas('production')
    await listSchemas('billing')

    expect(mockEnd).toHaveBeenCalledTimes(1)
    expect(createdPools).toHaveLength(3)
    expect(createdPools[2].options.connectionString).toBe('postgresql://localhost:5432/billing-2')
  })

  it('ends the pool of a connection that is no longer listed on the next query', async () => {
    mockQuery.mockResolvedValue({ rows: [] })
    getPostgresConnections.mockResolvedValue(TWO_CONNECTIONS)
    await listSchemas('billing')

    getPostgresConnections.mockResolvedValue([TWO_CONNECTIONS[0]])
    await listSchemas(null)

    expect(mockEnd).toHaveBeenCalledTimes(1)
  })
})

describe('several connections', () => {
  beforeEach(async () => {
    await shutdown()
    vi.clearAllMocks()
    createdPools.length = 0
    getPostgresConnections.mockResolvedValue(TWO_CONNECTIONS)
    mockQuery.mockResolvedValue({ rows: [{ schema_name: 'public' }] })
  })

  it('opens one pool per connection, each with its own connection string and no sslmode', async () => {
    await listSchemas('production')
    await listSchemas('billing')

    expect(createdPools.map(pool => pool.options.connectionString)).toEqual([
      'postgresql://localhost:5432/prod',
      'postgresql://localhost:5432/billing',
    ])
    expect(createdPools.every(pool => pool.options.max === 3)).toBe(true)
  })

  it('resolves a name without regard to case', async () => {
    expect(await resolveDatabase('  BILLING ')).toEqual({ id: 2, name: 'billing' })
  })

  it('asks for the name when several are connected and none is given', async () => {
    const failure = await listSchemas(null).catch(err => err)

    expect(failure).toBeInstanceOf(UnknownDatabaseError)
    expect(failure.message).toBe(
      'Several databases are connected ("production", "billing"): pass the one to query as `database`.'
    )
    expect(createdPools).toHaveLength(0)
  })

  it('lists the connected names when the name is unknown', async () => {
    const failure = await runQuery('sales', 'SELECT 1').catch(err => err)

    expect(failure).toBeInstanceOf(UnknownDatabaseError)
    expect(failure.message).toBe('There is no database named "sales". Connected: "production", "billing".')
  })

  it('lists the ids and names without the connection strings', async () => {
    expect(await listDatabases()).toEqual([
      { id: 1, name: 'production' },
      { id: 2, name: 'billing' },
    ])
  })

  it('runs a typed query on the connection with that id', async () => {
    stubReadOnlyQuery({ rows: [], fields: [] })

    await runTypedQuery(2, 'SELECT 1', { maxRows: 10, timeoutMs: 1000 })

    expect(createdPools).toHaveLength(1)
    expect(createdPools[0].options.connectionString).toBe('postgresql://localhost:5432/billing')
  })

  it.each([{ id: 99 }, { id: null }])('refuses a typed query on the unknown id $id', async ({ id }) => {
    const failure = await runTypedQuery(id, 'SELECT 1', { maxRows: 10, timeoutMs: 1000 }).catch(err => err)

    expect(failure).toBeInstanceOf(UnknownDatabaseError)
    expect(failure.message).toBe('That database is no longer connected.')
  })

  it('looks up the hint of a failing query on the pool of the same connection', async () => {
    const billingQuery = vi.fn().mockResolvedValue({ rows: [] })
    stubReadOnlyQuery(Object.assign(new Error('column "kind" does not exist'), { code: '42703' }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await listSchemas('production')
    await listSchemas('billing')
    createdPools[1].query = billingQuery
    mockQuery.mockClear()

    await runQuery('billing', 'SELECT kind FROM orders').catch(() => {})

    expect(billingQuery).toHaveBeenCalledTimes(1)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('ends every pool on shutdown', async () => {
    await listSchemas('production')
    await listSchemas('billing')

    await shutdown()

    expect(mockEnd).toHaveBeenCalledTimes(2)
  })
})

describe('without connections', () => {
  it('tells the agent to add one in the admin panel', async () => {
    getPostgresConnections.mockResolvedValue([])

    const failure = await listSchemas(null).catch(err => err)

    expect(failure).toBeInstanceOf(UnknownDatabaseError)
    expect(failure.message).toBe(
      'PostgreSQL is not configured. Add a connection in the admin panel (Database section).'
    )
    getPostgresConnections.mockResolvedValue(SINGLE_CONNECTION)
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
      kind: 'searches the singular of a plural name, so the singular table is found',
      error: undefinedTable('stores'),
      lookup: {
        rows: [
          { table_schema: 'public', table_name: 'accounts_store' },
          { table_schema: 'public', table_name: 'accounts_storesettings' },
        ],
      },
      searched: 'store',
      message:
        'relation "stores" does not exist Tables whose name contains "store": public.accounts_store, public.accounts_storesettings.',
    },
    {
      kind: 'strips an uppercase plural S too',
      error: undefinedTable('ORDERS'),
      lookup: { rows: [{ table_schema: 'public', table_name: 'orders_order' }] },
      searched: 'ORDER',
      message: 'relation "ORDERS" does not exist Tables whose name contains "ORDER": public.orders_order.',
    },
    {
      kind: 'keeps a short name ending in s as it is',
      error: undefinedTable('bus'),
      lookup: { rows: [{ table_schema: 'public', table_name: 'fleet_bus' }] },
      searched: 'bus',
      message: 'relation "bus" does not exist Tables whose name contains "bus": public.fleet_bus.',
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

    const failure = await runQuery(null, 'SELECT * FROM stores').catch(err => err)

    expect(failure.message).toBe(message)
    expect(failure.code).toBe('42P01')
    expect(failure.cause).toBe(error)
    expect(mockQuery).toHaveBeenCalledTimes(1)
    expect(mockQuery.mock.calls[0][1][0]).toBe(searched)
  })

  it('leaves a missing FROM-clause entry unchanged', async () => {
    const alias = Object.assign(new Error('missing FROM-clause entry for table "o"'), { code: '42P01' })
    stubReadOnlyQuery(alias)

    await expect(runQuery(null, 'SELECT o.id FROM orders')).rejects.toBe(alias)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('keeps the hint short when the table lookup itself fails', async () => {
    stubReadOnlyQuery(undefinedTable('stores'))
    mockQuery.mockRejectedValueOnce(new Error('permission denied'))

    const failure = await runQuery(null, 'SELECT * FROM stores').catch(err => err)

    expect(failure.message).toBe(
      'relation "stores" does not exist No table name contains "store": list them with list_database_tables.'
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

    const failure = await runQuery(null, "SELECT * FROM events WHERE type ILIKE '%refund%'").catch(err => err)

    expect(failure.message).toMatch(/^canceling statement due to statement timeout The query ran longer/)
    expect(failure.code).toBe('57014')
    expect(failure.cause).toBe(timeout)
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('leaves any other cancellation unchanged', async () => {
    const cancelled = Object.assign(new Error('canceling statement due to user request'), { code: '57014' })
    stubReadOnlyQuery(cancelled)

    await expect(runQuery(null, 'SELECT 1')).rejects.toBe(cancelled)
  })
})

describe('runTypedQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery.mockReset()
    mockClientQuery.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns the rows with the name and type OID of every result field', async () => {
    stubReadOnlyQuery({
      rows: [{ week: '2026-08-03', returns: '42' }],
      fields: [
        { name: 'week', dataTypeID: 1082, tableID: 0, format: 'text' },
        { name: 'returns', dataTypeID: 20, tableID: 0, format: 'text' },
      ],
    })

    const result = await runTypedQuery(1, 'SELECT week, returns FROM weekly', { maxRows: 2000, timeoutMs: 30_000 })

    expect(result).toEqual({
      fields: [
        { name: 'week', dataTypeID: 1082 },
        { name: 'returns', dataTypeID: 20 },
      ],
      rows: [{ week: '2026-08-03', returns: '42' }],
      truncated: false,
    })
  })

  it('applies the caller row cap and sets the statement timeout inside the read-only transaction', async () => {
    stubReadOnlyQuery({ rows: [], fields: [] })

    await runTypedQuery(1, 'SELECT * FROM t;', { maxRows: 2000, timeoutMs: 30_000 })

    expect(mockClientQuery.mock.calls.map(([query]) => query)).toEqual([
      'BEGIN READ ONLY',
      'SET LOCAL statement_timeout = 30000',
      { text: 'SELECT * FROM (SELECT * FROM t) AS _q LIMIT 2001', queryMode: 'extended', types: expect.any(Object) },
      'ROLLBACK',
    ])
    expect(getPostgresMaxRows).not.toHaveBeenCalled()
    expect(mockRelease).toHaveBeenCalledTimes(1)
    expect(mockRelease).toHaveBeenCalledWith(undefined)
  })

  it.each([
    { type: 'date', oid: 1082, raw: '2026-03-03' },
    { type: 'timestamp', oid: 1114, raw: '2026-03-03 14:05:09.123456' },
    { type: 'timestamptz', oid: 1184, raw: '2026-03-02 00:00:00+01' },
  ])('asks the driver for the raw text of a $type value', async ({ oid, raw }) => {
    stubReadOnlyQuery({ rows: [], fields: [] })

    await runTypedQuery(1, 'SELECT * FROM t', { maxRows: 10, timeoutMs: 1000 })
    const parse = dataQueries()[0].types.getTypeParser(oid, 'text')

    expect(parse(raw)).toBe(raw)
    expect(mockDefaultTypeParser).not.toHaveBeenCalled()
  })

  it('keeps the default parser of the driver for every other type', async () => {
    const parseInteger = value => Number.parseInt(value, 10)
    mockDefaultTypeParser.mockReturnValue(parseInteger)
    stubReadOnlyQuery({ rows: [], fields: [] })

    await runTypedQuery(1, 'SELECT * FROM t', { maxRows: 10, timeoutMs: 1000 })
    const parse = dataQueries()[0].types.getTypeParser(23, 'text')

    expect(parse).toBe(parseInteger)
    expect(mockDefaultTypeParser).toHaveBeenCalledTimes(1)
    expect(mockDefaultTypeParser).toHaveBeenCalledWith(23, 'text')
  })

  it('marks the result as truncated and keeps the row cap when the query returns more rows', async () => {
    stubReadOnlyQuery({ rows: [{ id: 1 }, { id: 2 }, { id: 3 }], fields: [{ name: 'id', dataTypeID: 23 }] })

    const result = await runTypedQuery(1, 'SELECT id FROM t', { maxRows: 2, timeoutMs: 1000 })

    expect(result.truncated).toBe(true)
    expect(result.rows).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('does not mark a result as truncated when it holds exactly the row cap', async () => {
    stubReadOnlyQuery({ rows: [{ id: 1 }, { id: 2 }], fields: [{ name: 'id', dataTypeID: 23 }] })

    const result = await runTypedQuery(1, 'SELECT id FROM t', { maxRows: 2, timeoutMs: 1000 })

    expect(dataQueries()[0].text).toBe('SELECT * FROM (SELECT id FROM t) AS _q LIMIT 3')
    expect(result.truncated).toBe(false)
    expect(result.rows).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('rejects anything that is not a SELECT or a WITH before opening a connection', async () => {
    const failure = await runTypedQuery(1, 'UPDATE t SET a = 1', { maxRows: 10, timeoutMs: 1000 }).catch(err => err)

    expect(failure).toBeInstanceOf(ReadOnlyQueryError)
    expect(failure.message).toBe('Only SELECT and WITH (CTE) queries are allowed.')
    expect(mockClientQuery).not.toHaveBeenCalled()
  })

  it('rolls back and explains a query the statement timeout cancelled', async () => {
    const timeout = Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' })
    stubReadOnlyQuery(timeout)

    const failure = await runTypedQuery(1, 'SELECT * FROM events', { maxRows: 10, timeoutMs: 1000 }).catch(err => err)

    expect(failure.message).toMatch(/^canceling statement due to statement timeout The query ran longer/)
    expect(failure.code).toBe('57014')
    expect(mockClientQuery).toHaveBeenLastCalledWith('ROLLBACK')
    expect(mockRelease).toHaveBeenCalledTimes(1)
  })

  it('explains an unknown column with the columns of the tables in the query', async () => {
    stubReadOnlyQuery(Object.assign(new Error('column "kind" does not exist'), { code: '42703' }))
    mockQuery.mockResolvedValueOnce({ rows: [{ table_schema: 'public', table_name: 'orders', column_name: 'id' }] })

    const failure = await runTypedQuery(1, 'SELECT kind FROM orders', { maxRows: 10, timeoutMs: 1000 }).catch(
      err => err
    )

    expect(failure.message).toBe('column "kind" does not exist Columns of the tables in this query: public.orders: id.')
    expect(mockQuery).toHaveBeenCalledTimes(1)
  })

  it.each([
    {
      kind: 'says that no table has a similar name without naming a tool of the agent',
      lookup: { rows: [] },
      message: 'relation "returnz" does not exist No table name contains "returnz".',
    },
    {
      kind: 'lists the tables with a similar name',
      lookup: { rows: [{ table_schema: 'public', table_name: 'orders_returnz' }] },
      message: 'relation "returnz" does not exist Tables whose name contains "returnz": public.orders_returnz.',
    },
  ])('$kind when a table is missing', async ({ lookup, message }) => {
    const original = Object.assign(new Error('relation "returnz" does not exist'), { code: '42P01' })
    stubReadOnlyQuery(original)
    mockQuery.mockResolvedValueOnce(lookup)

    const failure = await runTypedQuery(1, 'SELECT * FROM returnz', { maxRows: 10, timeoutMs: 1000 }).catch(err => err)

    expect(failure.message).toBe(message)
    expect(failure.message).not.toContain('list_database_tables')
    expect(failure.code).toBe('42P01')
    expect(failure.cause).toBe(original)
  })

  it('keeps the hint free of tool names when the table lookup itself fails', async () => {
    stubReadOnlyQuery(Object.assign(new Error('relation "returnz" does not exist'), { code: '42P01' }))
    mockQuery.mockRejectedValueOnce(new Error('permission denied'))

    const failure = await runTypedQuery(1, 'SELECT * FROM returnz', { maxRows: 10, timeoutMs: 1000 }).catch(err => err)

    expect(failure.message).toBe('relation "returnz" does not exist No table name contains "returnz".')
  })
})
