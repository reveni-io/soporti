import AdminSection from '../AdminSection/AdminSection.jsx'
import AdminSectionStatus from '../AdminSectionStatus/AdminSectionStatus.jsx'
import StatusRow from '../StatusRow/StatusRow.jsx'
import SendcloudAccountForm from './SendcloudAccountForm/SendcloudAccountForm.jsx'
import SendcloudAccountsTable from './SendcloudAccountsTable/SendcloudAccountsTable.jsx'
import { useSendcloudAccounts } from './hooks/useSendcloudAccounts/useSendcloudAccounts.js'

export default function AdminSendcloud({ token, onLogout }) {
  const { accounts, error, reload } = useSendcloudAccounts(token, onLogout)

  if (error || !accounts) return <AdminSectionStatus title="Sendcloud" error={error} />

  return (
    <>
      <AdminSection title="Sendcloud integration">
        <p className="admin__muted">
          Lets the assistant track parcels, follow returns and list the shipping methods of one or more Sendcloud
          accounts — one per brand or store. It only reads: it never creates labels or cancels anything. The keys are
          stored in the database and never shown again after saving.
        </p>

        <StatusRow configured={accounts.length > 0} />
      </AdminSection>

      <AdminSection title="Setup">
        <ol className="admin__steps">
          <li>
            In Sendcloud, open <strong>Settings → Integrations</strong>, find <strong>Sendcloud API</strong> and click{' '}
            <strong>Connect</strong>.
          </li>
          <li>
            Give the integration a name and save it: Sendcloud generates a <strong>public key</strong> and a{' '}
            <strong>secret key</strong>.
          </li>
          <li>
            Link the account below with a name the team recognizes, like the brand or the store. The assistant asks for
            it by that name when several accounts are linked.
          </li>
        </ol>
      </AdminSection>

      <AdminSection title="Accounts">
        <SendcloudAccountsTable token={token} accounts={accounts} onLogout={onLogout} onRemoved={reload} />
      </AdminSection>

      <AdminSection title="Link an account">
        <SendcloudAccountForm token={token} onLogout={onLogout} onLinked={reload} />
      </AdminSection>
    </>
  )
}
