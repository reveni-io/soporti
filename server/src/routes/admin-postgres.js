import { Router } from 'express'
import {
  DUPLICATE_POSTGRES_CONNECTION,
  DUPLICATE_POSTGRES_CONNECTION_MESSAGE,
  addPostgresConnection,
  describePostgresConnection,
  editPostgresConnection,
  getPostgresConnections,
  getPostgresMaxRows,
  parsePostgresConnection,
  parsePostgresConnectionChanges,
  removePostgresConnection,
  setPostgresMaxRows,
} from '../postgres/settings.js'
import { clearQueryCache } from '../analytics/query-cache.js'

const ID_RE = /^\d{1,9}$/
const UNIQUE_VIOLATION = '23505'
const DUPLICATE_CODES = new Set([DUPLICATE_POSTGRES_CONNECTION, UNIQUE_VIOLATION])
const INVALID_ID_ERROR = 'Invalid database connection ID.'
const NOT_FOUND_ERROR = 'Database connection not found.'

const router = Router()

function errorCode(err) {
  return err.cause?.code ?? err.code
}

function describeWriteFailure(err) {
  return err.cause?.message ?? err.name
}

router.get('/', async (_req, res) => {
  try {
    const [connections, maxRows] = await Promise.all([getPostgresConnections(), getPostgresMaxRows()])
    res.json({ connections: connections.map(describePostgresConnection), maxRows })
  } catch (err) {
    console.error('Failed to read the database settings:', err)
    res.status(500).json({ error: 'Failed to read the database settings.' })
  }
})

router.post('/connections', async (req, res) => {
  const { error, value } = parsePostgresConnection(req.body ?? {})
  if (error) return res.status(400).json({ error })

  try {
    const connection = await addPostgresConnection(value)
    res.status(201).json({ connection: describePostgresConnection(connection) })
  } catch (err) {
    if (DUPLICATE_CODES.has(errorCode(err))) {
      return res.status(409).json({ error: DUPLICATE_POSTGRES_CONNECTION_MESSAGE })
    }

    console.error('Failed to add the database connection:', describeWriteFailure(err))
    res.status(500).json({ error: 'Failed to add the database connection.' })
  }
})

router.put('/connections/:id', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: INVALID_ID_ERROR })

  const { error, value } = parsePostgresConnectionChanges(req.body ?? {})
  if (error) return res.status(400).json({ error })

  try {
    const connection = await editPostgresConnection(Number(req.params.id), value)
    if (!connection) return res.status(404).json({ error: NOT_FOUND_ERROR })

    if (value.connectionString) clearQueryCache()
    res.json({ connection: describePostgresConnection(connection) })
  } catch (err) {
    if (DUPLICATE_CODES.has(errorCode(err))) {
      return res.status(409).json({ error: DUPLICATE_POSTGRES_CONNECTION_MESSAGE })
    }

    console.error('Failed to save the database connection:', describeWriteFailure(err))
    res.status(500).json({ error: 'Failed to save the database connection.' })
  }
})

router.delete('/connections/:id', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: INVALID_ID_ERROR })

  try {
    const removed = await removePostgresConnection(Number(req.params.id))
    if (!removed) return res.status(404).json({ error: NOT_FOUND_ERROR })

    clearQueryCache()
    res.json({ deleted: true })
  } catch (err) {
    console.error('Failed to remove the database connection:', err)
    res.status(500).json({ error: 'Failed to remove the database connection.' })
  }
})

router.put('/max-rows', async (req, res) => {
  const { maxRows } = req.body ?? {}

  if (maxRows === '' || maxRows === null || maxRows === undefined) {
    try {
      await setPostgresMaxRows(null)
      return res.json({ maxRows: await getPostgresMaxRows() })
    } catch (err) {
      console.error('Admin clear postgres max-rows error:', err)
      return res.status(500).json({ error: 'Failed to save the row limit.' })
    }
  }

  const n = Number(maxRows)
  if (!Number.isInteger(n) || n < 1) {
    return res.status(400).json({ error: '"maxRows" must be an integer greater than or equal to 1.' })
  }

  try {
    await setPostgresMaxRows(n)
    res.json({ maxRows: await getPostgresMaxRows() })
  } catch (err) {
    console.error('Admin set postgres max-rows error:', err)
    res.status(500).json({ error: 'Failed to save the row limit.' })
  }
})

export default router
