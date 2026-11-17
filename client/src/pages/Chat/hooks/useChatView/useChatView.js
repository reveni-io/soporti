import { generatePath, useMatch, useNavigate } from 'react-router-dom'
import { ROUTES } from '../../../../router/constants.js'

const BOT_ID_RE = /^\d{1,9}$/

function parseBotId(match) {
  if (!match || !BOT_ID_RE.test(match.params.botId)) return null

  return Number(match.params.botId)
}

export function useChatView() {
  const navigate = useNavigate()
  const botMatch = useMatch(ROUTES.BOT)
  const botsMatch = useMatch(ROUTES.BOTS)

  const isBotView = Boolean(botMatch)
  const isBotsView = Boolean(botsMatch)
  const isChatView = !isBotView && !isBotsView

  function showChat() {
    if (!isChatView) navigate(ROUTES.CHAT)
  }

  function showBots() {
    navigate(ROUTES.BOTS)
  }

  function showBot(id) {
    navigate(generatePath(ROUTES.BOT, { botId: String(id) }))
  }

  return { isChatView, isBotsView, isBotView, botId: parseBotId(botMatch), showChat, showBots, showBot }
}
