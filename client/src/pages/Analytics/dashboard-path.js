import { ROUTES } from '../../router/constants.js'

export function dashboardPath(id) {
  return ROUTES.ANALYTICS_DASHBOARD.replace(':dashboardId', id)
}
