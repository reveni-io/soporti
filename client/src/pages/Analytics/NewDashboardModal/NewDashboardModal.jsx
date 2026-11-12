import ModalFrame from '../ModalFrame/ModalFrame.jsx'
import DashboardNameForm from '../DashboardNameForm/DashboardNameForm.jsx'
import './NewDashboardModal.css'

export default function NewDashboardModal({ onCreate, onClose }) {
  return (
    <ModalFrame title="New dashboard" className="new-dashboard-modal" onClose={onClose}>
      <DashboardNameForm
        placeholder="e.g. Returns overview"
        autoFocus
        submitLabel="Create"
        busyLabel="Creating…"
        onSubmit={onCreate}
        onDone={onClose}
        onCancel={onClose}
      />
    </ModalFrame>
  )
}
