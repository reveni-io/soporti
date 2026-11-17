import { useId } from 'react'
import BotAvatar from '../../../common/BotAvatar/BotAvatar.jsx'
import DeleteControl from '../../../common/DeleteControl/DeleteControl.jsx'
import Icon from '../../../common/Icon/Icon.jsx'
import ModalFrame from '../../../common/ModalFrame/ModalFrame.jsx'
import { BOT_DESCRIPTION_MAX_LENGTH, BOT_NAME_MAX_LENGTH, PROFILE_OPTIONS } from '../../../constants.js'
import { useBotForm } from '../hooks/useBotForm/useBotForm.js'
import './BotFormModal.css'

const AVATAR_SIZE = 64
const SHUFFLE_ICON_SIZE = 14
const DESCRIPTION_ROWS = 5
const NAME_PLACEHOLDER = 'Ticket triager'
const DESCRIPTION_PLACEHOLDER =
  'Review the new Zendesk tickets, tag the urgent ones and tell me which ones need a developer.'

function submitLabel({ isEditing, isSaving }) {
  if (isEditing) return isSaving ? 'Saving…' : 'Save'

  return isSaving ? 'Creating…' : 'Create bot'
}

export default function BotFormModal({ bot = null, token, onClose, onLogout, onCreated, onUpdated, onDeleted }) {
  const form = useBotForm({ bot, token, onLogout, onCreated, onUpdated, onDeleted })
  const nameId = useId()
  const descriptionId = useId()
  const descriptionHintId = useId()

  function handleSubmit(event) {
    event.preventDefault()
    form.submit()
  }

  return (
    <ModalFrame title={form.isEditing ? 'Edit bot' : 'New bot'} className="bot-form-modal" onClose={onClose}>
      <form className="bot-form-modal__form" onSubmit={handleSubmit}>
        <div className="bot-form-modal__avatar">
          <BotAvatar seed={form.avatarSeed} size={AVATAR_SIZE} />
          <button type="button" className="btn btn--secondary btn--sm" onClick={form.shuffleAvatar}>
            <Icon name="refresh" size={SHUFFLE_ICON_SIZE} />
            Shuffle avatar
          </button>
        </div>

        <div className="bot-form-modal__field">
          <label className="bot-form-modal__label" htmlFor={nameId}>
            Name
          </label>
          <input
            id={nameId}
            className="input"
            value={form.name}
            maxLength={BOT_NAME_MAX_LENGTH}
            placeholder={NAME_PLACEHOLDER}
            onChange={event => form.setName(event.target.value)}
          />
        </div>

        <div className="bot-form-modal__field">
          <label className="bot-form-modal__label" htmlFor={descriptionId}>
            What is it for?
          </label>
          <textarea
            id={descriptionId}
            className="textarea"
            rows={DESCRIPTION_ROWS}
            value={form.description}
            maxLength={BOT_DESCRIPTION_MAX_LENGTH}
            placeholder={DESCRIPTION_PLACEHOLDER}
            aria-describedby={descriptionHintId}
            onChange={event => form.setDescription(event.target.value)}
          />
          <p id={descriptionHintId} className="bot-form-modal__hint">
            The bot works from this description, with every connected tool, and can run routines on its own.
          </p>
        </div>

        <ProfilePicker profile={form.profile} onChange={form.setProfile} />

        {form.isSaving && !form.isEditing && (
          <p className="note" role="status">
            {form.name.trim()} is writing its greeting…
          </p>
        )}
        {form.saveError && (
          <p className="alert alert--error" role="alert">
            {form.saveError}
          </p>
        )}

        <div className="modal__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={!form.canSave}>
            {submitLabel(form)}
          </button>
        </div>
      </form>

      {form.isEditing && (
        <section className="bot-form-modal__danger">
          <p className="bot-form-modal__warning">Deleting a bot deletes its chat and its routines too.</p>
          <DeleteControl label="Delete bot" question="Delete this bot?" busy={form.isDeleting} onDelete={form.remove} />
          {form.deleteError && (
            <p className="alert alert--error" role="alert">
              {form.deleteError}
            </p>
          )}
        </section>
      )}
    </ModalFrame>
  )
}

function ProfilePicker({ profile, onChange }) {
  return (
    <fieldset className="bot-form-modal__profiles">
      <legend className="bot-form-modal__label">Profile</legend>
      {PROFILE_OPTIONS.map(option => (
        <label
          key={option.id}
          className={`bot-form-modal__profile${option.id === profile ? ' bot-form-modal__profile--selected' : ''}`}
        >
          <input
            type="radio"
            name="bot-profile"
            className="bot-form-modal__radio"
            value={option.id}
            checked={option.id === profile}
            onChange={() => onChange(option.id)}
          />
          <span className="bot-form-modal__profile-label">{option.label}</span>
          <span className="bot-form-modal__profile-hint">{option.hint}</span>
        </label>
      ))}
    </fieldset>
  )
}
