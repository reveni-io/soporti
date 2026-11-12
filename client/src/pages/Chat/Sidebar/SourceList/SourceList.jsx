import { YOLO_SOURCE } from '../../../../constants.js'
import Icon from '../../../../common/Icon/Icon.jsx'
import IntegrationIcon from '../../../../common/IntegrationIcon/IntegrationIcon.jsx'
import SourceItem from './SourceItem/SourceItem.jsx'
import './SourceList.css'

const YOLO_NAME = 'YOLO (auto)'
const YOLO_DESCRIPTION = 'Let the agent decide which sources to use based on your question'
const REPO_ICON_ID = 'github'
const SOURCE_ICON_SIZE = 13

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
    <ul className="source-list">
      {yoloMatches && (
        <SourceItem
          name={YOLO_NAME}
          description={YOLO_DESCRIPTION}
          icon={<Icon name="zap" size={SOURCE_ICON_SIZE} />}
          modifier="source-item--yolo"
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
            icon={<IntegrationIcon id={integration.id} size={SOURCE_ICON_SIZE} />}
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
          icon={<IntegrationIcon id={REPO_ICON_ID} size={SOURCE_ICON_SIZE} />}
          selected={selectedSources.includes(repo.fullName)}
          onToggle={() => onToggleSource(repo.fullName)}
        />
      ))}
    </ul>
  )
}
