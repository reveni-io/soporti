import { redactSecrets } from '../review/output-guard.js'
import { getZendeskConnection, isZendeskConfigured } from './settings.js'

const REQUEST_TIMEOUT_MS = 15_000
const PAGE_SIZE = 100
const MAX_COMMENT_PAGES = 5
const MAX_VIEW_PAGES = 5
const MAX_COMMENT_CHARS = 10_000
const MAX_ERROR_CHARS = 300
const TICKET_URL_RE = /^(?:https?:\/\/)?([a-z0-9-]+)\.zendesk\.com\/.*\/tickets\/(\d{1,20})(?:\D.*)?$/i
const TICKET_ID_RE = /^#?(\d{1,20})$/
const VIEW_ID_RE = /^\d{1,20}$/
const NOT_CONNECTED_MESSAGE =
  'Zendesk is not connected for this user. Connect a Zendesk account in Settings → Connections.'
const REJECTED_MESSAGE =
  'Zendesk rejected the credentials. The API token may have been revoked or the email may not match it — reconnect Zendesk in Settings → Connections.'
const FORBIDDEN_MESSAGE =
  'Zendesk refused the request: the agent behind this connection is not allowed to do that on this ticket.'
const COMMENTS_CAPPED_NOTICE = `Only the first ${PAGE_SIZE * MAX_COMMENT_PAGES} comments are included. The rest of the thread is missing — say so instead of treating this as the whole conversation.`

function authorization({ email, apiToken }) {
  return `Basic ${Buffer.from(`${email}/token:${apiToken}`).toString('base64')}`
}

function ticketUrl(subdomain, ticketId) {
  return `https://${subdomain}.zendesk.com/agent/tickets/${ticketId}`
}

async function describeFailure(res, path) {
  if (res.status === 401) return REJECTED_MESSAGE
  if (res.status === 403) return FORBIDDEN_MESSAGE

  const text = (await res.text()).slice(0, MAX_ERROR_CHARS)
  return `Zendesk API ${path} failed (${res.status}): ${text}`
}

