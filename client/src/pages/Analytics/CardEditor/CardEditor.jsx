import { ANALYTICS_TITLE_MAX_LENGTH } from '../../../constants.js'
import ModalFrame from '../ModalFrame/ModalFrame.jsx'
import DeleteControl from '../DeleteControl/DeleteControl.jsx'
import { useCardEditor } from './hooks/useCardEditor/useCardEditor.js'
import ReviseForm from './ReviseForm/ReviseForm.jsx'
import SqlEditor from './SqlEditor/SqlEditor.jsx'
import ChartSettings from './ChartSettings/ChartSettings.jsx'
import QueryPreview from './QueryPreview/QueryPreview.jsx'
import './CardEditor.css'

const NO_COLUMNS = []

export default function CardEditor({ card, token, onLogout, onClose, onSave, onRevise, onDelete }) {
  const editor = useCardEditor({ card, token, onLogout, onClose, onSave, onRevise, onDelete })

  return (
    <ModalFrame title="Edit chart" className="card-editor" onClose={onClose}>
      <div className="card-editor__body">
        <div className="card-editor__form">
          <label className="card-editor__field">
            <span className="card-editor__label">Title</span>
            <input
              className="input"
              maxLength={ANALYTICS_TITLE_MAX_LENGTH}
              value={editor.title}
              onChange={event => editor.setTitle(event.target.value)}
            />
          </label>

          <ReviseForm isSending={editor.isRevising} error={editor.reviseError} onAsk={editor.askForChange} />
          <SqlEditor
            value={editor.sql}
            isRunning={editor.isRunning}
            error={editor.runError}
            onChange={editor.setSql}
            onRun={editor.run}
          />
          <ChartSettings
            chart={editor.chart}
            columns={editor.preview?.columns ?? NO_COLUMNS}
            onChange={editor.setChart}
          />
        </div>

        <div className="card-editor__preview">
          <QueryPreview chart={editor.chart} preview={editor.preview} isRunning={editor.isRunning} />
        </div>
      </div>

      <div className="card-editor__footer">
        {editor.submitError && (
          <p className="alert alert--error" role="alert">
            {editor.submitError}
          </p>
        )}

        <div className="card-editor__footer-row">
          <DeleteControl
            label="Delete chart"
            question="Delete this chart?"
            busy={editor.isRemoving || editor.isSaving}
            onDelete={editor.remove}
          />

          <div className="modal__actions">
            <button type="button" className="btn btn--secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn--primary" disabled={!editor.canSave} onClick={editor.save}>
              {editor.isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </ModalFrame>
  )
}
