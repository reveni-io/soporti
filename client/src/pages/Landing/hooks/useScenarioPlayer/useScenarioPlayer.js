import { useEffect, useState } from 'react'

const QUESTION_PAUSE_MS = 1000
const THINKING_MS = 1200
const TOOL_RUN_MS = 1250
const TOOL_DONE_MS = 450
const TOKEN_MS = 170
const ANSWER_HOLD_MS = 4500
const RESTART_MS = 500

export function useScenarioPlayer(scenarios) {
  const [messages, setMessages] = useState([])

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      const scenario = scenarios[0]
      setMessages([
        { role: 'user', text: scenario.question },
        {
          role: 'assistant',
          phase: 'answer',
          tools: scenario.tools.map(tool => ({ ...tool, done: true })),
          answer: scenario.answer,
        },
      ])
      return
    }

    let cancelled = false
    const timers = []
    const sleep = ms => new Promise(resolve => timers.push(setTimeout(resolve, ms)))

    const setSafe = value => {
      if (!cancelled) setMessages(value)
    }
    const patchAssistant = patch =>
      setSafe(previous => {
        const next = previous.slice()
        next[next.length - 1] = { ...next[next.length - 1], ...patch }
        return next
      })

    async function playScenario(scenario) {
      setSafe([{ role: 'user', text: scenario.question }])
      await sleep(QUESTION_PAUSE_MS)
      if (cancelled) return

      setSafe(previous => [...previous, { role: 'assistant', phase: 'thinking', tools: [], answer: [] }])
      await sleep(THINKING_MS)
      if (cancelled) return

      const tools = []
      for (const tool of scenario.tools) {
        tools.push({ ...tool, done: false })
        patchAssistant({ phase: 'tools', tools: tools.map(entry => ({ ...entry })) })
        await sleep(TOOL_RUN_MS)
        if (cancelled) return

        tools[tools.length - 1].done = true
        patchAssistant({ phase: 'tools', tools: tools.map(entry => ({ ...entry })) })
        await sleep(TOOL_DONE_MS)
        if (cancelled) return
      }

      const revealed = []
      for (const token of scenario.answer) {
        revealed.push(token)
        patchAssistant({ phase: 'answer', answer: revealed.slice() })
        await sleep(TOKEN_MS)
        if (cancelled) return
      }
      await sleep(ANSWER_HOLD_MS)
    }

    async function loop() {
      let index = 0
      while (!cancelled) {
        setSafe([])
        await sleep(RESTART_MS)
        if (cancelled) return

        await playScenario(scenarios[index % scenarios.length])
        index++
      }
    }

    loop()

    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
  }, [scenarios])

  return messages
}
