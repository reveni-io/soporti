// Example questions shown in the chat empty state. Deliberately generic so
// they make sense for any product — tune them to your own domain if you like.
// Questions tagged with an integrationId are only shown when that integration
// is configured.
export const EXAMPLE_QUESTIONS = [
  // How the product behaves (answered from code, always available via GitHub)
  {
    category: 'product',
    integrationId: 'github',
    text: 'What happens when a user tries to sign up with an email that already exists?',
  },
  {
    category: 'product',
    integrationId: 'github',
    text: 'How are webhook deliveries retried when the receiving server is down?',
  },
  {
    category: 'product',
    integrationId: 'github',
    text: 'Why would a customer stop receiving notification emails?',
  },
  {
    category: 'product',
    integrationId: 'github',
    text: 'How can the language of the customer portal be changed?',
  },
  {
    category: 'product',
    integrationId: 'github',
    text: 'Where is the discount logic implemented, and can two discounts be combined?',
  },
  {
    category: 'product',
    integrationId: 'github',
    text: 'What conditions must be met to cancel an order from the dashboard?',
  },
  {
    category: 'product',
    integrationId: 'github',
    text: 'Is the public API rate limited, and what are the limits?',
  },
  {
    category: 'product',
    integrationId: 'github',
    text: 'What credentials does a customer need to provide to activate an integration?',
  },

  // Live data lookups (agent's read-only database)
  {
    category: 'data',
    integrationId: 'postgres',
    text: 'How many active customers do we have, and since when is each one active?',
  },
  {
    category: 'data',
    integrationId: 'postgres',
    text: 'What are the most common error codes in payments this month?',
  },
  {
    category: 'data',
    integrationId: 'postgres',
    text: 'Which accounts have the most orders this year?',
  },
  {
    category: 'data',
    integrationId: 'postgres',
    text: 'Which customer does this order ID belong to: <order id>?',
  },
  {
    category: 'data',
    integrationId: 'postgres',
    text: 'Show a chart of new signups per day over the last month',
  },

  // Orders in Shopify
  {
    category: 'orders',
    integrationId: 'shopify',
    text: 'Look up order #12345 in Shopify for the Acme store and summarize its status',
  },
  {
    category: 'orders',
    integrationId: 'shopify',
    text: 'What sales channels does the Acme store have?',
  },

  // Production errors
  {
    category: 'errors',
    integrationId: 'sentry',
    text: 'What are the most frequent production errors in the frontend this week?',
  },
  {
    category: 'errors',
    integrationId: 'sentry',
    text: 'Explain this Sentry error and its likely cause: <paste a Sentry link>',
  },

  // Internal docs and help center
  {
    category: 'docs',
    integrationId: 'helpjuice',
    text: 'What do our help articles say about refunds?',
  },
  {
    category: 'docs',
    integrationId: 'notion',
    text: 'What does Notion say about the customer onboarding process?',
  },
  {
    category: 'docs',
    integrationId: 'google-drive',
    text: 'Find the latest pricing doc in Google Drive and summarize it',
  },

  // Ongoing work
  {
    category: 'tickets',
    integrationId: 'shortcut',
    text: 'What is the status of story sc-1234?',
  },

  // Always available, even if the integrations fetch fails
  {
    category: 'general',
    text: 'What tools and data do you have access to?',
  },
]

function shuffle(items, random) {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// Picks up to `count` questions by alternating between the given lists, so no
// single category dominates the result.
function interleave(lists, count) {
  const picked = []
  for (let round = 0; picked.length < count; round++) {
    const before = picked.length
    for (const list of lists) {
      if (round < list.length && picked.length < count) picked.push(list[round])
    }
    if (picked.length === before) break
  }
  return picked
}

function isAvailable(question, configuredIds) {
  return !question.integrationId || configuredIds.has(question.integrationId)
}

// Returns a random sample of questions available for the configured
// integrations, spread across categories.
export function sampleExampleQuestions(integrations, count = 4, random = Math.random) {
  const configured = new Set(integrations.map(i => i.id))
  const available = EXAMPLE_QUESTIONS.filter(q => isAvailable(q, configured))

  const byCategory = new Map()
  for (const question of available) {
    if (!byCategory.has(question.category)) byCategory.set(question.category, [])
    byCategory.get(question.category).push(question)
  }

  const lists = shuffle([...byCategory.values()], random).map(list => shuffle(list, random))
  return interleave(lists, count)
}

// Returns up to `count` questions from the given categories that are available
// for the configured integrations, in curated pool order. Deterministic, for
// places like the tour where the examples should be stable.
export function questionsForCategories(categories, integrations, count = 3) {
  const configured = new Set(integrations.map(i => i.id))
  const lists = categories.map(category =>
    EXAMPLE_QUESTIONS.filter(q => q.category === category && isAvailable(q, configured))
  )
  return interleave(lists, count)
}
