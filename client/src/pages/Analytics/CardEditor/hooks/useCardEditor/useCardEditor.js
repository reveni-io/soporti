import { useEffect, useRef, useState } from 'react'
import { isUnauthorized, runAnalyticsQuery } from '../../../../../services/services.js'
import { useSaveField } from '../../../../../hooks/useSaveField/useSaveField.js'

const UNBOUND_CARD_ERROR =
  'Several databases are connected, and this chart has none yet. Ask for a change so the assistant picks the one that holds the data.'

function resolveConnectionId(card, databases) {
  if (card.sql) return card.connectionId

  return databases.length === 1 ? databases[0].id : null
}

export function useCardEditor({ card, databases, token, onLogout, onClose, onSave, onRevise, onDelete }) {
  const [title, setTitle] = useState(card.title)
  const [sql, setSql] = useState(card.sql ?? '')
  const [chart, setChart] = useState(card.chart)
  const [query, setQuery] = useState(
    card.sql ? { sql: card.sql, chart: card.chart, connectionId: card.connectionId } : null
  )
  const [preview, setPreview] = useState(null)
  const [isRunning, setIsRunning] = useState(Boolean(card.sql))
  const [runError, setRunError] = useState(null)
  const saving = useSaveField()
  const removal = useSaveField()
  const revision = useSaveField()
  const onLogoutRef = useRef(onLogout)
  onLogoutRef.current = onLogout

  useEffect(() => {
    if (!query) return

    let active = true

    async function load() {
      try {
        const { chart: reconciledChart, ...result } = await runAnalyticsQuery(token, query)
        if (!active) return

        setPreview(result)
        setChart(reconciledChart)
      } catch (err) {
        if (!active) return
        if (isUnauthorized(err)) {
          onLogoutRef.current?.()
          return
        }

        setRunError(err.message)
      } finally {
        if (active) setIsRunning(false)
      }
    }

    load()

    return () => {
      active = false
    }
  }, [token, query])

  function run() {
    if (isRunning || !sql.trim()) return

    const connectionId = resolveConnectionId(card, databases)
    if (connectionId === null && !card.sql) {
      setRunError(UNBOUND_CARD_ERROR)
      return
    }

    setIsRunning(true)
    setRunError(null)
    setQuery({ sql, chart, connectionId })
  }

  async function save() {
    removal.clearError()

    const saved = await saving.save(() => onSave(card.id, { title: title.trim(), sql, chart }))
    if (saved) onClose()
  }

  async function askForChange(prompt) {
    const asked = await revision.save(() => onRevise(card.id, prompt))
    if (asked) onClose()
  }

  async function remove() {
    saving.clearError()

    const removed = await removal.save(() => onDelete(card.id))
    if (removed) onClose()
  }

  return {
    title,
    sql,
    chart,
    preview,
    isRunning,
    runError,
    isSaving: saving.saving,
    isRemoving: removal.saving,
    submitError: saving.error ?? removal.error,
    isRevising: revision.saving,
    reviseError: revision.error,
    canSave: Boolean(title.trim()) && Boolean(sql.trim()) && !saving.saving && !removal.saving,
    setTitle,
    setSql,
    setChart,
    run,
    save,
    askForChange,
    remove,
  }
}
