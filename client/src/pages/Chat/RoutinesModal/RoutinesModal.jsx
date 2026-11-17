import DeleteControl from '../../../common/DeleteControl/DeleteControl.jsx'
import ModalFrame from '../../../common/ModalFrame/ModalFrame.jsx'
import { SCHEDULE_STATUS_ERROR } from '../../../constants.js'
import { useBotRoutines } from '../hooks/useBotRoutines/useBotRoutines.js'
import { describeSchedule, formatRunTime } from '../SchedulesModal/describe-schedule.js'
import './RoutinesModal.css'

const EMPTY_TEXT =
  'No routines yet. Ask the bot to do something on a schedule — for example "every weekday at 9:00, summarize the new Sentry issues".'

function runSummary({ paused, nextRunAt, lastRunAt }) {
  const parts = []

  if (!paused && nextRunAt) parts.push(`Next run ${formatRunTime(nextRunAt)}`)
  if (lastRunAt) parts.push(`Last run ${formatRunTime(lastRunAt)}`)

  return parts.join(' · ')
}

export default function RoutinesModal({ bot, token, onClose, onLogout }) {
  const { routines, loading, error, isBusy, actionError, togglePaused, remove } = useBotRoutines(
    token,
    bot.id,
    onLogout
  )

  return (
    <ModalFrame title="Routines" className="routines-modal" onClose={onClose}>
      <p className="routines-modal__description">
        {bot.name} runs these on its own and posts each result in its chat. Ask it in the chat to create or change one.
      </p>

      {actionError && (
        <p className="alert alert--error" role="alert">
          {actionError}
        </p>
      )}

      <RoutineList
        routines={routines}
        loading={loading}
        error={error}
        isBusy={isBusy}
        onTogglePaused={togglePaused}
        onDelete={remove}
      />
    </ModalFrame>
  )
}

function RoutineList({ routines, loading, error, isBusy, onTogglePaused, onDelete }) {
  if (loading) return <p className="routines-modal__status">Loading…</p>
  if (error) {
    return (
      <p className="alert alert--error" role="alert">
        {error}
      </p>
    )
  }
  if (routines.length === 0) return <p className="routines-modal__status">{EMPTY_TEXT}</p>

  return (
    <ul className="routines-modal__list">
      {routines.map(routine => (
        <RoutineRow
          key={routine.id}
          routine={routine}
          isBusy={isBusy}
          onTogglePaused={onTogglePaused}
          onDelete={onDelete}
        />
      ))}
    </ul>
  )
}

function RoutineRow({ routine, isBusy, onTogglePaused, onDelete }) {
  const summary = runSummary(routine)

  return (
    <li className="card routines-modal__item">
      <div className="routines-modal__info">
        <div className="routines-modal__heading">
          <span className="routines-modal__title">{routine.title}</span>
          {routine.paused && <span className="badge">Paused</span>}
        </div>
        <p className="routines-modal__instruction" title={routine.instruction}>
          {routine.instruction}
        </p>
        <span className="routines-modal__cadence">
          {describeSchedule(routine)} · {routine.timezone}
        </span>
        {summary && <span className="routines-modal__runs">{summary}</span>}
        {routine.lastStatus === SCHEDULE_STATUS_ERROR && (
          <span className="routines-modal__failed">The last run failed.</span>
        )}
      </div>

      <div className="routines-modal__actions">
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          disabled={isBusy}
          onClick={() => onTogglePaused(routine)}
        >
          {routine.paused ? 'Resume' : 'Pause'}
        </button>
        <DeleteControl
          label="Delete"
          question="Delete this routine?"
          busy={isBusy}
          onDelete={() => onDelete(routine.id)}
        />
      </div>
    </li>
  )
}
