export const LLM_PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    models: 'gpt-4o · gpt-5.2-codex',
    desc: 'Conversations are kept on OpenAI between turns, so long threads are compacted server-side and picked back up without resending the history.',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: 'claude-opus-5 · claude-sonnet-5',
    desc: 'Claude through the Messages API. Anthropic stores nothing between turns, so Soporti keeps the transcript in your own database and replays it.',
  },
]
