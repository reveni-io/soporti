import './ScreenFrame.css'

const FORMAT_MODIFIERS = { '16:9': 'wide', '1:1': 'square', '9:16': 'tall' }
const DEFAULT_MODIFIER = 'wide'

export default function ScreenFrame({ format, children }) {
  const modifier = FORMAT_MODIFIERS[format] ?? DEFAULT_MODIFIER

  return <div className={`screen-frame screen-frame--${modifier}`}>{children}</div>
}
