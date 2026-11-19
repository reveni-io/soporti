import { getAwsConfig, saveAwsAccessKey, saveAwsEnabled, saveAwsRegion } from '../../../services/services.js'
import { useAuthedConfig } from '../../../hooks/useAuthedConfig/useAuthedConfig.js'
import AdminSection from '../AdminSection/AdminSection.jsx'
import AdminSectionStatus from '../AdminSectionStatus/AdminSectionStatus.jsx'
import StatusRow from '../StatusRow/StatusRow.jsx'
import ToggleField from '../ToggleField/ToggleField.jsx'
import ValueField from '../ValueField/ValueField.jsx'
import AwsAccessKeyForm from './AwsAccessKeyForm/AwsAccessKeyForm.jsx'
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

  async function saveAccessKey(key) {
    const data = await saveAwsAccessKey(token, key)
    patchConfig({ accessKeyConfigured: data.accessKeyConfigured })
  }

  if (error || !config) return <AdminSectionStatus title="AWS" error={error} />

  return (
    <>
      <AdminSection title="AWS integration">
        <p className="admin__muted">
          Lets the assistant check production in your AWS account: the CloudWatch alarms that are firing, the health,
          deployments and recently stopped tasks of your ECS services, and any CloudWatch metric. It is read-only — it
          can never restart, scale or deploy anything.
        </p>

        <StatusRow configured={config.enabled} configuredLabel="on" unconfiguredLabel="off" />

        <ToggleField
          enabled={config.enabled}
          label="Let the assistant read this AWS account"
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
            Give that role or user a policy that allows only these read actions:{' '}
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
          Asks AWS who Soporti is and tries one read of each kind, so you can see which permissions are missing.
        </p>

        <AwsConnectionTest token={token} onLogout={onLogout} />
      </AdminSection>
    </>
  )
}
