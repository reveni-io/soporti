import { YOLO_SOURCE } from '../../../../constants.js'
import SourceItem from './SourceItem/SourceItem.jsx'

const YOLO_NAME = 'YOLO (auto)'
const YOLO_DESCRIPTION = 'Let the agent decide which sources to use based on your question'

export default function SourceList({
  repos,
  integrations,
  yoloMatches,
  selectedSources,
  onToggleSource,
  loadingRepos,
  reposError,
}) {
  return (
    <ul className="sidebar__source-list">
      {yoloMatches && (
        <SourceItem
          name={YOLO_NAME}
          description={YOLO_DESCRIPTION}
          modifier="sidebar__source--yolo"
          selected={selectedSources.includes(YOLO_SOURCE)}
          onToggle={() => onToggleSource(YOLO_SOURCE)}
        />
      )}

      {integrations.map(integration => {
        const key = `integration:${integration.id}`
        return (
          <SourceItem
            key={key}
            name={integration.name}
            description={integration.description}
            selected={selectedSources.includes(key)}
            onToggle={() => onToggleSource(key)}
          />
        )
      })}

      {loadingRepos && <li className="sidebar__info">Loading repos...</li>}
      {reposError && <li className="sidebar__error">{reposError}</li>}

      {repos.map(repo => (
        <SourceItem
          key={repo.fullName}
          name={repo.fullName}
          description={repo.description}
          language={repo.language}
          selected={selectedSources.includes(repo.fullName)}
          onToggle={() => onToggleSource(repo.fullName)}
        />
      ))}
    </ul>
  )
}
