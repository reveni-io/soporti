import './ToolCall.css'

const TOOL_CONFIG = {
  list_repos: { label: 'Listing repositories', icon: '📋' },
  get_directory_contents: { label: 'Browsing directory', icon: '📂' },
  get_file_contents: { label: 'Reading file', icon: '📄' },
  search_code: { label: 'Searching code', icon: '🔍' },
}

function formatInput(tool, input) {
  if (!input) return ''
  switch (tool) {
    case 'get_directory_contents':
      return input.path ? `${input.repo}/${input.path}` : `${input.repo}/`
    case 'get_file_contents':
      return `${input.repo}/${input.path}`
    case 'search_code':
      return `"${input.query}" in ${input.repo}`
    default:
      return ''
  }
}

export default function ToolCall({ tool, input, done }) {
  const config = TOOL_CONFIG[tool] || { label: tool, icon: '⚙️' }
  const detail = formatInput(tool, input)

  return (
    <div className={`tool-call ${done ? 'tool-call--done' : 'tool-call--running'}`}>
      <span className="tool-call__status-icon">{done ? '✓' : ''}</span>
      <span className="tool-call__emoji">{config.icon}</span>
      <span className="tool-call__label">{config.label}</span>
      {detail && <span className="tool-call__detail">{detail}</span>}
    </div>
  )
}
