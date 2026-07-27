import OpenAI from 'openai'
import { getKnowledgeApiKey, getVectorStoreId, isKnowledgeConfigured } from './settings.js'

const MIN_SCORE = 0.6

let clientInstance = null
let clientInstanceKey = null

function resolveClient(apiKey) {
  if (!clientInstance || clientInstanceKey !== apiKey) {
    clientInstance = new OpenAI({ apiKey })
    clientInstanceKey = apiKey
  }
  return clientInstance
}

async function resolveStore() {
  const [storeId, apiKey] = await Promise.all([getVectorStoreId(), getKnowledgeApiKey()])
  return storeId && apiKey ? { storeId, client: resolveClient(apiKey) } : null
}

export async function isKnowledgeBaseConfigured() {
  return isKnowledgeConfigured()
}

export async function searchSimilarCases(query, maxResults = 3) {
  const resolved = await resolveStore()
  if (!resolved) return []
  const { storeId, client } = resolved

  try {
    const results = await client.vectorStores.search(storeId, {
      query,
      max_num_results: maxResults,
    })

    return (results.data || [])
      .filter(item => item.score >= MIN_SCORE)
      .map(item => {
        try {
          const parsed = JSON.parse(item.content?.[0]?.text || '{}')
          return {
            question: parsed.question || '',
            answer: parsed.answer || '',
            score: item.score,
          }
        } catch {
          return null
        }
      })
      .filter(Boolean)
  } catch (err) {
    console.error('Vector Store search failed:', err.message)
    return []
  }
}

export async function countSolvedCases() {
  const resolved = await resolveStore()
  if (!resolved) return 0
  const { storeId, client } = resolved

  const store = await client.vectorStores.retrieve(storeId)
  return store.file_counts?.total ?? 0
}

export async function saveSolvedCase(question, answer) {
  const resolved = await resolveStore()
  if (!resolved) {
    throw new Error('Knowledge base not configured. Set the vector store in the admin panel (Knowledge section).')
  }
  const { storeId, client } = resolved

  const content = JSON.stringify({
    question,
    answer,
    created_at: new Date().toISOString(),
  })

  const fileName = `case-${Date.now()}.json`
  const file = await client.files.create({
    file: new File([content], fileName, { type: 'application/json' }),
    purpose: 'assistants',
  })

  await client.vectorStores.files.create(storeId, { file_id: file.id })

  return file.id
}

export function _resetKnowledgeClientForTests() {
  clientInstance = null
  clientInstanceKey = null
}
