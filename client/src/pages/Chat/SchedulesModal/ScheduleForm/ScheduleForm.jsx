import { useState } from 'react'
import {
  SCHEDULE_DAILY,
  SCHEDULE_FREQUENCY_OPTIONS,
  SCHEDULE_HOURLY,
  SCHEDULE_MONTHLY,
  SCHEDULE_MONTH_DAY_MAX,
  SCHEDULE_QUESTION_MAX_LENGTH,
  SCHEDULE_WEEKLY,
  WEEKDAY_LABELS,
} from '../../../../constants.js'
import { createSchedule, isUnauthorized, updateSchedule } from '../../../../services/services.js'
import { describeSources } from '../describe-schedule.js'
import './ScheduleForm.css'

const BROWSER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const MINUTES = Array.from({ length: 60 }, (_, minute) => minute)
const MONTH_DAYS = Array.from({ length: SCHEDULE_MONTH_DAY_MAX }, (_, index) => index + 1)
const DEFAULT_HOUR = 9
const DEFAULT_WEEKDAY = 1
const DEFAULT_MONTH_DAY = 1

function pad(value) {
  return String(value).padStart(2, '0')
}

function submitLabel(isEditing, saving) {
  if (isEditing) return saving ? 'Saving...' : 'Save changes'

  return saving ? 'Creating...' : 'Create schedule'
}

export default function ScheduleForm({
  token,
  onLogout,
  selectedSources,
  selectedProfile,
  schedule,
  onSaved,
  onCancel,
}) {
  const isEditing = Boolean(schedule)
  const [question, setQuestion] = useState(schedule?.question ?? '')
  const [frequency, setFrequency] = useState(schedule?.frequency ?? SCHEDULE_DAILY)
  const [hour, setHour] = useState(schedule?.hour ?? DEFAULT_HOUR)
  const [minute, setMinute] = useState(schedule?.minute ?? 0)
  const [weekday, setWeekday] = useState(schedule?.weekday ?? DEFAULT_WEEKDAY)
  const [monthDay, setMonthDay] = useState(schedule?.monthDay ?? DEFAULT_MONTH_DAY)
  const [sources, setSources] = useState(schedule?.sources ?? selectedSources)
  const [profile, setProfile] = useState(schedule?.profile ?? selectedProfile)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const timezone = schedule?.timezone ?? BROWSER_TIMEZONE
  const canSave = question.trim().length > 0 && !saving
  const minuteLabel = frequency === SCHEDULE_HOURLY ? 'at minute' : 'minute'

  function handleUseCurrentSelection() {
    setSources(selectedSources)
    setProfile(selectedProfile)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!canSave) return

    const input = {
      question: question.trim(),
      sources,
      profile,
      frequency,
      minute,
      hour,
      weekday,
      monthDay,
      timezone,
    }

    setSaving(true)
    setError(null)
    try {
      if (isEditing) await updateSchedule(token, schedule.id, input)
      else await createSchedule(token, input)
      setQuestion('')
      await onSaved()
    } catch (err) {
      if (isUnauthorized(err)) {
        onLogout?.()
        return
      }
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="schedule-form" onSubmit={handleSubmit}>
      <h4 className="schedule-form__title">{isEditing ? 'Edit scheduled query' : 'New scheduled query'}</h4>

      <label className="schedule-form__label">
        Question
        <textarea
          className="textarea schedule-form__textarea"
          value={question}
          onChange={event => setQuestion(event.target.value)}
          placeholder="e.g. Which payments failed in the last 24 hours?"
          maxLength={SCHEDULE_QUESTION_MAX_LENGTH}
          rows={3}
          disabled={saving}
        />
      </label>

      <div className="schedule-form__cadence">
        <label className="schedule-form__label schedule-form__label--inline">
          Repeat
          <select
            className="input schedule-form__select"
            value={frequency}
            onChange={event => setFrequency(event.target.value)}
            disabled={saving}
          >
            {SCHEDULE_FREQUENCY_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {frequency === SCHEDULE_WEEKLY && (
          <label className="schedule-form__label schedule-form__label--inline">
            on
            <select
              className="input schedule-form__select"
              value={weekday}
              onChange={event => setWeekday(Number(event.target.value))}
              disabled={saving}
            >
              {WEEKDAY_LABELS.map((label, value) => (
                <option key={label} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}

        {frequency === SCHEDULE_MONTHLY && (
          <label className="schedule-form__label schedule-form__label--inline">
            on day
            <select
              className="input schedule-form__select"
              value={monthDay}
              onChange={event => setMonthDay(Number(event.target.value))}
              disabled={saving}
            >
              {MONTH_DAYS.map(day => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
          </label>
        )}

        {frequency !== SCHEDULE_HOURLY && (
          <label className="schedule-form__label schedule-form__label--inline">
            at hour
            <select
              className="input schedule-form__select"
              value={hour}
              onChange={event => setHour(Number(event.target.value))}
              disabled={saving}
            >
              {HOURS.map(value => (
                <option key={value} value={value}>
                  {pad(value)}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="schedule-form__label schedule-form__label--inline">
          {minuteLabel}
          <select
            className="input schedule-form__select"
            value={minute}
            onChange={event => setMinute(Number(event.target.value))}
            disabled={saving}
          >
            {MINUTES.map(value => (
              <option key={value} value={value}>
                {pad(value)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="schedule-form__context">
        <span className="schedule-form__hint">
          Uses {describeSources(sources)} · {profile} profile · {timezone}
        </span>
        {isEditing && (
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={handleUseCurrentSelection}
            disabled={saving}
          >
            Use current selection
          </button>
        )}
      </div>

      {error && <span className="schedule-form__error">{error}</span>}

      <div className="modal__actions">
        {isEditing && (
          <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn--primary" disabled={!canSave}>
          {submitLabel(isEditing, saving)}
        </button>
      </div>
    </form>
  )
}
