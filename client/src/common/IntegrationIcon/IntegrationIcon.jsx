import { DEFAULT_ICON_VIEWBOX, ICON_PATHS, integrationIconViewBox } from './icon-paths.js'

export default function IntegrationIcon({ id, size = 16 }) {
  const path = ICON_PATHS[id]

  if (!path) {
    return (
      <svg width={size} height={size} viewBox={DEFAULT_ICON_VIEWBOX} aria-hidden="true" data-icon="fallback">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
        <text x="12" y="16.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="currentColor">
          ?
        </text>
      </svg>
    )
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={integrationIconViewBox(id)}
      fill="currentColor"
      aria-hidden="true"
      data-icon={id}
    >
      <path d={path} />
    </svg>
  )
}
