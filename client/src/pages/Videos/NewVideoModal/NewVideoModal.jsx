import { useId } from 'react'
import { useRepos } from '../../../hooks/useRepos/useRepos.js'
import { useEscapeKey } from '../../../hooks/useEscapeKey/useEscapeKey.js'
import { useOverlayDismiss } from '../../../hooks/useOverlayDismiss/useOverlayDismiss.js'
import { useBriefForm } from './hooks/useBriefForm/useBriefForm.js'
import { useBriefAttachments } from './hooks/useBriefAttachments/useBriefAttachments.js'
import {
  AUDIENCE_OPTIONS,
  DURATION_OPTIONS,
  FORMAT_OPTIONS,
  LANGUAGE_OPTIONS,
  PACE_HINT,
  PACE_OPTIONS,
} from './brief-options.js'
import RepoPicker from './RepoPicker/RepoPicker.jsx'
import SegmentedControl from './SegmentedControl/SegmentedControl.jsx'
import AttachmentField from './AttachmentField/AttachmentField.jsx'
import './NewVideoModal.css'

const IDEA_PLACEHOLDER = 'e.g. How a merchant sets up Liquid email templates, from the editor to the first email sent.'
const IDEA_ROWS = 4
const IDEA_MAX_LENGTH = 4000

export default function NewVideoModal({ token, onLogout, onClose, onCreated }) {
  const { repos, loading: reposLoading, error: reposError } = useRepos(token, onLogout)
  const { fields, errors, submitting, error, setField, toggleRepo, submit } = useBriefForm({
    token,
    onLogout,
    onCreated,
  })
  const uploads = useBriefAttachments(token, onLogout)
  const overlayProps = useOverlayDismiss(onClose)
  const ideaId = useId()
  const ideaErrorId = useId()
  useEscapeKey(onClose)

  function handleSubmit(event) {
    event.preventDefault()
    submit(uploads.attachments)
  }

  return (
    <div className="modal-overlay" {...overlayProps}>
      <form className="modal new-video-modal" onSubmit={handleSubmit} noValidate>
        <div className="modal__header">
          <h2 className="modal__title">New video</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="new-video-modal__field">
          <label className="new-video-modal__label" htmlFor={ideaId}>
            What should the video tell?
          </label>
          <textarea
            id={ideaId}
            className="textarea"
            rows={IDEA_ROWS}
            maxLength={IDEA_MAX_LENGTH}
            placeholder={IDEA_PLACEHOLDER}
            value={fields.idea}
            aria-invalid={Boolean(errors.idea)}
            aria-describedby={errors.idea ? ideaErrorId : undefined}
            onChange={event => setField('idea', event.target.value)}
          />
          {errors.idea && (
            <span id={ideaErrorId} className="new-video-modal__error">
              {errors.idea}
            </span>
          )}
        </div>

        <div className="new-video-modal__field">
          <RepoPicker
            repos={repos}
            loading={reposLoading}
            error={reposError}
            selected={fields.repos}
            onToggle={toggleRepo}
          />
          {errors.repos && <span className="new-video-modal__error">{errors.repos}</span>}
        </div>

        <label className="new-video-modal__field">
          <span className="new-video-modal__label">Folder (optional)</span>
          <input
            className="input"
            placeholder="e.g. apps/dashboard"
            value={fields.path}
            onChange={event => setField('path', event.target.value)}
          />
        </label>

        <div className="new-video-modal__row">
          <SelectField
            label="Audience"
            options={AUDIENCE_OPTIONS}
            value={fields.audience}
            onChange={value => setField('audience', value)}
          />
          <SelectField
            label="Language"
            options={LANGUAGE_OPTIONS}
            value={fields.language}
            onChange={value => setField('language', value)}
          />
        </div>

        <SegmentedControl
          label="Format"
          name="format"
          options={FORMAT_OPTIONS}
          value={fields.format}
          onChange={value => setField('format', value)}
        />
        <SegmentedControl
          label="Duration"
          name="duration"
          options={DURATION_OPTIONS}
          value={fields.durationSeconds}
          onChange={value => setField('durationSeconds', value)}
        />
        <SegmentedControl
          label="Pace"
          name="pace"
          options={PACE_OPTIONS}
          value={fields.pace}
          hint={PACE_HINT}
          onChange={value => setField('pace', value)}
        />

        <AttachmentField
          attachments={uploads.attachments}
          isUploading={uploads.isUploading}
          error={uploads.error}
          token={token}
          onAddFiles={uploads.addFiles}
          onRemove={uploads.removeAttachment}
        />

        {error && <p className="alert alert--error">{error}</p>}

        <div className="modal__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={submitting || uploads.isUploading}>
            {submitting ? 'Creating…' : 'Create video'}
          </button>
        </div>
      </form>
    </div>
  )
}

function SelectField({ label, options, value, onChange }) {
  return (
    <label className="new-video-modal__field">
      <span className="new-video-modal__label">{label}</span>
      <select className="input" value={value} onChange={event => onChange(event.target.value)}>
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
