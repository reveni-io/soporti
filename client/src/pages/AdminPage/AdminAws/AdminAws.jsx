import {
  getAwsConfig,
  saveAwsAccessKey,
  saveAwsAccounts,
  saveAwsEnabled,
  saveAwsRegion,
  saveAwsRoleArn,
} from '../../../services/services.js'
import { useAuthedConfig } from '../../../hooks/useAuthedConfig/useAuthedConfig.js'
import AdminSection from '../AdminSection/AdminSection.jsx'
import AdminSectionStatus from '../AdminSectionStatus/AdminSectionStatus.jsx'
import StatusRow from '../StatusRow/StatusRow.jsx'
import ToggleField from '../ToggleField/ToggleField.jsx'
import ValueField from '../ValueField/ValueField.jsx'
import AwsAccessKeyForm from './AwsAccessKeyForm/AwsAccessKeyForm.jsx'
import AwsAccounts from './AwsAccounts/AwsAccounts.jsx'
import AwsConnectionTest from './AwsConnectionTest/AwsConnectionTest.jsx'

const READ_ACTIONS = [
  'cloudwatch:DescribeAlarms',
  'cloudwatch:ListMetrics',
  'cloudwatch:GetMetricData',
  'ecs:ListClusters',
  'ecs:DescribeClusters',
  'ecs:ListServices',
  'ecs:DescribeServices',
  'ecs:ListTasks',
  'ecs:DescribeTasks',
]

export default function AdminAws({ token, onLogout }) {
  const { config, error, patchConfig } = useAuthedConfig(getAwsConfig, token, onLogout)

  async function saveEnabled(enabled) {
    const data = await saveAwsEnabled(token, enabled)
    patchConfig({ enabled: data.enabled })
  }

  async function saveRegion(value) {
    const data = await saveAwsRegion(token, value)
    patchConfig({ region: data.region })
  }

  async function saveRoleArn(value) {
    const data = await saveAwsRoleArn(token, value)
    patchConfig({ roleArn: data.roleArn })
  }

  async function saveAccounts(accounts) {
    const data = await saveAwsAccounts(token, accounts)
    patchConfig({ accounts: data.accounts })
  }

  async function saveAccessKey(key) {
    const data = await saveAwsAccessKey(token, key)
    patchConfig({ accessKeyConfigured: data.accessKeyConfigured })
  }

  if (error || !config) return <AdminSectionStatus title="AWS" error={error} />

  return (
    <>
      <AdminSection title="AWS integration">
        <p className="admin__muted">
          Lets the assistant check production in your AWS accounts: the CloudWatch alarms that are firing, the health,
          deployments and recently stopped tasks of your ECS services, and any CloudWatch metric. It is read-only — it
          can never restart, scale or deploy anything.
        </p>

        <StatusRow configured={config.enabled} configuredLabel="on" unconfiguredLabel="off" />

        <ToggleField
          enabled={config.enabled}
          label="Let the assistant read AWS"
          hint="Off by default. Turn it on once Soporti has AWS credentials with the permissions below."
          onSave={saveEnabled}
          onLogout={onLogout}
        />
      </AdminSection>

      <AdminSection title="Setup">
        <ol className="admin__steps">
          <li>
            If Soporti runs inside AWS (ECS, EC2, EKS), it already has an identity: the{' '}
            <strong>IAM role of its task or instance</strong>. Nothing has to be stored here — leave the access key
            below empty.
          </li>
          <li>
            If it runs somewhere else, create an IAM user for it and save that user&apos;s access key below. It is
            stored encrypted and never shown again.
          </li>
          <li>
            To read other accounts, give each one a role that Soporti&apos;s identity may assume, and list them under{' '}
            <strong>Accounts</strong>. When the roles trust a central role instead, set it under{' '}
            <strong>Role to assume</strong>.
          </li>
          <li>
            Give the role that reads each account a policy that allows only these read actions:{' '}
            {READ_ACTIONS.map((action, index) => (
              <span key={action}>
                {index > 0 && ', '}
                <code>{action}</code>
              </span>
            ))}
            .
          </li>
          <li>
            Turn the switch on and use <strong>Test connection</strong> to check each permission.
          </li>
        </ol>
      </AdminSection>

      <AdminSection title="Region">
        <p className="admin__muted">
          Leave it empty to use the region of the environment — ECS and Lambda set <code>AWS_REGION</code> on their own.
        </p>

        <ValueField
          savedValue={config.region}
          onSave={saveRegion}
          onLogout={onLogout}
          placeholder="eu-central-1"
          removable
        />
      </AdminSection>

      <AdminSection title="Role to assume">
        <p className="admin__muted">
          Optional. Soporti assumes this role with its own identity before anything else, and reads with it when no
          accounts are listed below. Leave it empty to use Soporti&apos;s own identity.
        </p>

        <ValueField
          savedValue={config.roleArn}
          onSave={saveRoleArn}
          onLogout={onLogout}
          placeholder="arn:aws:iam::123456789012:role/monitoring-hub"
          removable
        />
      </AdminSection>

      <AdminSection title="Accounts">
        <p className="admin__muted">
          Optional. One row per AWS account to read, such as one per environment: a short name the assistant uses to
          pick it, and the read-only role Soporti assumes in it — from the role above when one is set.
        </p>

        <AwsAccounts savedAccounts={config.accounts} onSave={saveAccounts} onLogout={onLogout} />
      </AdminSection>

      <AdminSection title="Access key">
        <p className="admin__muted">
          Only when Soporti runs outside AWS. Use a long-term key of a dedicated IAM user with the read-only policy
          above. When a key is saved it is used instead of the environment&apos;s role.
        </p>

        <StatusRow configured={config.accessKeyConfigured} unconfiguredLabel="not set — using the environment" />

        <AwsAccessKeyForm configured={config.accessKeyConfigured} onSave={saveAccessKey} onLogout={onLogout} />
      </AdminSection>

      <AdminSection title="Test connection">
        <p className="admin__muted">
          Asks AWS who Soporti is and, for each account, which identity it reads with and whether one read of each kind
          works, so you can see which role or permission is missing.
        </p>

        <AwsConnectionTest token={token} onLogout={onLogout} />
      </AdminSection>
    </>
  )
}
