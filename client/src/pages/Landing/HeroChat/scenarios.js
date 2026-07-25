export const SCENARIOS = [
  {
    question: 'How many returns did Acme get in the last 7 days?',
    tools: [{ emoji: '🗄️', label: 'Querying database', detail: 'returns · merchant Acme', duration: '1.2s' }],
    answer: [
      { t: 'Acme had ' },
      { t: '1,284 returns', b: true },
      { t: ' in the last 7 days, ' },
      { t: 'up 12%', b: true },
      { t: ' from the week before. Top reason: ' },
      { t: 'wrong size', b: true },
      { t: ' (38%).' },
    ],
  },
  {
    question: 'Look up order #1024 in Shopify for Acme',
    tools: [
      { emoji: '🛍️', label: 'Searching Shopify', detail: 'order #1024', duration: '0.8s' },
      { emoji: '🗄️', label: 'Querying database', detail: 'return status', duration: '0.6s' },
    ],
    answer: [
      { t: 'Order ' },
      { t: '#1024', b: true },
      { t: ' is ' },
      { t: 'fulfilled', b: true },
      { t: ' and has an open return in ' },
      { t: '“label printed”', b: true },
      { t: ' status. The ' },
      { t: '€42.50', b: true },
      { t: ' refund is issued once it’s received.' },
    ],
  },
  {
    question: 'Why isn’t the exchange label emailed to the customer?',
    tools: [
      { emoji: '🔍', label: 'Searching code', detail: '"shipping label" · returns-api', duration: '1.4s' },
      { emoji: '📄', label: 'Reading file', detail: 'labels/service.rb', duration: '0.5s' },
    ],
    answer: [
      { t: 'The label is only emailed when ' },
      { t: 'auto_send_label', b: true },
      { t: ' is on. For ' },
      { t: 'manual', b: true },
      { t: ' exchanges it’s attached to the returns page instead, so no email goes out.' },
    ],
  },
]
