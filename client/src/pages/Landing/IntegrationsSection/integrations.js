export const INTEGRATIONS = [
  {
    id: 'github',
    name: 'GitHub',
    desc: 'Browses directories, reads files, searches code and even runs git log & blame in an ephemeral clone to explain how the product actually works.',
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    desc: 'Writes and runs read-only SQL against production data (capped and mutation-free), then turns the rows into tables and charts.',
  },
  {
    id: 'shopify',
    name: 'Shopify',
    desc: "Looks up orders, fulfilments and products via the Admin API — fetching each store's expiring token from your own token service, so it can reconcile backend data against the real store.",
  },
  {
    id: 'sentry',
    name: 'Sentry',
    desc: 'Pulls issues and the latest event stack trace, so you can paste a link and ask what caused an error.',
  },
  {
    id: 'betterstack',
    name: 'Better Stack',
    desc: 'Searches your application logs and runs read-only SQL over them, so you can ask what failed in production and when.',
  },
  {
    id: 'notion',
    name: 'Notion',
    desc: 'Reads internal Notion pages and databases to answer questions about processes and policies.',
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    desc: 'Finds and reads Docs, Sheets, Slides, PDFs, Word, Excel and PowerPoint across shared drives — read-only.',
  },
  {
    id: 'helpjuice',
    name: 'Help Center',
    icon: 'help-center',
    desc: 'Searches and reads Helpjuice knowledge-base articles to answer questions the way customers see them.',
  },
  {
    id: 'granola',
    name: 'Granola',
    icon: 'meeting-notes',
    desc: 'Reads your own meeting notes so a decision made on a call is an answer, not something you retype. Each person connects their own account — nobody reads anyone else’s.',
  },
  {
    id: 'zendesk',
    name: 'Zendesk',
    desc: 'Reads, searches and lists your tickets and views — the requester, the status and the whole thread, internal notes included — so a skill can gather the answer from the database or the docs and leave the draft on the ticket as an internal note. It never replies to the customer, never changes a status. Each person connects their own account.',
  },
  {
    id: 'sendcloud',
    name: 'Sendcloud',
    desc: 'Finds the parcels of an order, follows their tracking timeline, reads returns with their reason and refund, checks carriers and products for a route, pickups, service points and addresses, and spots a webhook that stopped updating — across every Sendcloud account you link, one per brand or store. Read-only: it never creates a label or cancels a parcel.',
  },
  {
    id: 'figma',
    name: 'Figma',
    desc: 'Opens the designs you link: lists pages and frames, reads the layers of a screen — copy, fonts, colors, components — and renders a screenshot it can see and show in the chat. Switch comments on and it can leave feedback on a frame for you.',
  },
  {
    id: 'shortcut',
    name: 'Shortcut',
    desc: 'Fetches stories, epics, status and acceptance criteria so you can track ongoing work from the chat — and, if you switch write access on, files the bug for you, always asking whose name it goes under.',
  },
  {
    id: 'langfuse',
    name: 'Langfuse',
    icon: 'clock',
    desc: 'Traces every agent run to your Langfuse, cloud or self-hosted: the question and final answer of each run, every model call with its tokens and cost, cache reads and writes priced apart, and every tool call with what it returned, grouped by conversation, PR or ticket, so you can see why an answer or a review went wrong. Known secret formats are redacted on the way out, and one switch sends metadata only.',
  },
]
