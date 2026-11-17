import { useCallback } from 'react'
import { usePolledResource } from '../../../../hooks/usePolledResource/usePolledResource.js'
import { useSaveField } from '../../../../hooks/useSaveField/useSaveField.js'
import { deleteBotRoutine, getBotRoutines, setBotRoutinePaused } from '../../../../services/services.js'

const NO_ROUTINES = []
const NO_POLL_INTERVAL_MS = 0

function neverPoll() {
  return false
}

export function useBotRoutines(token, botId, onLogout) {
  const fetchRoutines = useCallback(currentToken => getBotRoutines(currentToken, botId), [botId])
  const { data, loading, error, reload } = usePolledResource(fetchRoutines, {
    token,
    intervalMs: NO_POLL_INTERVAL_MS,
    shouldPoll: neverPoll,
    onLogout,
  })
  const action = useSaveField(onLogout)

  async function perform(request) {
    const isDone = await action.save(request)
    if (isDone) await reload()
  }

  function togglePaused(routine) {
    return perform(() => setBotRoutinePaused(token, botId, routine.id, !routine.paused))
  }

  function remove(routineId) {
    return perform(() => deleteBotRoutine(token, botId, routineId))
  }

  return {
    routines: data?.routines ?? NO_ROUTINES,
    loading,
    error,
    isBusy: action.saving,
    actionError: action.error,
    togglePaused,
    remove,
  }
}
