import { useCallback, useEffect, useRef } from 'react'
import { isUnauthorized, markBotRead } from '../../../../services/services.js'

export function useOpenBot({ token, botId, unreadCount, isLoading, openBot, refreshBot, reloadBots, onLogout }) {
  const pendingSyncRef = useRef(null)
  const onLogoutRef = useRef(onLogout)
  onLogoutRef.current = onLogout

  const isIdle = Boolean(botId) && !isLoading

  const markRead = useCallback(
    async id => {
      try {
        await markBotRead(token, id)
        await reloadBots()
      } catch (err) {
        if (isUnauthorized(err)) onLogoutRef.current?.()
      }
    },
    [token, reloadBots]
  )

  const runSync = useCallback(async task => {
    const sync = {}
    pendingSyncRef.current = sync

    await task()

    if (pendingSyncRef.current === sync) pendingSyncRef.current = null
  }, [])

  useEffect(() => {
    if (!token || !botId) return

    runSync(async () => {
      await openBot(botId)
      await markRead(botId)
    })
  }, [token, botId, openBot, markRead, runSync])

  useEffect(() => {
    if (!token || !isIdle || unreadCount === 0 || pendingSyncRef.current) return

    runSync(async () => {
      await refreshBot(botId)
      await markRead(botId)
    })
  }, [token, botId, isIdle, unreadCount, refreshBot, markRead, runSync])
}