async function request(connection, path, { method = 'GET', body } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch(`https://${connection.subdomain}.zendesk.com/api/v2${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: authorization(connection),
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })

    if (!res.ok) throw new Error(await describeFailure(res, path))

    return res.json()
  } finally {
    clearTimeout(timer)
  }
}

async function requireConnection(userId) {
  const connection = await getZendeskConnection(userId)
  if (!connection) throw new Error(NOT_CONNECTED_MESSAGE)

  return connection
}

function parseTicketId(reference, subdomain) {
  const raw = String(reference ?? '').trim()

  const urlMatch = raw.match(TICKET_URL_RE)
  if (urlMatch) {
    if (urlMatch[1].toLowerCase() !== subdomain) {
      throw new Error(
        `That ticket belongs to ${urlMatch[1]}.zendesk.com, but this connection is ${subdomain}.zendesk.com.`
      )
    }
    return urlMatch[2]
  }

  const idMatch = raw.match(TICKET_ID_RE)
  if (idMatch) return idMatch[1]

  throw new Error(`"${raw}" is neither a Zendesk ticket id nor a ticket url.`)
}

function pagePath(path, cursor) {
  const separator = path.includes('?') ? '&' : '?'
  const cursorParam = cursor ? `&page[after]=${encodeURIComponent(cursor)}` : ''

  return `${path}${separator}page[size]=${PAGE_SIZE}${cursorParam}`
}

function nextCursor(data) {
  return data.meta?.has_more ? (data.meta.after_cursor ?? null) : null
}

async function* paginate(connection, path, maxPages) {
  let cursor = null

  for (let page = 0; page < maxPages; page++) {
    const data = await request(connection, pagePath(path, cursor))
    cursor = nextCursor(data)

    yield { data, hasMore: Boolean(cursor) }
    if (!cursor) return
  }
}

function indexUsers(users) {
  return new Map((users || []).map(user => [user.id, user]))
}

function toPerson(user) {
  if (!user) return null

  return { name: user.name ?? null, email: user.email ?? null }
}

function toCommentBody(comment) {
  const body = comment.plain_body ?? comment.body ?? ''
  if (body.length <= MAX_COMMENT_CHARS) return { body }

  return { body: body.slice(0, MAX_COMMENT_CHARS), truncated: true }
}

function toComment(comment, users) {
  const author = users.get(comment.author_id)

  return {
    id: comment.id,
    author: author?.name ?? null,
    authorRole: author?.role ?? null,
    public: Boolean(comment.public),
    createdAt: comment.created_at,
    ...toCommentBody(comment),
  }
}

async function fetchComments(connection, ticketId) {
  const comments = []
  const users = new Map()
  let capped = false

  for await (const page of paginate(
    connection,
    `/tickets/${ticketId}/comments.json?include=users`,
    MAX_COMMENT_PAGES
  )) {
    for (const user of page.data.users || []) users.set(user.id, user)
    comments.push(...(page.data.comments || []))
    capped = page.hasMore
  }

  return { comments, users, capped }
}

export async function getTicket(userId, reference) {
  const connection = await requireConnection(userId)
  const ticketId = parseTicketId(reference, connection.subdomain)

  const [{ ticket, users: ticketUsers }, thread] = await Promise.all([
    request(connection, `/tickets/${ticketId}.json?include=users`),
    fetchComments(connection, ticketId),
  ])
  const users = new Map([...indexUsers(ticketUsers), ...thread.users])

  return {
    id: ticket.id,
    url: ticketUrl(connection.subdomain, ticket.id),
    subject: ticket.subject ?? '',
    status: ticket.status,
    priority: ticket.priority ?? null,
    tags: ticket.tags || [],
    requester: toPerson(users.get(ticket.requester_id)),
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at,
    comments: thread.comments.map(comment => toComment(comment, users)),
    ...(thread.capped ? { notice: COMMENTS_CAPPED_NOTICE } : {}),
  }
}

function parseViewId(viewId) {
  const raw = String(viewId ?? '').trim()

  if (!VIEW_ID_RE.test(raw)) {
    throw new Error(`"${raw}" is not a Zendesk view id. Use zendesk_list_views to find the id of a view by its name.`)
  }

  return raw
}

async function fetchRequesters(connection, tickets) {
  const ids = [...new Set(tickets.map(ticket => ticket.requester_id).filter(Boolean))]
  if (ids.length === 0) return new Map()

  const data = await request(connection, `/users/show_many.json?ids=${ids.join(',')}`)
  return indexUsers(data.users)
}

function toTicketSummary(ticket, requesters, subdomain) {
  return {
    id: ticket.id,
    url: ticketUrl(subdomain, ticket.id),
    subject: ticket.subject ?? '',
    requester: toPerson(requesters.get(ticket.requester_id)),
    status: ticket.status,
    updatedAt: ticket.updated_at,
  }
}

async function summarizeTickets(connection, tickets) {
  const requesters = await fetchRequesters(connection, tickets)

  return tickets.map(ticket => toTicketSummary(ticket, requesters, connection.subdomain))
}

export async function listViews(userId) {
  const connection = await requireConnection(userId)

  const views = []
  let truncated = false
  for await (const page of paginate(connection, '/views.json?active=true', MAX_VIEW_PAGES)) {
    views.push(...(page.data.views || []))
    truncated = page.hasMore
  }

  return {
    views: views.map(view => ({ id: view.id, title: view.title ?? '', personal: Boolean(view.restriction) })),
    truncated,
  }
}

export async function listViewTickets(userId, viewId) {
  const connection = await requireConnection(userId)
  const resolvedViewId = parseViewId(viewId)

  const data = await request(connection, pagePath(`/views/${resolvedViewId}/tickets.json`, null))

  return {
    viewId: resolvedViewId,
    tickets: await summarizeTickets(connection, data.tickets || []),
    truncated: Boolean(data.meta?.has_more),
  }
}

export async function searchTickets(userId, query) {
  const connection = await requireConnection(userId)
  const trimmed = String(query ?? '').trim()

  if (!trimmed) throw new Error('A Zendesk search needs a query.')

  const fullQuery = encodeURIComponent(`type:ticket ${trimmed}`)
  const data = await request(connection, `/search.json?query=${fullQuery}&per_page=${PAGE_SIZE}`)

  return {
    query: trimmed,
    count: data.count,
    tickets: await summarizeTickets(connection, data.results || []),
    truncated: Boolean(data.next_page),
  }
}

export async function postInternalNote(userId, reference, body) {
  const connection = await requireConnection(userId)
  const ticketId = parseTicketId(reference, connection.subdomain)
  const text = redactSecrets(String(body ?? '').trim())

  if (!text) throw new Error('An internal note needs a body.')

  const data = await request(connection, `/tickets/${ticketId}.json`, {
    method: 'PUT',
    body: { ticket: { comment: { body: text, public: false } } },
  })
  const note = (data.audit?.events || []).find(event => event.type === 'Comment')

  return {
    ticketId: Number(ticketId),
    noteId: note?.id ?? null,
    public: false,
    url: ticketUrl(connection.subdomain, ticketId),
  }
}

export async function isConfigured(userId) {
  return isZendeskConfigured(userId)
}
