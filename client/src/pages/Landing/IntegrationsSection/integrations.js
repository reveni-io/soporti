export const INTEGRATIONS = [
  {
    id: 'github',
    name: 'GitHub',
    desc: 'Browses directories, reads files, searches code and even runs git log & blame in an ephemeral clone to explain how the product actually works.',
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    desc: 'Writes and runs read-only SQL across every PostgreSQL database you connect, each under a name the team recognizes (capped and mutation-free), then turns the rows into tables and charts.',
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
    id: 'gmail',
    name: 'Gmail',
    desc: 'Searches and reads your own inbox with the same search you use in Gmail, whole threads included, so the answer a customer got by email is one question away. Read-only: it never sends, drafts or deletes, and it treats what an email says as text to quote, never as instructions. Connected with your Google sign-in — nobody reads anyone else’s mail.',
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    desc: 'Reads your own calendar — who is in a meeting, the agenda and the Meet link — and checks when your colleagues are free. Read-only: it never creates or moves an event. Connected with your Google sign-in.',
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
    id: 'hubspot',
    name: 'HubSpot',
    desc: 'Searches and reads your CRM — contacts, companies, deals, tickets, their activity timeline, lists, inbox conversations and marketing campaigns — and, only in the areas you open up in /admin, creates and updates records, logs calls and notes signed “Via Soporti” and replies to customers as your own HubSpot user. In a conversation it shows you the change first and only makes it once you say yes.',
  },
  {
    id: 'figma',
    name: 'Figma',
    desc: 'Opens the designs you link: lists pages and frames, reads the layers of a screen — copy, fonts, colors, components — and renders a screenshot it can see and show in the chat. Switch comments on and it can leave feedback on a frame for you.',
  },
  {
    id: 'slack',
    name: 'Slack',
    desc: 'Lists the channels and reads their messages and threads — who said what and when, with a link to each message — so the answer settled in #support last week is one question away. It reads the channels the bot was added to, a private one only for the people in it, and refuses direct and group messages in code.',
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
    desc: 'Traces every agent run to your Langfuse, cloud or self-hosted: the question and final answer of each run, every model call with its tokens and cost, cache reads and writes priced apart, the reasoning effort a video ran with, and every tool call with what it returned, grouped by conversation, PR or ticket, so you can see why an answer or a review went wrong. Known secret formats are redacted on the way out, and one switch sends metadata only.',
  },
]
