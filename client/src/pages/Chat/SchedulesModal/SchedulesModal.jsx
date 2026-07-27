import { useState } from 'react'
import { SCHEDULE_STATUS_ERROR } from '../../../constants.js'
import { useOverlayDismiss } from '../../../hooks/useOverlayDismiss/useOverlayDismiss.js'
import { deleteSchedule, isUnauthorized } from '../../../services/services.js'
import { useSchedules } from '../hooks/useSchedules/useSchedules.js'
import ScheduleForm from './ScheduleForm/ScheduleForm.jsx'
import { describeSchedule, formatRunTime } from './describe-schedule.js'
import './SchedulesModal.css'

export default function SchedulesModal({ token, onClose, onLogout, selectedSources, selectedProfile }) {
  const { schedules, loading, error: loadError, reload } = useSchedules(token, onLogout)
  const [deleteError, setDeleteError] = useState(null)
  const [pendingDeleteId, setPendingDeleteId] = useState(null)
  const overlayProps = useOverlayDismiss(onClose)

  const error = deleteError ?? loadError

  async function handleDelete(id) {
    try {
      await deleteSchedule(token, id)
      setPendingDeleteId(null)
      setDeleteError(null)
      await reload()
    } catch (err) {
      if (isUnauthorized(err)) {
        onLogout?.()
        return
      }
      setDeleteError(err.message)
    }
  }

  return (
    <div className="modal-overlay" {...overlayProps}>
      <div className="modal schedules-modal">
        <div className="modal__header">
          <h3 className="modal__title">Scheduled queries</h3>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <p className="schedules-modal__description">
          A scheduled query runs on its own and saves the answer as a new conversation, marked with a clock in the
          sidebar. You can keep chatting in it like in any other conversation.
        </p>

        {loading && <p className="schedules-modal__status">Loading…</p>}
        {error && <span className="schedules-modal__error">{error}</span>}
        {!loading && !error && schedules.length === 0 && (
          <p className="schedules-modal__empty">No scheduled queries yet.</p>
        )}

        <ul className="schedules-modal__list">
          {schedules.map(schedule => (
            <ScheduleRow
              key={schedule.id}
              schedule={schedule}
              isConfirming={pendingDeleteId === schedule.id}
              onAskDelete={() => setPendingDeleteId(schedule.id)}
              onCancelDelete={() => setPendingDeleteId(null)}
              onDelete={() => handleDelete(schedule.id)}
            />
          ))}
        </ul>

        <ScheduleForm
          token={token}
          onLogout={onLogout}
          selectedSources={selectedSources}
          selectedProfile={selectedProfile}
          onCreated={reload}
        />

        <div className="modal__actions">
          <button className="btn btn--secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function ScheduleRow({ schedule, isConfirming, onAskDelete, onCancelDelete, onDelete }) {
  const lastRun = formatRunTime(schedule.lastRunAt)

  return (
    <li className="schedules-modal__item">
      <div className="schedules-modal__item-info">
        <span className="schedules-modal__question">{schedule.question}</span>
        <span className="schedules-modal__cadence">
          {describeSchedule(schedule)} · {schedule.timezone}
        </span>
        <span className="schedules-modal__runs">
          Next run {formatRunTime(schedule.nextRunAt)}
          {lastRun && ` · Last run ${lastRun}`}
        </span>
        {schedule.lastStatus === SCHEDULE_STATUS_ERROR && (
          <span className="schedules-modal__error">Last run failed: {schedule.lastError}</span>
        )}
      </div>

      <div className="schedules-modal__item-actions">
        {isConfirming ? (
          <>
            <button className="btn btn--danger btn--sm" onClick={onDelete}>
              Confirm
            </button>
            <button className="btn btn--secondary btn--sm" onClick={onCancelDelete}>
              Cancel
            </button>
          </>
        ) : (
          <button className="btn btn--danger btn--sm" onClick={onAskDelete}>
            Delete
          </button>
        )}
      </div>
    </li>
  )
}
