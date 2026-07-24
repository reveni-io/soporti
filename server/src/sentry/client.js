import { getSentryToken, getSentryOrg, isSentryConfigured } from './settings.js'

const BASE_URL = 'https://sentry.io/api/0'

async function request(method, path) {
  const token = await getSentryToken()
  if (!token) {
    throw new Error(
      'Sentry is not configured. Set the auth token and organization in the admin panel (Sentry section).'
    )
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Sentry API ${method} ${path} failed (${res.status}): ${text}`)
  }

  return res.json()
}

function extractStacktrace(event) {
  if (!event) return null

  const exception = event.entries?.find(e => e.type === 'exception')
  if (!exception) return null

  const values = exception.data?.values || []
  return values.map(v => {
    const frames = (v.stacktrace?.frames || []).slice(-10).map(f => ({
      filename: f.filename,
      function: f.function,
      lineNo: f.lineNo,
      colNo: f.colNo,
      context: f.context,
    }))
    return {
      type: v.type,
      value: v.value,
      frames,
    }
  })
}

export async function getIssue(issueId) {
  const org = await getSentryOrg()
  const issue = await request('GET', `/organizations/${org}/issues/${issueId}/`)

  let stacktrace = null
  try {
    const event = await request('GET', `/organizations/${org}/issues/${issueId}/events/latest/`)
    stacktrace = extractStacktrace(event)
  } catch {}

  return {
    id: issue.id,
    shortId: issue.shortId,
    title: issue.title,
    status: issue.status,
    level: issue.level,
    count: issue.count,
    userCount: issue.userCount,
    firstSeen: issue.firstSeen,
    lastSeen: issue.lastSeen,
    culprit: issue.culprit,
    permalink: issue.permalink,
    assignee: issue.assignedTo
      ? {
          type: issue.assignedTo.type,
          name: issue.assignedTo.name,
        }
      : null,
    stacktrace,
  }
}

export async function searchIssues(query) {
  const org = await getSentryOrg()
  const issues = await request('GET', `/organizations/${org}/issues/?query=${encodeURIComponent(query)}&limit=10`)

  return (issues || []).map(i => ({
    id: i.id,
    shortId: i.shortId,
    title: i.title,
    status: i.status,
    count: i.count,
    lastSeen: i.lastSeen,
    permalink: i.permalink,
  }))
}

export async function isConfigured() {
  return isSentryConfigured()
}
