import { useMemo } from 'react'
import GridPattern from '../../../../common/GridPattern/GridPattern.jsx'
import IntegrationIcon from '../../../../common/IntegrationIcon/IntegrationIcon.jsx'
import { sampleExampleQuestions } from '../../example-questions.js'

const COMPACT_NUMBER_FORMAT = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

function buildStatTiles(stats) {
  if (!stats) return []

  return [
    { label: 'Conversations this week', value: stats.conversations },
    { label: 'Teammates this week', value: stats.activeUsers },
    { label: 'Solved cases learned', value: stats.solvedCases },
  ]
    .filter(tile => tile.value > 0)
    .map(tile => ({ ...tile, value: COMPACT_NUMBER_FORMAT.format(tile.value) }))
}

export default function ChatEmptyState({ hasSourcesSelected, integrations, stats, onTryExample }) {
  const exampleQuestions = useMemo(() => sampleExampleQuestions(integrations), [integrations])

  if (!hasSourcesSelected) {
    return (
      <div className="chat__empty">
        <GridPattern variant="light" />
        <h2>Select a source to get started</h2>
        <p>Pick one or more sources (repos or integrations) from the sidebar, then ask your question.</p>
      </div>
    )
  }

  const statTiles = buildStatTiles(stats)

  return (
    <div className="chat__empty">
      <GridPattern variant="light" />
      <h2>Ask Soporti anything</h2>
      <p>
        I can explore code, query data, read docs and help articles, and dig into tickets and errors using the tools
        connected to this workspace.
      </p>

      {integrations.length > 0 && (
        <div className="chat__capabilities">
          {integrations.map(integration => (
            <span key={integration.id} className="chip chip--pill chat__capability" title={integration.description}>
              <IntegrationIcon id={integration.id} />
              {integration.name}
            </span>
          ))}
        </div>
      )}

      {exampleQuestions.length > 0 && (
        <div className="chat__examples">
          {exampleQuestions.map(question => (
            <button key={question.text} onClick={() => onTryExample(question.text)}>
              {question.text}
            </button>
          ))}
        </div>
      )}

      {statTiles.length > 0 && (
        <div className="chat__stats">
          {statTiles.map(tile => (
            <div key={tile.label} className="chat__stat">
              <span className="chat__stat-value">{tile.value}</span>
              <span className="chat__stat-label">{tile.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
