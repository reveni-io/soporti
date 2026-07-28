import { questionsForCategories } from '../example-questions.js'

const GENERAL_STEPS = [
  {
    id: 'intro',
    title: 'Meet Soporti',
    description:
      'Soporti is your AI teammate. It can read our code, query data, and search docs, tickets and errors — ' +
      'then explain what it finds in plain language. Everything is read-only: it cannot change code, data or ' +
      'settings, so you cannot break anything by asking.',
  },
  {
    id: 'sources',
    title: 'Choose where it looks',
    description:
      'Every chat uses the sources selected in the sidebar. Leave YOLO (auto) on and Soporti picks the right ' +
      'tools for each question, or select specific repos and integrations to focus its search.',
    image: '/tour/sources.png',
  },
  {
    id: 'profiles',
    title: 'Answers that match your role',
    description:
      'The profile toggle changes how Soporti answers. Support gives simplified, behavior-focused explanations. ' +
      'Tech goes into code-level detail, with file paths and architecture.',
    image: '/tour/profiles.png',
  },
]

const CAPABILITY_STEPS = [
  {
    id: 'code',
    integrationIds: ['github'],
    title: 'Ask how the product works',
    description:
      'Soporti reads the source code on GitHub, so you can ask how features behave, what the business rules ' +
      'are, or why something works the way it does — without reading code yourself.',
    categories: ['product'],
  },
  {
    id: 'data',
    integrationIds: ['postgres', 'shopify'],
    title: 'Look up live data',
    description:
      'Ask about production data in plain language. Soporti writes the queries for you and can turn the ' +
      'results into tables and charts.',
    image: '/tour/data-answer.png',
    categories: ['data', 'orders'],
  },
  {
    id: 'docs',
    integrationIds: ['notion', 'helpjuice', 'google-drive'],
    title: 'Search the company docs',
    description:
      'Soporti can read internal documentation and help center articles to answer questions about processes ' +
      'and policies.',
    categories: ['docs'],
  },
  {
    id: 'tracking',
    integrationIds: ['shortcut', 'sentry', 'betterstack'],
    title: 'Check tickets and errors',
    description:
      'Ask about the status of ongoing work, paste a Sentry link or alert and ask what caused the error, or have ' +
      'it dig through the application logs — all without leaving the chat.',
    categories: ['tickets', 'errors'],
  },
]

const TIPS_STEP = {
  id: 'tips',
  title: 'A few tips before you start',
  bullets: [
    'Conversations are saved in the sidebar, so you can pick up where you left off.',
    'Use the share button at the top to send a conversation to a teammate.',
    'Set custom instructions in the sidebar so answers fit how you work.',
    'If an answer looks off, just ask a follow-up — Soporti keeps the context of the chat.',
  ],
}

export function buildSteps(integrations) {
  const steps = [...GENERAL_STEPS]

  for (const step of CAPABILITY_STEPS) {
    const matching = integrations.filter(integration => step.integrationIds.includes(integration.id))
    if (matching.length === 0) continue

    const examples = questionsForCategories(step.categories, integrations)
    steps.push({ ...step, integrations: matching, examples })
  }

  steps.push(TIPS_STEP)
  return steps
}
