import { YOLO_SOURCE } from '../../../../constants.js'
import { useSourceSearch } from '../../hooks/useSourceSearch/useSourceSearch.js'
import ProfileToggle from '../ProfileToggle/ProfileToggle.jsx'
import SidebarSearch from '../SidebarSearch/SidebarSearch.jsx'
import SourceList from '../SourceList/SourceList.jsx'

export default function SourcePicker({
  selectedSources,
  onToggleSource,
  selectedProfile,
  onSelectProfile,
  repos,
  integrations,
}) {
  const { search, setSearch, filteredRepos, filteredIntegrations, yoloMatches } = useSourceSearch({
    repos: repos.repos,
    integrations,
  })

  const specificSelectedCount = selectedSources.filter(source => source !== YOLO_SOURCE).length
  const hasNoRepos = !repos.loading && repos.repos.length === 0 && !repos.error

  return (
    <>
      <ProfileToggle selectedProfile={selectedProfile} onSelectProfile={onSelectProfile} />

      <div className="sidebar__section sidebar__section--list sidebar__section--grow source-picker">
        <h2 className="sidebar__section-title">
          Sources{' '}
          {specificSelectedCount > 0 && (
            <span key={specificSelectedCount} className="sidebar__count">
              {specificSelectedCount}
            </span>
          )}
        </h2>

        <SidebarSearch value={search} label="Search sources" placeholder="Search sources..." onChange={setSearch} />

        <div className="sidebar__scroll source-picker__scroll">
          <SourceList
            repos={filteredRepos}
            integrations={filteredIntegrations}
            yoloMatches={yoloMatches}
            selectedSources={selectedSources}
            onToggleSource={onToggleSource}
            loadingRepos={repos.loading}
            reposError={repos.error}
          />

          {hasNoRepos && <p className="sidebar__info">No repos found for this GitHub token.</p>}
        </div>
      </div>
    </>
  )
}
