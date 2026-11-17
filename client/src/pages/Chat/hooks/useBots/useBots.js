import { getBots } from '../../../../services/services.js'
import { usePolledResource } from '../../../../hooks/usePolledResource/usePolledResource.js'

const BOTS_POLL_INTERVAL_MS = 15_000
const NO_BOTS = []

function alwaysPoll() {
  return true
}

export function useBots(token, onLogout) {
  const { data, loading, error, reload } = usePolledResource(getBots, {
    token,
    intervalMs: BOTS_POLL_INTERVAL_MS,
    shouldPoll: alwaysPoll,
    onLogout,
  })

  return { bots: data?.bots ?? NO_BOTS, loading, error, reload }
}
