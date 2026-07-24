import { getHelpjuiceApiKey, getHelpjuiceAccount, isHelpjuiceConfigured } from './settings.js'

const REQUEST_TIMEOUT_MS = 15_000

async function request(method, path) {
  const [apiKey, account] = await Promise.all([getHelpjuiceApiKey(), getHelpjuiceAccount()])
  if (!apiKey || !account) {
    throw new Error('Helpjuice is not configured. Set the API key and account in the admin panel (Helpjuice section).')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch(`https://${account}.helpjuice.com/api/v3${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Helpjuice API ${method} ${path} failed (${res.status}): ${text}`)
    }

    return res.json()
  } finally {
    clearTimeout(timer)
  }
}

function stripHtml(html) {
  if (!html) return ''
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export async function searchArticles(query) {
  const data = await request('GET', `/search?query=${encodeURIComponent(query)}`)
  const results = data.searches || []
  console.log(`[helpjuice] searchArticles("${query}") → ${results.length} results`)
  return results.map(item => ({
    id: item.id,
    title: item.name,
    url: item.url,
  }))
}

export async function getArticle(articleId) {
  const data = await request('GET', `/articles/${articleId}`)
  const article = data.article || data
  const rawBody = article.answer?.body || ''
  const body = stripHtml(rawBody)
  console.log(`[helpjuice] getArticle(${articleId}) "${article.name}" → ${body.length} chars`)
  return {
    id: article.id,
    title: article.name,
    url: article.url,
    body,
  }
}

export async function isConfigured() {
  return isHelpjuiceConfigured()
}
