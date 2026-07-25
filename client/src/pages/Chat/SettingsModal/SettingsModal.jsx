import { useState } from 'react'
import { useOverlayDismiss } from '../../../hooks/useOverlayDismiss/useOverlayDismiss.js'
import CustomInstructionsTab from './CustomInstructionsTab/CustomInstructionsTab.jsx'
import SkillsTab from './SkillsTab/SkillsTab.jsx'
import './SettingsModal.css'

const TABS = [
  { id: 'instructions', label: 'Custom instructions' },
  { id: 'skills', label: 'Skills' },
]

export default function SettingsModal({ token, onClose, onLogout, skills }) {
  const [activeTab, setActiveTab] = useState('instructions')
  const overlayProps = useOverlayDismiss(onClose)

  return (
    <div className="modal-overlay" {...overlayProps}>
      <div className="modal settings-modal">
        <div className="modal__header">
          <h3 className="modal__title">Settings</h3>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="settings-modal__tabs" role="tablist">
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`settings-modal__tab${activeTab === tab.id ? ' settings-modal__tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'instructions' && <CustomInstructionsTab token={token} onLogout={onLogout} />}
        {activeTab === 'skills' && <SkillsTab token={token} onLogout={onLogout} skills={skills} />}

        <div className="modal__actions">
          <button className="btn btn--secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
