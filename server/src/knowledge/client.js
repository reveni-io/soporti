import { getOpenAIClient } from '../openai/client.js'
import { getVectorStoreId } from '../openai/settings.js'

// The OpenAI API key and vector store id live in the database (admin panel →
// OpenAI section). Each call resolves them fresh (cached briefly); knowledge
// features degrade gracefully when either isn't configured.

// Resolves the vector store + client together (both cached reads), returning
// null when either is unconfigured so each caller can pick its own fallback.
async function resolveStore() {
  const [storeId, client] = await Promise.all([getVectorStoreId(), getOpenAIClient()])
  return storeId && client ? { storeId, client } : null
}

// Whether solved cases can be saved. The 👍/👎 feedback only makes sense when
// this is true — a saved case needs both a vector store and an API key to land.
export async function isKnowledgeBaseConfigured() {
  return (await resolveStore()) !== null
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

    const MIN_SCORE = 0.6

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
    throw new Error('OpenAI vector store not configured. Set it in the admin panel (OpenAI section).')
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
