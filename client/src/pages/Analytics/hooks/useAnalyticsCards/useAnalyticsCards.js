import { useCallback, useRef } from 'react'
import {
  createAnalyticsCard,
  deleteAnalyticsCard,
  isUnauthorized,
  listAnalyticsCards,
  retryAnalyticsCard,
  reviseAnalyticsCard,
  saveAnalyticsLayout,
  updateAnalyticsCard,
} from '../../../../services/services.js'
import { usePolledResource } from '../../../../hooks/usePolledResource/usePolledResource.js'
import { ANALYTICS_STATUS } from '../../../../constants.js'
import { sendGuarded } from '../guarded-request.js'

const POLL_INTERVAL_MS = 2000
const NOT_FOUND_STATUS = 404
const NO_CARDS = []

function hasGeneratingCard(data) {
  return data.cards.some(card => card.status === ANALYTICS_STATUS.GENERATING)
}

function upsertCard(cards, card) {
  if (!cards.some(existing => existing.id === card.id)) return [...cards, card]

  return cards.map(existing => (existing.id === card.id ? card : existing))
}

function toLayoutItem({ id, x, y, w, h }) {
  return { id, x, y, w, h }
}

function unavailable(dashboardId, details) {
  return { dashboardId, dashboard: null, cards: NO_CARDS, ...details }
}

export function useAnalyticsCards(token, dashboardId, onLogout) {
  const mutationCount = useRef(0)
  const loadedId = useRef(null)

  const loadCards = useCallback(
    async authToken => {
      try {
        const mutationsBefore = mutationCount.current
        const data = await listAnalyticsCards(authToken, dashboardId)
        const isStale = mutationCount.current !== mutationsBefore
        const settled = isStale ? await listAnalyticsCards(authToken, dashboardId) : data

        loadedId.current = dashboardId

        return { ...settled, dashboardId }
      } catch (err) {
        if (err.status === NOT_FOUND_STATUS) return unavailable(dashboardId, { notFound: true })
        if (isUnauthorized(err) || loadedId.current === dashboardId) throw err

        return unavailable(dashboardId, { failure: err.message })
      }
    },
    [dashboardId]
  )

  const { data, setData, error } = usePolledResource(loadCards, {
    token,
    intervalMs: POLL_INTERVAL_MS,
    shouldPoll: hasGeneratingCard,
    onLogout,
  })

  const current = data?.dashboardId === dashboardId ? data : null

  function patchCards(patch) {
    mutationCount.current += 1
    setData(previous => {
      if (previous?.dashboardId !== dashboardId) return previous

      return { ...previous, cards: patch(previous.cards) }
    })
  }

  async function storeCard(request) {
    const result = await sendGuarded(request, onLogout)
    if (!result) return

    patchCards(cards => upsertCard(cards, result.card))
  }

  function create(prompt) {
    return storeCard(() => createAnalyticsCard(token, dashboardId, prompt))
  }

  function revise(id, prompt) {
    return storeCard(() => reviseAnalyticsCard(token, id, prompt))
  }

  function retry(id) {
    return storeCard(() => retryAnalyticsCard(token, id))
  }

  function update(id, changes) {
    return storeCard(() => updateAnalyticsCard(token, id, changes))
  }

  async function remove(id) {
    const result = await sendGuarded(() => deleteAnalyticsCard(token, id), onLogout)
    if (!result) return

    patchCards(cards => cards.filter(card => card.id !== id))
  }

  async function saveLayout(layout) {
    try {
      await saveAnalyticsLayout(token, dashboardId, layout.map(toLayoutItem))
    } catch (err) {
      if (isUnauthorized(err)) onLogout?.()
    }
  }

  return {
    dashboard: current?.dashboard ?? null,
    cards: current?.cards ?? NO_CARDS,
    notFound: current?.notFound === true,
    loading: !current,
    error: current ? (current.failure ?? error) : null,
    create,
    revise,
    retry,
    update,
    remove,
    saveLayout,
  }
}
