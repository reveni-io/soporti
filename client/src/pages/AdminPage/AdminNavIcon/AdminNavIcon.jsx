import Icon from '../../../common/Icon/Icon.jsx'
import IntegrationIcon from '../../../common/IntegrationIcon/IntegrationIcon.jsx'
import { hasIntegrationIcon } from '../../../common/IntegrationIcon/icon-paths.js'

const NAV_ICON_SIZE = 16

export default function AdminNavIcon({ id }) {
  if (hasIntegrationIcon(id)) return <IntegrationIcon id={id} size={NAV_ICON_SIZE} />

  return <Icon name={id} size={NAV_ICON_SIZE} />
}
