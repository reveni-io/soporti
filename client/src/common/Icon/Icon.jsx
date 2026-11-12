const DEFAULT_VIEW_BOX = '0 0 24 24'

const ICON_SHAPES = {
  users: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  shield: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  'help-circle': (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </>
  ),
  'help-center': (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.2" />
      <line x1="5.6" y1="5.6" x2="9.7" y2="9.7" />
      <line x1="14.3" y1="14.3" x2="18.4" y2="18.4" />
      <line x1="18.4" y1="5.6" x2="14.3" y2="9.7" />
      <line x1="9.7" y1="14.3" x2="5.6" y2="18.4" />
    </>
  ),
  'meeting-notes': (
    <>
      <path d="M5 3h9l5 5v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <polyline points="14 3 14 8 19 8" />
      <line x1="8" y1="13" x2="15" y2="13" />
      <line x1="8" y1="17" x2="12" y2="17" />
    </>
  ),
  chart: (
    <>
      <line x1="3" y1="21" x2="21" y2="21" />
      <rect x="5" y="12" width="4" height="6" />
      <rect x="11" y="8" width="4" height="10" />
      <rect x="17" y="4" width="4" height="14" />
    </>
  ),
  spark: (
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
  ),
  database: (
    <>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </>
  ),
  'arrow-right': (
    <>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </>
  ),
  share: (
    <>
      <path d="M6 10L10 6M10 6H6.5M10 6V9.5" />
      <path d="M14 8C14 11.3137 11.3137 14 8 14C4.68629 14 2 11.3137 2 8C2 4.68629 4.68629 2 8 2C11.3137 2 14 4.68629 14 8Z" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  check: <polyline points="20 6 9 17 4 12" />,
  cursor: <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 16 14" />
    </>
  ),
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </>
  ),
  paperclip: (
    <path d="M20.4 11.6l-8.5 8.5a5 5 0 0 1-7.1-7.1l8.9-8.9a3.4 3.4 0 0 1 4.8 4.8l-8.9 8.9a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" />
  ),
  'arrow-up': (
    <>
      <line x1="12" y1="20" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </>
  ),
  'arrow-down': (
    <>
      <line x1="12" y1="5" x2="12" y2="20" />
      <polyline points="5 13 12 20 19 13" />
    </>
  ),
  square: <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />,
  artifact: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="8" x2="21" y2="8" />
      <line x1="9" y1="8" x2="9" y2="21" />
    </>
  ),
  subagents: (
    <>
      <rect x="9" y="3" width="6" height="5" rx="1" />
      <rect x="2" y="16" width="6" height="5" rx="1" />
      <rect x="16" y="16" width="6" height="5" rx="1" />
      <path d="M12 8v4M5 16v-2h14v2" />
    </>
  ),
  video: (
    <>
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <polygon points="22 8 16 12 22 16 22 8" />
    </>
  ),
  grip: (
    <>
      <circle cx="9" cy="6" r="1" fill="currentColor" />
      <circle cx="15" cy="6" r="1" fill="currentColor" />
      <circle cx="9" cy="12" r="1" fill="currentColor" />
      <circle cx="15" cy="12" r="1" fill="currentColor" />
      <circle cx="9" cy="18" r="1" fill="currentColor" />
      <circle cx="15" cy="18" r="1" fill="currentColor" />
    </>
  ),
  refresh: (
    <>
      <polyline points="21 4 21 10 15 10" />
      <path d="M20.5 15a9 9 0 1 1-2.1-9.4L21 10" />
    </>
  ),
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </>
  ),
  trash: (
    <>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </>
  ),
  code: (
    <>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </>
  ),
  play: <polygon points="6 4 20 12 6 20 6 4" />,
  close: (
    <>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </>
  ),
  'chart-row': (
    <>
      <line x1="3" y1="3" x2="3" y2="21" />
      <rect x="6" y="5" width="14" height="4" />
      <rect x="6" y="11" width="9" height="4" />
      <rect x="6" y="17" width="5" height="3" />
    </>
  ),
  'chart-line': (
    <>
      <path d="M3 3v18h18" />
      <polyline points="7 14 11 10 14 13 20 6" />
    </>
  ),
  'chart-area': (
    <>
      <path d="M3 3v18h18" />
      <path d="M7 17v-4l4-4 3 3 6-6v11z" />
    </>
  ),
  'chart-pie': (
    <>
      <path d="M21 12a9 9 0 1 1-9-9" />
      <path d="M12 3v9h9a9 9 0 0 0-9-9z" />
    </>
  ),
  number: (
    <>
      <line x1="5" y1="9" x2="20" y2="9" />
      <line x1="4" y1="15" x2="19" y2="15" />
      <line x1="10" y1="4" x2="8" y2="20" />
      <line x1="16" y1="4" x2="14" y2="20" />
    </>
  ),
  table: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="10" y1="4" x2="10" y2="20" />
    </>
  ),
}

const ICON_VIEW_BOXES = {
  share: '0 0 16 16',
}

export default function Icon({ name, size = 16, strokeWidth = 2, className }) {
  const shape = ICON_SHAPES[name]

  if (!shape) return null

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={ICON_VIEW_BOXES[name] ?? DEFAULT_VIEW_BOX}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-icon={name}
    >
      {shape}
    </svg>
  )
}
