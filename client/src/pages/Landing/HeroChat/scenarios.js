export const HERO_SOURCES = [
  { id: 'github', label: 'GitHub', side: 'left', slot: 0 },
  { id: 'postgres', label: 'PostgreSQL', side: 'left', slot: 1 },
  { id: 'shopify', label: 'Shopify', side: 'left', slot: 2 },
  { id: 'sentry', label: 'Sentry', side: 'right', slot: 0 },
  { id: 'betterstack', label: 'Better Stack', side: 'right', slot: 1 },
  { id: 'notion', label: 'Notion', side: 'right', slot: 2 },
]

export const SCENARIOS = [
  {
    topic: 'data',
    question: 'How many returns did Acme get in the last 7 days?',
    tools: [{ source: 'postgres', label: 'Querying database', detail: 'returns · merchant Acme', duration: '1.2s' }],
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
    topic: 'orders',
    question: 'Look up order #1024 in Shopify for Acme',
    tools: [
      { source: 'shopify', label: 'Searching Shopify', detail: 'order #1024', duration: '0.8s' },
      { source: 'postgres', label: 'Querying database', detail: 'return status', duration: '0.6s' },
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
    topic: 'code',
    question: 'Why isn’t the exchange label emailed to the customer?',
    tools: [
      { source: 'github', label: 'Searching code', detail: '"shipping label" · returns-api', duration: '1.4s' },
      { source: 'github', label: 'Reading file', detail: 'labels/service.rb', duration: '0.5s' },
    ],
    answer: [
      { t: 'The label is only emailed when ' },
      { t: 'auto_send_label', b: true },
      { t: ' is on. For ' },
      { t: 'manual', b: true },
      { t: ' exchanges it’s attached to the returns page instead, so no email goes out.' },
    ],
  },
  {
    topic: 'errors',
    question: 'What broke checkout after this morning’s deploy?',
    tools: [
      { source: 'sentry', label: 'Opening Sentry issue', detail: 'CHECKOUT-482', duration: '0.9s' },
      { source: 'betterstack', label: 'Searching logs', detail: 'checkout · since 09:10', duration: '1.1s' },
    ],
    answer: [
      { t: 'Since the ' },
      { t: '09:10 deploy', b: true },
      { t: ', carts paid with a gift card throw in ' },
      { t: 'applyDiscount', b: true },
      { t: ': ' },
      { t: '212 events', b: true },
      { t: ' for ' },
      { t: '38 customers', b: true },
      { t: '.' },
    ],
  },
  {
    topic: 'docs',
    question: 'What is our refund policy for marketplace orders?',
    tools: [{ source: 'notion', label: 'Searching Notion', detail: 'refund policy · marketplace', duration: '0.7s' }],
    answer: [
      { t: 'Marketplace orders can be refunded within ' },
      { t: '30 days', b: true },
      { t: ' of delivery. Refunds over ' },
      { t: '€500', b: true },
      { t: ' need a manager’s approval, and the ' },
      { t: 'seller', b: true },
      { t: ' covers return shipping.' },
    ],
  },
]
