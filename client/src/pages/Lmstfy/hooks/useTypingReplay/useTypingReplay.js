import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { buildChatPath } from '../../question-link.js'

const OPEN_MS = 550
const TO_ADDRESS_MS = 520
const CLICK_MS = 200
const URL_TYPE_MS = 60
const BEFORE_ENTER_MS = 260
const LOADING_MS = 600
const TO_COMPOSER_MS = 520
const QUESTION_TYPE_MS = 40
const BEFORE_SEND_MS = 260
const TO_SEND_MS = 450
const PRESS_MS = 300
const HANDOVER_MS = 450

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export const OPENING_PHASE = 'opening'
export const ADDRESS_PHASE = 'address'
export const URL_PHASE = 'url'
export const LOADING_PHASE = 'loading'
export const COMPOSER_PHASE = 'composer'
export const QUESTION_PHASE = 'question'
export const SEND_PHASE = 'send'
export const PRESSING_PHASE = 'pressing'
export const DONE_PHASE = 'done'

export function useTypingReplay(question) {
  const navigate = useNavigate()
  const [phase, setPhase] = useState(OPENING_PHASE)
  const [typedUrl, setTypedUrl] = useState('')
  const [typedQuestion, setTypedQuestion] = useState('')
  const [isClicking, setIsClicking] = useState(false)

  useEffect(() => {
    const siteUrl = window.location.host

    if (window.matchMedia?.(REDUCED_MOTION_QUERY)?.matches) {
      setTypedUrl(siteUrl)
      setTypedQuestion(question)
      setPhase(DONE_PHASE)
      return
    }

    let cancelled = false
    const timers = []
    const sleep = ms => new Promise(resolve => timers.push(setTimeout(resolve, ms)))

    async function typeInto(text, stepMs, onProgress) {
      for (let length = 1; length <= text.length; length++) {
        await sleep(stepMs)
        if (cancelled) return
        onProgress(text.slice(0, length))
      }
    }

    async function clickOnce() {
      setIsClicking(true)
      await sleep(CLICK_MS)
      if (cancelled) return
      setIsClicking(false)
    }

    async function play() {
      await sleep(OPEN_MS)
      if (cancelled) return
      setPhase(ADDRESS_PHASE)

      await sleep(TO_ADDRESS_MS)
      if (cancelled) return
      await clickOnce()
      if (cancelled) return
      setPhase(URL_PHASE)

      await typeInto(siteUrl, URL_TYPE_MS, setTypedUrl)
      await sleep(BEFORE_ENTER_MS)
      if (cancelled) return
      setPhase(LOADING_PHASE)

      await sleep(LOADING_MS)
      if (cancelled) return
      setPhase(COMPOSER_PHASE)

      await sleep(TO_COMPOSER_MS)
      if (cancelled) return
      await clickOnce()
      if (cancelled) return
      setPhase(QUESTION_PHASE)

      await typeInto(question, QUESTION_TYPE_MS, setTypedQuestion)
      await sleep(BEFORE_SEND_MS)
      if (cancelled) return
      setPhase(SEND_PHASE)

      await sleep(TO_SEND_MS)
      if (cancelled) return
      setPhase(PRESSING_PHASE)
      setIsClicking(true)

      await sleep(PRESS_MS)
      if (cancelled) return
      setIsClicking(false)
      setPhase(DONE_PHASE)
    }

    play()

    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
  }, [question])

  useEffect(() => {
    if (phase !== DONE_PHASE) return

    const timer = setTimeout(() => navigate(buildChatPath(question)), HANDOVER_MS)

    return () => clearTimeout(timer)
  }, [phase, question, navigate])

  return { phase, typedUrl, typedQuestion, isClicking }
}
