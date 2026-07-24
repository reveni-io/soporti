export const EXAMPLE_QUESTIONS = [
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

  {
    category: 'tickets',
    integrationId: 'shortcut',
    text: 'What is the status of story sc-1234?',
  },

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

export function questionsForCategories(categories, integrations, count = 3) {
  const configured = new Set(integrations.map(i => i.id))
  const lists = categories.map(category =>
    EXAMPLE_QUESTIONS.filter(q => q.category === category && isAvailable(q, configured))
  )
  return interleave(lists, count)
}
