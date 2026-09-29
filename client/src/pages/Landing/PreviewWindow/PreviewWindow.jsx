import './PreviewWindow.css'

export default function PreviewWindow({ className = '', badge, children }) {
  return (
    <div className={`lp-preview-window ${className}`.trim()}>
      <div className="lp-preview-window__bar">
        <span className="lp-preview-window__dots">
          <span />
          <span />
          <span />
        </span>
        <span className="lp-preview-window__title">Soporti</span>
        {badge && <span className="lp-preview-window__badge">{badge}</span>}
      </div>
      {children}
    </div>
  )
}
