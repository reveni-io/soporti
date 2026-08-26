import { describeToolCall } from '../../AgentSteps/tool-steps.js'

export function groupParts(parts) {
  return parts.reduce((groups, part) => {
    if (part.type !== 'tool_call') return [...groups, part]

    const step = describeToolCall(part)
    const last = groups[groups.length - 1]

    if (last?.type === 'steps') {
      return [...groups.slice(0, -1), { type: 'steps', steps: [...last.steps, step] }]
    }

    return [...groups, { type: 'steps', steps: [step] }]
  }, [])
}
