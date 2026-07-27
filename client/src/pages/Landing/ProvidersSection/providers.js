export const LLM_PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    desc: 'Conversations are kept on OpenAI between turns, so long threads are compacted server-side and picked back up without resending the history.',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    desc: 'Claude through the Messages API. Anthropic stores nothing between turns, so Soporti keeps the transcript in your own database and replays it.',
  },
]
