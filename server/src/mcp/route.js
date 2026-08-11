import { Readable, pipeline } from 'node:stream'
import { Router } from 'express'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { createSoportiMcpServer } from './server.js'

const KEEP_ALIVE_MS = 15_000
const SSE_CONTENT_TYPE = 'text/event-stream'

function toWebRequest(req, signal) {
  const url = new URL(req.originalUrl, `${req.protocol}://${req.get('host')}`)
  const headers = new Headers()

  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(name, entry)
    } else if (value !== undefined) {
      headers.set(name, value)
    }
  }

  return new Request(url, { method: req.method, headers, signal })
}

function toAuthInfo(req) {
  return {
    token: '',
    clientId: String(req.user.id),
    scopes: req.apiKey?.sources ?? [],
    extra: { user: req.user, apiKey: req.apiKey },
  }
}

export default function mcpRoute() {
  const handler = createMcpHandler(ctx => createSoportiMcpServer(ctx.authInfo?.extra), {
    legacy: 'stateless',
    responseMode: 'sse',
    keepAliveMs: KEEP_ALIVE_MS,
    onerror: err => console.error('Rejected an MCP request:', err.message),
  })

  const router = Router()

  router.all('/', async (req, res) => {
    const abort = new AbortController()
    res.on('close', () => {
      if (!res.writableFinished) abort.abort()
    })

    try {
      const response = await handler.fetch(toWebRequest(req, abort.signal), {
        authInfo: toAuthInfo(req),
        parsedBody: req.method === 'POST' ? req.body : undefined,
      })

      res.status(response.status)
      response.headers.forEach((value, name) => res.setHeader(name, value))
      if (response.headers.get('content-type')?.startsWith(SSE_CONTENT_TYPE)) {
        res.setHeader('X-Accel-Buffering', 'no')
      }

      if (!response.body) return res.end()

      pipeline(Readable.fromWeb(response.body), res, err => {
        if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
          console.error('Failed to stream an MCP response:', err)
        }
      })
    } catch (err) {
      console.error('Failed to serve an MCP request:', err)
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error.' })
    }
  })

  return router
}
