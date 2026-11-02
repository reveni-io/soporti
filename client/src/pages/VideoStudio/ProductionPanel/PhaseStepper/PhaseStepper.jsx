import './PhaseStepper.css'

const STEPS = [
  { phase: 'preparing', label: 'Preparing' },
  { phase: 'composing', label: 'Composing' },
  { phase: 'music', label: 'Music' },
  { phase: 'rendering', label: 'Rendering' },
  { phase: 'ready', label: 'Ready' },
]

const STEP_OF_PHASE = { finalizing: 'rendering' }

function currentStepIndex(phase) {
  const stepPhase = STEP_OF_PHASE[phase] ?? phase

  return Math.max(
    0,
    STEPS.findIndex(step => step.phase === stepPhase)
  )
}

function stepState(index, current) {
  if (index < current) return 'done'
  if (index === current) return 'current'

  return 'pending'
}

export default function PhaseStepper({ phase }) {
  const current = currentStepIndex(phase)

  return (
    <ol className="phase-stepper" aria-label="Generation steps">
      {STEPS.map((step, index) => (
        <li
          key={step.phase}
          className={`phase-stepper__step phase-stepper__step--${stepState(index, current)}`}
          aria-current={index === current ? 'step' : undefined}
        >
          {step.label}
        </li>
      ))}
    </ol>
  )
}
