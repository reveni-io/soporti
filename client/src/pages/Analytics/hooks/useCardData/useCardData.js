import { useEffect, useRef, useState } from 'react'
import { getAnalyticsCardData, isUnauthorized } from '../../../../services/services.js'
import { ANALYTICS_STATUS } from '../../../../constants.js'

export function useCardData(token, card, { refreshKey, onLogout }) {
  const [outcome, setOutcome] = useState(null)
  const [isFetching, setIsFetching] = useState(false)
  const [refreshCount, setRefreshCount] = useState(0)
  const handledRefresh = useRef({ refreshKey, refreshCount })
  const onLogoutRef = useRef(onLogout)
  onLogoutRef.current = onLogout

  const { id, sql } = card
  const isQueryable = card.status === ANALYTICS_STATUS.READY && Boolean(sql)
  const current = outcome?.sql === sql ? outcome : null

  useEffect(() => {
    const previous = handledRefresh.current
    const fresh = previous.refreshKey !== refreshKey || previous.refreshCount !== refreshCount
    handledRefresh.current = { refreshKey, refreshCount }

    if (!isQueryable) return

    let active = true

    async function load() {
      setIsFetching(true)

      try {
        const data = await getAnalyticsCardData(token, id, { fresh })
        if (!active) return

        setOutcome({ sql, data, error: null })
      } catch (err) {
        if (!active) return
        if (isUnauthorized(err)) {
          onLogoutRef.current?.()
          return
        }

        setOutcome({ sql, data: null, error: err.message })
      } finally {
        if (active) setIsFetching(false)
      }
    }

    load()

    return () => {
      active = false
    }
  }, [token, id, sql, isQueryable, refreshKey, refreshCount])

  function refresh() {
    setRefreshCount(count => count + 1)
  }

  return {
    data: current?.data ?? null,
    loading: isQueryable && isFetching,
    error: current?.error ?? null,
    refresh,
  }
}
