import { useMemo, useState } from 'react'
import { useEscapeKey } from '../../../hooks/useEscapeKey/useEscapeKey.js'
import { useOverlayDismiss } from '../../../hooks/useOverlayDismiss/useOverlayDismiss.js'
import { buildSteps } from './steps.js'
import TourFooter from './TourFooter/TourFooter.jsx'
import TourStep from './TourStep/TourStep.jsx'
import './TourModal.css'

export default function TourModal({ integrations = [], onClose, onTryExample }) {
  const [stepIndex, setStepIndex] = useState(0)
  const [brokenImages, setBrokenImages] = useState(() => new Set())
  const overlayProps = useOverlayDismiss(onClose)
  useEscapeKey(onClose)

  const steps = useMemo(() => buildSteps(integrations), [integrations])
  const step = steps[stepIndex]

  function handleImageError() {
    setBrokenImages(previous => new Set(previous).add(step.image))
  }

  return (
    <div className="tour-modal__overlay modal-overlay" {...overlayProps}>
      <div className="modal tour-modal" role="dialog" aria-modal="true" aria-label="What can Soporti do?">
        <button className="modal__close tour-modal__close" onClick={onClose} aria-label="Close tour">
          &times;
        </button>

        <TourStep
          step={step}
          imageHidden={brokenImages.has(step.image)}
          onImageError={handleImageError}
          onTryExample={onTryExample}
        />

        <TourFooter
          stepIds={steps.map(({ id }) => id)}
          stepIndex={stepIndex}
          onSelect={setStepIndex}
          onBack={() => setStepIndex(stepIndex - 1)}
          onNext={() => setStepIndex(stepIndex + 1)}
          onFinish={onClose}
        />
      </div>
    </div>
  )
}
