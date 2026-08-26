import { useState } from 'react'
import {
  MAX_INSTRUCTIONS_LENGTH,
  MAX_SUBAGENT_DESCRIPTION_LENGTH,
  SUBAGENT_NAME_MAX_LENGTH,
  SUBAGENT_NAME_RE,
} from '../../../../constants.js'
import { createSubagent, updateSubagent } from '../../../../services/services.js'
import { useSaveField } from '../../../../hooks/useSaveField/useSaveField.js'
import ToolPicker from '../ToolPicker/ToolPicker.jsx'
import './SubagentForm.css'

const FOLLOW_GLOBAL = ''

const EXCLUSIVE_HELP =
  'Checked, the main agent loses these tools and has to ask this subagent — delegation becomes the only path, which makes it reliable. Unchecked, both have them and your description above decides when the main agent hands off.'
const SHARED_DESCRIPTION_HELP =
  'Give the main agent a countable reason to hand off and an explicit case where it should not — it has these same tools.'
const EXCLUSIVE_DESCRIPTION_HELP = 'Name the territory this subagent owns and the shape of what it returns.'

function claimedByOthers(subagents, editingId) {
  const owners = {}

  for (const subagent of subagents) {
    if (subagent.id === editingId || !subagent.exclusive || !subagent.enabled) continue

    for (const tool of subagent.tools) owners[tool] = subagent.name
  }

  return owners
}

export default function SubagentForm({
  token,
  onLogout,
  subagent,
  subagents,
  providers,
  toolGroups,
  onSaved,
  onCancel,
}) {
  const isEdit = Boolean(subagent)
  const [name, setName] = useState(subagent?.name ?? '')
  const [description, setDescription] = useState(subagent?.description ?? '')
  const [instructions, setInstructions] = useState(subagent?.instructions ?? '')
  const [provider, setProvider] = useState(subagent?.provider ?? FOLLOW_GLOBAL)
  const [model, setModel] = useState(subagent?.model ?? '')
  const [tools, setTools] = useState(subagent?.tools ?? [])
  const [exclusive, setExclusive] = useState(subagent?.exclusive ?? false)
  const [enabled, setEnabled] = useState(subagent?.enabled ?? true)
  const { saving, error, save } = useSaveField(onLogout)

  const claimedBy = claimedByOthers(subagents, subagent?.id ?? null)
  const inheritsProvider = provider === FOLLOW_GLOBAL
  const nameInvalid = name.length > 0 && !SUBAGENT_NAME_RE.test(name)
  const canSave =
    SUBAGENT_NAME_RE.test(name) &&
    description.trim().length > 0 &&
    instructions.trim().length > 0 &&
    (inheritsProvider || model.trim().length > 0)

  function handleToggle(tool) {
    setTools(current => (current.includes(tool) ? current.filter(name => name !== tool) : [...current, tool]))
  }

  function handleToggleGroup(group) {
    const selectable = group.tools.filter(tool => !claimedBy[tool])
    const allSelected = group.tools.every(tool => tools.includes(tool))

    setTools(current =>
      allSelected
        ? current.filter(tool => !group.tools.includes(tool))
        : [...current, ...selectable.filter(tool => !current.includes(tool))]
    )
  }

  function handleSubmit(event) {
    event.preventDefault()

    save(async () => {
      const payload = {
        name,
        description: description.trim(),
        instructions,
        provider: inheritsProvider ? null : provider,
        model: inheritsProvider ? null : model.trim(),
        tools,
        exclusive,
        enabled,
      }
      const data = isEdit ? await updateSubagent(token, subagent.id, payload) : await createSubagent(token, payload)
      onSaved(data.subagent)
    })
  }

  return (
    <form className="subagent-form" onSubmit={handleSubmit}>
      {error && <p className="alert alert--error">{error}</p>}

      <label className="subagent-form__label">
        Name
        <input
          className="input"
          value={name}
          onChange={event => setName(event.target.value.toLowerCase())}
          placeholder="e.g. code_investigator"
          maxLength={SUBAGENT_NAME_MAX_LENGTH}
          disabled={saving}
        />
      </label>
      {nameInvalid && (
        <span className="alert alert--error">
          Use lowercase letters, numbers and underscores, starting with a letter (2-{SUBAGENT_NAME_MAX_LENGTH}{' '}
          characters).
        </span>
      )}

      <label className="subagent-form__label">
        What it owns
        <textarea
          className="textarea"
          value={description}
          onChange={event => setDescription(event.target.value)}
          maxLength={MAX_SUBAGENT_DESCRIPTION_LENGTH}
          rows={3}
          disabled={saving}
        />
      </label>
      <span className="admin__muted">{exclusive ? EXCLUSIVE_DESCRIPTION_HELP : SHARED_DESCRIPTION_HELP}</span>

      <label className="subagent-form__label">
        System prompt
        <textarea
          className="textarea"
          value={instructions}
          onChange={event => setInstructions(event.target.value)}
          maxLength={MAX_INSTRUCTIONS_LENGTH}
          rows={10}
          disabled={saving}
        />
      </label>

      <label className="subagent-form__label">
        Provider
        <select
          className="input admin__input--select"
          value={provider}
          onChange={event => setProvider(event.target.value)}
          disabled={saving}
        >
          <option value={FOLLOW_GLOBAL}>Follow the global selection</option>
          {providers.map(option => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {!inheritsProvider && (
        <label className="subagent-form__label">
          Model
          <input
            className="input"
            value={model}
            onChange={event => setModel(event.target.value)}
            placeholder="e.g. claude-sonnet-5"
            disabled={saving}
          />
        </label>
      )}

      <h3 className="admin__subsection-title">Tools</h3>
      <ToolPicker
        groups={toolGroups}
        selected={tools}
        claimedBy={claimedBy}
        disabled={saving}
        onToggle={handleToggle}
        onToggleGroup={handleToggleGroup}
      />

      <label className="subagent-form__check">
        <input
          type="checkbox"
          checked={exclusive}
          onChange={event => setExclusive(event.target.checked)}
          disabled={saving}
        />
        Take these tools away from the main agent
      </label>
      <span className="admin__muted">{EXCLUSIVE_HELP}</span>

      <label className="subagent-form__check">
        <input
          type="checkbox"
          checked={enabled}
          onChange={event => setEnabled(event.target.checked)}
          disabled={saving}
        />
        Enabled
      </label>

      <div className="modal__actions">
        <button className="btn btn--secondary" type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button className="btn btn--primary" type="submit" disabled={!canSave || saving}>
          {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Create subagent'}
        </button>
      </div>
    </form>
  )
}
