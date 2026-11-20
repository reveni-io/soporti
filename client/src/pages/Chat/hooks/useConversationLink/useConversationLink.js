import { useEffect, useRef } from 'react'
import { CONVERSATION_PARAM, UUID_RE } from '../../../../constants.js'
import { useLinkParam } from '../useLinkParam/useLinkParam.js'

export function useConversationLink(token, onOpen) {
  const { value: conversationId, clear } = useLinkParam(CONVERSATION_PARAM)
  const openedRef = useRef(null)
  const linkRef = useRef({ onOpen, clear })
  linkRef.current = { onOpen, clear }

  useEffect(() => {
    if (!conversationId) {
      openedRef.current = null
      return
    }
    if (!token || !UUID_RE.test(conversationId) || openedRef.current === conversationId) return

    openedRef.current = conversationId
    linkRef.current.onOpen(conversationId)
    linkRef.current.clear()
  }, [token, conversationId])
}
