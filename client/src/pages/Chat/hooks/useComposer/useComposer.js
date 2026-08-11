import { useEffect, useRef, useState } from 'react'
import { SKILL_COMMAND_RE } from '../../../../constants.js'

const MAX_TEXTAREA_HEIGHT = 200

export function useComposer({ skills, isLoading, hasSourcesSelected, isUploading, onSend }) {
  const [input, setInput] = useState('')
  const [menuDismissed, setMenuDismissed] = useState(false)
  const [menuIndex, setMenuIndex] = useState(0)
  const textareaRef = useRef(null)
  const highlightRef = useRef(null)

  function syncHighlightScroll() {
    if (highlightRef.current && textareaRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = 'auto'
    textarea.style.height = Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT) + 'px'
    syncHighlightScroll()
  }, [input])

  const command = skills.length > 0 ? input.match(SKILL_COMMAND_RE) : null
  const invokedSkill = command ? (skills.find(skill => skill.name === command[1]) ?? null) : null
  const menuOpen = Boolean(command) && command[2] === undefined && !menuDismissed
  const matchingSkills = menuOpen ? skills.filter(skill => skill.name.startsWith(command[1])) : []

  const commandPrefix = invokedSkill ? `/${invokedSkill.name}` : ''
  const messageText = invokedSkill ? input.slice(commandPrefix.length).trim() : input.trim()
  const canSend = Boolean(messageText) && hasSourcesSelected && !isUploading

  function fill(text) {
    setInput(text)
    textareaRef.current?.focus()
  }

  function handleChange(event) {
    setInput(event.target.value)
    setMenuDismissed(false)
    setMenuIndex(0)
  }

  function selectSkill(skill) {
    fill(`/${skill.name} `)
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!messageText || isLoading || !hasSourcesSelected || isUploading) return

    onSend(messageText, invokedSkill ? [{ id: invokedSkill.id, name: invokedSkill.name }] : [])
    setInput('')
  }

  function handleKeyDown(event) {
    const navigable = matchingSkills.length > 0

    if (menuOpen && event.key === 'Escape') {
      event.preventDefault()
      setMenuDismissed(true)
      return
    }
    if (navigable && event.key === 'ArrowDown') {
      event.preventDefault()
      setMenuIndex(index => Math.min(index + 1, matchingSkills.length - 1))
      return
    }
    if (navigable && event.key === 'ArrowUp') {
      event.preventDefault()
      setMenuIndex(index => Math.max(index - 1, 0))
      return
    }
    if (navigable && (event.key === 'Enter' || event.key === 'Tab')) {
      event.preventDefault()
      selectSkill(matchingSkills[menuIndex])
      return
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSubmit(event)
    }
  }

  return {
    input,
    textareaRef,
    highlightRef,
    commandPrefix,
    canSend,
    menuOpen,
    matchingSkills,
    menuIndex,
    onChange: handleChange,
    onKeyDown: handleKeyDown,
    onSubmit: handleSubmit,
    onSelectSkill: selectSkill,
    onBlur: () => setMenuDismissed(true),
    onScroll: syncHighlightScroll,
    fill,
  }
}
