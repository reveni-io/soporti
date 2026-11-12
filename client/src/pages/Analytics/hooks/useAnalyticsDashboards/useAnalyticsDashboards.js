import {
  createAnalyticsDashboard,
  deleteAnalyticsDashboard,
  listAnalyticsDashboards,
  updateAnalyticsDashboard,
} from '../../../../services/services.js'
import { usePolledResource } from '../../../../hooks/usePolledResource/usePolledResource.js'
import { sendGuarded } from '../guarded-request.js'

const NO_DASHBOARDS = []
const NO_POLL_INTERVAL_MS = 0

function neverPoll() {
  return false
}

function isOwned(dashboard) {
  return dashboard.isOwner
}

function insertOwned(dashboards, created) {
  const firstShared = dashboards.findLastIndex(isOwned) + 1

  return [...dashboards.slice(0, firstShared), created, ...dashboards.slice(firstShared)]
}

export function useAnalyticsDashboards(token, onLogout) {
  const { data, setData, loading, error } = usePolledResource(listAnalyticsDashboards, {
    token,
    intervalMs: NO_POLL_INTERVAL_MS,
    shouldPoll: neverPoll,
    onLogout,
  })

  const dashboards = data?.dashboards ?? NO_DASHBOARDS

  function patchDashboards(patch) {
    setData(previous => previous && { ...previous, dashboards: patch(previous.dashboards) })
  }

  async function create(name) {
    const result = await sendGuarded(() => createAnalyticsDashboard(token, name), onLogout)
    if (!result) return null

    patchDashboards(list => insertOwned(list, result.dashboard))

    return result.dashboard
  }

  async function update(id, changes) {
    const result = await sendGuarded(() => updateAnalyticsDashboard(token, id, changes), onLogout)
    if (!result) return null

    patchDashboards(list => list.map(dashboard => (dashboard.id === id ? result.dashboard : dashboard)))

    return result.dashboard
  }

  async function remove(id) {
    const result = await sendGuarded(() => deleteAnalyticsDashboard(token, id), onLogout)
    if (!result) return

    patchDashboards(list => list.filter(dashboard => dashboard.id !== id))
    if (dashboards.some(dashboard => dashboard.isOwner && dashboard.id !== id)) return

    const reloaded = await sendGuarded(() => listAnalyticsDashboards(token), onLogout)
    if (reloaded) setData(reloaded)
  }

  return { dashboards, configured: data?.configured ?? null, loading, error, create, update, remove }
}
