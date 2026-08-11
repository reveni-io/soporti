import { useRef, useState } from 'react'

const FILES_TYPE = 'Files'

function isFileDrag(dataTransfer) {
  return [...(dataTransfer?.types ?? [])].includes(FILES_TYPE)
}

export function useFileDrop(onDropFiles, enabled) {
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)
  const enteredTargets = useRef(0)

  function stopDragging() {
    enteredTargets.current = 0
    setIsDraggingFiles(false)
  }

  function handleDragEnter(event) {
    if (!isFileDrag(event.dataTransfer)) return

    event.preventDefault()
    enteredTargets.current += 1

    if (enabled) setIsDraggingFiles(true)
  }

  function handleDragOver(event) {
    if (!isFileDrag(event.dataTransfer)) return

    event.preventDefault()
    event.dataTransfer.dropEffect = enabled ? 'copy' : 'none'
  }

  function handleDragLeave(event) {
    if (!isFileDrag(event.dataTransfer)) return

    enteredTargets.current -= 1

    if (enteredTargets.current <= 0) stopDragging()
  }

  function handleDrop(event) {
    if (!isFileDrag(event.dataTransfer)) return

    event.preventDefault()
    stopDragging()

    const files = event.dataTransfer.files
    if (!enabled || files.length === 0) return

    onDropFiles(files)
  }

  return {
    isDraggingFiles,
    dropProps: {
      onDragEnter: handleDragEnter,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
  }
}
