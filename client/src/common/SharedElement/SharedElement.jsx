import { ViewTransition } from 'react'
import './SharedElement.css'

const MORPH_ANIMATION = 'morph'
const NO_ANIMATION = 'none'

export default function SharedElement({ name, children }) {
  return (
    <ViewTransition name={name} share={MORPH_ANIMATION} default={NO_ANIMATION}>
      {children}
    </ViewTransition>
  )
}
