import './PreviewWindow.css'

const DEFAULT_TITLE = 'Soporti'

export default function PreviewWindow({ className = '', title = DEFAULT_TITLE, badge, isDark = false, children }) {
  const variant = isDark ? ' lp-preview-window--dark' : ''

  return (
    <div className={`lp-preview-window${variant} ${className}`.trim()}>
      <div className="lp-preview-window__bar">
        <span className="lp-preview-window__dots">
          <span />
          <span />
          <span />
        </span>
        <span className="lp-preview-window__title">{title}</span>
        {badge && (
          <span key={badge} className="lp-preview-window__badge">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}
