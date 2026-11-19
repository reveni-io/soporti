import { ViewTransition } from 'react'
import './ScreenTransition.css'

const SCREEN_ANIMATION = 'screen'
const NO_ANIMATION = 'none'

export default function ScreenTransition({ animatesUpdates = false, children }) {
  return (
    <ViewTransition
      enter={SCREEN_ANIMATION}
      exit={SCREEN_ANIMATION}
      update={animatesUpdates ? SCREEN_ANIMATION : NO_ANIMATION}
      default={NO_ANIMATION}
    >
      {children}
    </ViewTransition>
  )
}
