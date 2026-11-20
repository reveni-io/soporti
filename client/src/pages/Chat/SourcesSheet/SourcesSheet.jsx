import ModalFrame from '../../../common/ModalFrame/ModalFrame.jsx'
import SourcePicker from '../Sidebar/SourcePicker/SourcePicker.jsx'
import './SourcesSheet.css'

export default function SourcesSheet({
  selectedSources,
  onToggleSource,
  selectedProfile,
  onSelectProfile,
  repos,
  integrations,
  onClose,
}) {
  return (
    <ModalFrame title="Answer with" className="sources-sheet" onClose={onClose}>
      <div className="sources-sheet__body">
        <SourcePicker
          selectedSources={selectedSources}
          onToggleSource={onToggleSource}
          selectedProfile={selectedProfile}
          onSelectProfile={onSelectProfile}
          repos={repos}
          integrations={integrations}
        />
      </div>
      <button type="button" className="btn btn--primary btn--block sources-sheet__done" onClick={onClose}>
        Done
      </button>
    </ModalFrame>
  )
}
