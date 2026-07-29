import AdminAuthentication from './AdminAuthentication/AdminAuthentication.jsx'
import AdminBetterstack from './AdminBetterstack/AdminBetterstack.jsx'
import AdminDatabase from './AdminDatabase/AdminDatabase.jsx'
import AdminGithub from './AdminGithub/AdminGithub.jsx'
import AdminGoogleDrive from './AdminGoogleDrive/AdminGoogleDrive.jsx'
import AdminHelpjuice from './AdminHelpjuice/AdminHelpjuice.jsx'
import AdminKnowledge from './AdminKnowledge/AdminKnowledge.jsx'
import AdminLlm from './AdminLlm/AdminLlm.jsx'
import AdminNotion from './AdminNotion/AdminNotion.jsx'
import AdminSentry from './AdminSentry/AdminSentry.jsx'
import AdminShopify from './AdminShopify/AdminShopify.jsx'
import AdminShortcut from './AdminShortcut/AdminShortcut.jsx'
import AdminSlack from './AdminSlack/AdminSlack.jsx'
import AdminStats from './AdminStats/AdminStats.jsx'
import AdminUsers from './AdminUsers/AdminUsers.jsx'

export const SECTIONS = [
  { path: 'stats', label: 'Stats', icon: 'chart', Component: AdminStats },
  { path: 'users', label: 'Users', icon: 'users', Component: AdminUsers },
  { path: 'authentication', label: 'Authentication', icon: 'shield', Component: AdminAuthentication },
  { path: 'llm', label: 'LLM', icon: 'spark', Component: AdminLlm },
  { path: 'knowledge', label: 'Knowledge base', icon: 'help-center', Component: AdminKnowledge },
  { path: 'github', label: 'GitHub', icon: 'github', Component: AdminGithub },
  { path: 'google-drive', label: 'Google Drive', icon: 'google-drive', Component: AdminGoogleDrive },
  { path: 'notion', label: 'Notion', icon: 'notion', Component: AdminNotion },
  { path: 'helpjuice', label: 'Helpjuice', icon: 'help-circle', Component: AdminHelpjuice },
  { path: 'database', label: 'Database', icon: 'database', Component: AdminDatabase },
  { path: 'shopify', label: 'Shopify', icon: 'shopify', Component: AdminShopify },
  { path: 'shortcut', label: 'Shortcut', icon: 'shortcut', Component: AdminShortcut },
  { path: 'sentry', label: 'Sentry', icon: 'sentry', Component: AdminSentry },
  { path: 'betterstack', label: 'Better Stack', icon: 'betterstack', Component: AdminBetterstack },
  { path: 'slack', label: 'Slack', icon: 'slack', Component: AdminSlack },
]
