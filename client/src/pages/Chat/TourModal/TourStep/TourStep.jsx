import IntegrationIcon from '../../../../common/IntegrationIcon/IntegrationIcon.jsx'

export default function TourStep({ step, imageHidden, onImageError, onTryExample }) {
  return (
    <div className="tour-modal__body">
      <h3 className="modal__title tour-modal__title">{step.title}</h3>
      {step.description && <p className="tour-modal__description">{step.description}</p>}

      {step.integrations && (
        <div className="tour-modal__chips">
          {step.integrations.map(integration => (
            <span key={integration.id} className="chip chip--pill" title={integration.description}>
              <IntegrationIcon id={integration.id} />
              {integration.name}
            </span>
          ))}
        </div>
      )}

      {step.bullets && (
        <ul className="tour-modal__bullets">
          {step.bullets.map(bullet => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      )}

      {step.examples && step.examples.length > 0 && (
        <div className="tour-modal__examples">
          <span className="tour-modal__examples-hint">Click an example to try it:</span>
          {step.examples.map(example => (
            <button key={example.text} className="tour-modal__example" onClick={() => onTryExample(example.text)}>
              {example.text}
            </button>
          ))}
        </div>
      )}

      {step.image && !imageHidden && (
        <img className="tour-modal__image" src={step.image} alt="" onError={onImageError} />
      )}
    </div>
  )
}
