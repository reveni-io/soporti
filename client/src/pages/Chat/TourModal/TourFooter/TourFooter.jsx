export default function TourFooter({ stepIds, stepIndex, onSelect, onBack, onNext, onFinish }) {
  const isLastStep = stepIndex === stepIds.length - 1

  return (
    <div className="tour-modal__footer">
      <div className="tour-modal__dots">
        {stepIds.map((id, index) => (
          <button
            key={id}
            className={`tour-modal__dot ${index === stepIndex ? 'tour-modal__dot--active' : ''}`}
            onClick={() => onSelect(index)}
            aria-label={`Go to step ${index + 1}`}
          />
        ))}
      </div>
      <div className="tour-modal__nav">
        {stepIndex > 0 && (
          <button className="btn btn--secondary" onClick={onBack}>
            Back
          </button>
        )}
        {isLastStep ? (
          <button className="btn btn--primary" onClick={onFinish}>
            Start asking
          </button>
        ) : (
          <button className="btn btn--primary" onClick={onNext}>
            Next
          </button>
        )}
      </div>
    </div>
  )
}
