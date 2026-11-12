import { useSaveField } from '../../../hooks/useSaveField/useSaveField.js'
import ModalFrame from '../ModalFrame/ModalFrame.jsx'
import DashboardNameForm from '../DashboardNameForm/DashboardNameForm.jsx'
import DeleteControl from '../DeleteControl/DeleteControl.jsx'
import './DashboardSettingsModal.css'

export default function DashboardSettingsModal({ dashboard, onRename, onDelete, onClose }) {
  const { saving: removing, error, save } = useSaveField()

  function handleDelete() {
    save(onDelete)
  }

  return (
    <ModalFrame title="Dashboard settings" className="dashboard-settings-modal" onClose={onClose}>
      <DashboardNameForm
        initialName={dashboard.name}
        submitLabel="Save"
        busyLabel="Saving…"
        onSubmit={onRename}
        onDone={onClose}
      />

      <section className="dashboard-settings-modal__danger">
        <p className="dashboard-settings-modal__warning">
          Deleting a dashboard deletes its charts too, for everyone it is shared with.
        </p>
        <DeleteControl
          label="Delete dashboard"
          question="Delete this dashboard and its charts?"
          busy={removing}
          onDelete={handleDelete}
        />

        {error && (
          <p className="alert alert--error" role="alert">
            {error}
          </p>
        )}
      </section>
    </ModalFrame>
  )
}
