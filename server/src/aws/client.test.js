import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { awsSend, clientConfigs, commandClass, environment } = vi.hoisted(() => {
  const awsSend = vi.fn()
  const clientConfigs = []
  const environment = { region: 'env-region-1' }

  function commandClass(name) {
    return class {
      constructor(input) {
        this.name = name
        this.input = input
      }
    }
  }

  return { awsSend, clientConfigs, commandClass, environment }
})

async function resolveMockRegion(config) {
  const region = config.region ?? environment.region
  if (!region) throw new Error('Region is missing')

  return region
}

function clientClass(service) {
  return class {
    constructor(config) {
      clientConfigs.push({ service, config })
      this.credentials = config.credentials
      this.config = { region: () => resolveMockRegion(config) }
    }

    async send(command) {
      const credentials = typeof this.credentials === 'function' ? await this.credentials() : this.credentials
      return awsSend(service, command, credentials)
    }
  }
}

vi.mock('@aws-sdk/client-cloudwatch', () => ({
  CloudWatchClient: clientClass('cloudwatch'),
  DescribeAlarmsCommand: commandClass('DescribeAlarms'),
  GetMetricDataCommand: commandClass('GetMetricData'),
  ListMetricsCommand: commandClass('ListMetrics'),
}))
vi.mock('@aws-sdk/client-ecs', () => ({
  ECSClient: clientClass('ecs'),
  DescribeClustersCommand: commandClass('DescribeClusters'),
  DescribeServicesCommand: commandClass('DescribeServices'),
  DescribeTasksCommand: commandClass('DescribeTasks'),
  ListClustersCommand: commandClass('ListClusters'),
  ListServicesCommand: commandClass('ListServices'),
  ListTasksCommand: commandClass('ListTasks'),
}))
vi.mock('@aws-sdk/client-sts', () => ({
  STSClient: clientClass('sts'),
  AssumeRoleCommand: commandClass('AssumeRole'),
  GetCallerIdentityCommand: commandClass('GetCallerIdentity'),
}))

const getAwsAccessKey = vi.fn()
const getAwsAccounts = vi.fn()
const getAwsRegion = vi.fn()
const getAwsRoleArn = vi.fn()
const isAwsConfigured = vi.fn()
vi.mock('./settings.js', () => ({ getAwsAccessKey, getAwsAccounts, getAwsRegion, getAwsRoleArn, isAwsConfigured }))

const {
  AWS_REQUEST_FAILED,
  getEcsService,
  getMetricData,
  isConfigured,
  listAccounts,
  listAlarms,
  listEcsClusters,
  listEcsServices,
  listMetrics,
  testConnection,
  _resetAwsClientsForTests,
} = await import('./client.js')

const CLUSTER_ARN = 'arn:aws:ecs:eu-central-1:123456789012:cluster/prod-cluster'
const TASK_DEFINITION = 'arn:aws:ecs:eu-central-1:123456789012:task-definition/prod-backend:412'

let handlers

function awsFailure(name, { status, message = `${name} happened` } = {}) {
  const error = new Error(message)
  error.name = name
  error.$metadata = { httpStatusCode: status }
  return error
}

function useHandlers(map) {
  handlers = map
}

function commandsNamed(name) {
  return awsSend.mock.calls.map(([, command]) => command).filter(command => command.name === name)
}

function service(overrides = {}) {
  return {
    serviceName: 'prod-backend',
    status: 'ACTIVE',
    desiredCount: 2,
    runningCount: 2,
    pendingCount: 0,
    launchType: 'FARGATE',
    taskDefinition: TASK_DEFINITION,
    deployments: [
      {
        status: 'PRIMARY',
        rolloutState: 'COMPLETED',
        taskDefinition: TASK_DEFINITION,
        desiredCount: 2,
        runningCount: 2,
        pendingCount: 0,
        failedTasks: 0,
        createdAt: new Date('2026-11-19T09:00:00Z'),
        updatedAt: new Date('2026-11-19T09:06:00Z'),
      },
    ],
    events: [
      { createdAt: new Date('2026-11-19T09:06:00Z'), message: '(service prod-backend) has reached a steady state.' },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  clientConfigs.length = 0
  environment.region = 'env-region-1'
  _resetAwsClientsForTests()
  isAwsConfigured.mockResolvedValue(true)
  getAwsRegion.mockResolvedValue(null)
  getAwsAccessKey.mockResolvedValue(null)
  getAwsRoleArn.mockResolvedValue(null)
  getAwsAccounts.mockResolvedValue([])
  handlers = {}
  awsSend.mockImplementation(async (_service, command, credentials) => {
    const handler = handlers[command.name]
    if (!handler) throw new Error(`Unexpected ${command.name}`)
    return handler(command.input, credentials)
  })
})

describe('isConfigured', () => {
  it('follows the AWS switch in /admin', async () => {
    isAwsConfigured.mockResolvedValue(false)

    expect(await isConfigured()).toBe(false)
  })
})

describe('AWS clients', () => {
  it('use the default credential chain and environment region when /admin holds neither', async () => {
    useHandlers({ ListClusters: () => ({ clusterArns: [] }) })

    await listEcsClusters()

    expect(clientConfigs.map(entry => entry.service)).toEqual(['sts', 'cloudwatch', 'ecs', 'sts'])
    expect(clientConfigs[2].config).toEqual({ region: undefined, credentials: undefined, maxAttempts: 3 })
  })

  it('use the stored region and access key, and rebuild only when they change', async () => {
    const key = { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' }
    getAwsRegion.mockResolvedValue('eu-central-1')
    getAwsAccessKey.mockResolvedValue(key)
    useHandlers({ ListClusters: () => ({ clusterArns: [] }) })

    await listEcsClusters()
    await listEcsClusters()
    getAwsRegion.mockResolvedValue('eu-west-1')
    await listEcsClusters()

    expect(clientConfigs).toHaveLength(8)
    expect(clientConfigs[2].config).toEqual({ region: 'eu-central-1', credentials: key, maxAttempts: 3 })
    expect(clientConfigs[6].config.region).toBe('eu-west-1')
  })

  it('refuse to call AWS while the switch is off', async () => {
    isAwsConfigured.mockResolvedValue(false)

    await expect(listAlarms()).rejects.toMatchObject({
      code: AWS_REQUEST_FAILED,
      message: 'AWS is not enabled. Turn it on in /admin → AWS.',
    })
    expect(awsSend).not.toHaveBeenCalled()
  })
})

describe('AWS accounts', () => {
  const HUB_ARN = 'arn:aws:iam::111111111111:role/monitoring-hub'
  const PROD_ARN = 'arn:aws:iam::222222222222:role/reader-prod'
  const DEV_ARN = 'arn:aws:iam::333333333333:role/reader-dev'
  const ROLE_KEYS = { [HUB_ARN]: 'hub-key', [PROD_ARN]: 'prod-key', [DEV_ARN]: 'dev-key' }
  const HOUR_MS = 60 * 60 * 1000

  function assumedCredentials(roleArn, expiresInMs) {
    return {
      Credentials: {
        AccessKeyId: ROLE_KEYS[roleArn],
        SecretAccessKey: 'secret',
        SessionToken: 'token',
        Expiration: new Date(Date.now() + expiresInMs),
      },
    }
  }

  function useAssumableRoles({ expiresInMs = HOUR_MS } = {}) {
    const signedWith = []
    useHandlers({
      AssumeRole: input => assumedCredentials(input.RoleArn, expiresInMs),
      DescribeAlarms: (_input, credentials) => {
        signedWith.push(credentials?.accessKeyId ?? null)
        return { MetricAlarms: [] }
      },
    })
    return signedWith
  }

  function assumedBy() {
    return awsSend.mock.calls
      .filter(([, command]) => command.name === 'AssumeRole')
      .map(([, command, credentials]) => [command.input.RoleArn, credentials?.accessKeyId ?? null])
  }

  beforeEach(() => {
    getAwsRoleArn.mockResolvedValue(HUB_ARN)
    getAwsAccounts.mockResolvedValue([
      { name: 'prod', roleArn: PROD_ARN },
      { name: 'dev', roleArn: DEV_ARN },
    ])
  })

  it("assume the role first, then the account's role from it, and read with the account's credentials", async () => {
    const signedWith = useAssumableRoles()

    const result = await listAlarms({ account: 'Dev' })

    expect(result.account).toBe('dev')
    expect(signedWith).toEqual(['dev-key'])
    expect(assumedBy()).toEqual([
      [HUB_ARN, null],
      [DEV_ARN, 'hub-key'],
    ])
    expect(commandsNamed('AssumeRole')[0].input).toEqual({ RoleArn: HUB_ARN, RoleSessionName: 'soporti' })
  })

  it('reuse assumed credentials until five minutes before they expire', async () => {
    useAssumableRoles()

    await listAlarms({ account: 'prod' })
    await listAlarms({ account: 'prod' })

    expect(commandsNamed('AssumeRole')).toHaveLength(2)
  })

  it('assume the roles again when the credentials are about to expire', async () => {
    useAssumableRoles({ expiresInMs: 60_000 })

    await listAlarms({ account: 'prod' })
    await listAlarms({ account: 'prod' })

    expect(commandsNamed('AssumeRole')).toHaveLength(4)
  })

  it('read with the role itself when no accounts are configured', async () => {
    getAwsAccounts.mockResolvedValue([])
    const signedWith = useAssumableRoles()

    const result = await listAlarms()

    expect(result).not.toHaveProperty('account')
    expect(signedWith).toEqual(['hub-key'])
  })

  it('assume each account role with the own identity when no role is set', async () => {
    getAwsRoleArn.mockResolvedValue(null)
    useAssumableRoles()

    await listAlarms({ account: 'prod' })

    expect(assumedBy()).toEqual([[PROD_ARN, null]])
  })

  it('ask for the account when several are configured and name the ones that exist', async () => {
    useAssumableRoles()

    await expect(listAlarms()).rejects.toThrow(
      'Several AWS accounts are configured ("prod", "dev"): pass one as "account".'
    )
    await expect(listAlarms({ account: 'qa' })).rejects.toThrow(
      'There is no AWS account named "qa". Configured: "prod", "dev".'
    )
    expect(awsSend).not.toHaveBeenCalled()
  })

  it('use the only account when the call names none', async () => {
    getAwsAccounts.mockResolvedValue([{ name: 'prod', roleArn: PROD_ARN }])
    const signedWith = useAssumableRoles()

    expect((await listAlarms()).account).toBe('prod')
    expect(signedWith).toEqual(['prod-key'])
  })

  it('refuse an account name when no accounts are configured', async () => {
    getAwsAccounts.mockResolvedValue([])

    await expect(listAlarms({ account: 'prod' })).rejects.toMatchObject({
      code: AWS_REQUEST_FAILED,
      message: 'No AWS accounts are configured, so there is no "prod": leave out "account".',
    })
  })

  it.each([
    [HUB_ARN, HUB_ARN],
    [PROD_ARN, PROD_ARN],
  ])('explain which role AWS would not let Soporti assume (%s denied)', async (deniedArn, namedArn) => {
    useHandlers({
      AssumeRole: input => {
        if (input.RoleArn === deniedArn) throw awsFailure('AccessDenied', { status: 403 })
        return assumedCredentials(input.RoleArn, HOUR_MS)
      },
    })

    const error = await listAlarms({ account: 'prod' }).catch(err => err)

    expect(error.code).toBe(AWS_REQUEST_FAILED)
    expect(error.message).toMatch(new RegExp(`^AWS did not let Soporti assume ${namedArn}\\. The role's trust policy`))
  })

  it('keep the credential errors of the first hop', async () => {
    useHandlers({
      AssumeRole: () => {
        throw awsFailure('CredentialsProviderError')
      },
    })

    await expect(listAlarms({ account: 'prod' })).rejects.toThrow(/No AWS credentials were found/)
  })

  it('list the configured account names, or none', async () => {
    expect(await listAccounts()).toEqual({ accounts: [{ name: 'prod' }, { name: 'dev' }] })

    getAwsAccounts.mockResolvedValue([])
    getAwsRoleArn.mockResolvedValue(null)

    expect(await listAccounts()).toEqual({ accounts: [] })
  })

  it('test each account with its assumed identity, next to the identity Soporti runs as', async () => {
    useHandlers({
      AssumeRole: input => {
        if (input.RoleArn === DEV_ARN) throw awsFailure('AccessDenied', { status: 403 })
        return assumedCredentials(input.RoleArn, HOUR_MS)
      },
      GetCallerIdentity: (_input, credentials) => {
        const key = credentials?.accessKeyId ?? 'own'
        return { Account: key, Arn: `arn:${key}` }
      },
      DescribeAlarms: () => ({}),
      ListMetrics: () => ({}),
      ListClusters: () => ({}),
    })

    const result = await testConnection()

    expect(result.runsAs).toEqual({ account: 'own', arn: 'arn:own' })
    expect(result.accounts[0]).toMatchObject({ name: 'prod', account: 'prod-key', arn: 'arn:prod-key' })
    expect(result.accounts[0].checks.every(check => check.ok)).toBe(true)
    expect(result.accounts[1]).toEqual({ name: 'dev', error: expect.stringMatching(/did not let Soporti assume/) })
  })
})

describe('AWS errors', () => {
  it.each([
    [awsFailure('CredentialsProviderError'), /No AWS credentials were found/],
    [new Error('Region is missing'), /No AWS region is set/],
    [awsFailure('InvalidClientTokenId', { status: 403 }), /AWS rejected the credentials/],
    [awsFailure('AccessDeniedException', { status: 400 }), /^AWS denied cloudwatch:DescribeAlarms\. Add it/],
    [awsFailure('SomethingElse', { status: 403 }), /^AWS denied cloudwatch:DescribeAlarms\./],
    [awsFailure('InvalidParameterValueException', { message: 'Bad prefix' }), /rejected the request: Bad prefix$/],
    [
      awsFailure('ThrottlingException', { message: 'raw detail' }),
      /^AWS cloudwatch:DescribeAlarms failed \(ThrottlingException\)\.$/,
    ],
  ])('turns %s into a clear message', async (failure, expected) => {
    useHandlers({
      DescribeAlarms: () => {
        throw failure
      },
    })

    const error = await listAlarms().catch(err => err)

    expect(error.code).toBe(AWS_REQUEST_FAILED)
    expect(error.message).toMatch(expected)
  })
})

describe('listAlarms', () => {
  it('lists the firing alarms newest first and leaves autoscaling alarms out', async () => {
    useHandlers({
      DescribeAlarms: () => ({
        MetricAlarms: [
          {
            AlarmName: 'TargetTracking-service/prod-cluster/prod-backend-AlarmLow-1',
            StateValue: 'ALARM',
            StateUpdatedTimestamp: new Date('2026-11-19T10:00:00Z'),
          },
          {
            AlarmName: 'backend-5xx',
            StateValue: 'ALARM',
            StateReason: 'Threshold Crossed: 1 datapoint [42.0] was greater than the threshold (10.0).',
            StateUpdatedTimestamp: new Date('2026-11-19T08:00:00Z'),
            AlarmDescription: 'Too many 5xx from the backend',
            Namespace: 'AWS/ApplicationELB',
            MetricName: 'HTTPCode_Target_5XX_Count',
            Dimensions: [{ Name: 'LoadBalancer', Value: 'app/prod/abc' }],
            Statistic: 'Sum',
            ComparisonOperator: 'GreaterThanThreshold',
            Threshold: 10,
          },
        ],
        CompositeAlarms: [
          {
            AlarmName: 'prod-degraded',
            StateValue: 'ALARM',
            StateUpdatedTimestamp: new Date('2026-11-19T09:00:00Z'),
            AlarmRule: 'ALARM(backend-5xx)',
          },
        ],
      }),
    })

    const result = await listAlarms()

    expect(commandsNamed('DescribeAlarms')).toHaveLength(1)
    expect(commandsNamed('DescribeAlarms')[0].input).toEqual({
      StateValue: 'ALARM',
      AlarmNamePrefix: undefined,
      AlarmTypes: ['MetricAlarm', 'CompositeAlarm'],
      MaxRecords: 100,
      NextToken: undefined,
    })
    expect(result).toMatchObject({ state: 'ALARM', count: 2, truncated: false, hiddenAutoscalingAlarms: 1 })
    expect(result.alarms.map(alarm => alarm.name)).toEqual(['prod-degraded', 'backend-5xx'])
    expect(result.alarms[0]).toEqual({
      name: 'prod-degraded',
      type: 'composite',
      state: 'ALARM',
      since: '2026-11-19T09:00:00.000Z',
      reason: null,
      description: null,
      metric: null,
      rule: 'ALARM(backend-5xx)',
    })
    expect(result.alarms[1].metric).toEqual({
      namespace: 'AWS/ApplicationELB',
      name: 'HTTPCode_Target_5XX_Count',
      dimensions: [{ name: 'LoadBalancer', value: 'app/prod/abc' }],
      statistic: 'Sum',
      comparison: 'GreaterThanThreshold',
      threshold: 10,
    })
  })

  it('lists every state with ANY, filters by prefix and follows the pages', async () => {
    useHandlers({
      DescribeAlarms: input => {
        if (!input.NextToken) return { MetricAlarms: [{ AlarmName: 'db-cpu', StateValue: 'OK' }], NextToken: 'page-2' }
        return { MetricAlarms: [{ AlarmName: 'db-disk', StateValue: 'INSUFFICIENT_DATA' }] }
      },
    })

    const result = await listAlarms({ state: 'any', namePrefix: 'db-' })

    const inputs = commandsNamed('DescribeAlarms').map(command => command.input)
    expect(inputs).toHaveLength(2)
    expect(inputs[0]).toMatchObject({ StateValue: undefined, AlarmNamePrefix: 'db-' })
    expect(inputs[1].NextToken).toBe('page-2')
    expect(result.state).toBe('ANY')
    expect(result.alarms.map(alarm => alarm.name).toSorted()).toEqual(['db-cpu', 'db-disk'])
  })

  it('stops after five pages and says the list is truncated', async () => {
    useHandlers({
      DescribeAlarms: () => ({ MetricAlarms: [{ AlarmName: 'noisy', StateValue: 'ALARM' }], NextToken: 'more' }),
    })

    const result = await listAlarms({ state: 'ALARM' })

    expect(commandsNamed('DescribeAlarms')).toHaveLength(5)
    expect(result.truncated).toBe(true)
  })

  it('caps the answer at fifty alarms', async () => {
    const many = Array.from({ length: 60 }, (_, index) => ({ AlarmName: `alarm-${index}`, StateValue: 'ALARM' }))
    useHandlers({ DescribeAlarms: () => ({ MetricAlarms: many }) })

    const result = await listAlarms()

    expect(result.count).toBe(60)
    expect(result.alarms).toHaveLength(50)
    expect(result.truncated).toBe(true)
  })

  it('rejects an unknown state before calling AWS', async () => {
    await expect(listAlarms({ state: 'BROKEN' })).rejects.toThrow(
      'Unknown alarm state "BROKEN". Use one of ALARM, INSUFFICIENT_DATA, OK, ANY.'
    )
    expect(awsSend).not.toHaveBeenCalled()
  })
})

describe('listEcsClusters', () => {
  it('lists the clusters with their service and task counts', async () => {
    useHandlers({
      ListClusters: () => ({ clusterArns: [CLUSTER_ARN] }),
      DescribeClusters: () => ({
        clusters: [
          {
            clusterName: 'prod-cluster',
            status: 'ACTIVE',
            activeServicesCount: 27,
            runningTasksCount: 41,
            pendingTasksCount: 1,
          },
        ],
      }),
    })

    const result = await listEcsClusters()

    expect(commandsNamed('DescribeClusters')[0].input).toEqual({ clusters: [CLUSTER_ARN] })
    expect(result).toEqual({
      clusters: [{ name: 'prod-cluster', status: 'ACTIVE', activeServices: 27, runningTasks: 41, pendingTasks: 1 }],
    })
  })

  it('returns an empty list without describing anything when there is no cluster', async () => {
    useHandlers({ ListClusters: () => ({}) })

    expect(await listEcsClusters()).toEqual({ clusters: [] })
    expect(commandsNamed('DescribeClusters')).toHaveLength(0)
  })
})

describe('listEcsServices', () => {
  it('uses the only cluster, describes services in batches of ten and puts unhealthy ones first', async () => {
    const arns = Array.from({ length: 12 }, (_, index) => `arn:aws:ecs:x:1:service/prod-cluster/svc-${index}`)
    useHandlers({
      ListClusters: () => ({ clusterArns: [CLUSTER_ARN] }),
      ListServices: () => ({ serviceArns: arns }),
      DescribeServices: input => ({
        services: input.services.map(arn => {
          const name = arn.split('/').pop()
          if (name === 'svc-7') return service({ serviceName: name, runningCount: 0 })
          return service({ serviceName: name })
        }),
      }),
    })

    const result = await listEcsServices()

    expect(commandsNamed('ListServices')[0].input).toEqual({
      cluster: 'prod-cluster',
      maxResults: 100,
      nextToken: undefined,
    })
    expect(commandsNamed('DescribeServices').map(command => command.input.services.length)).toEqual([10, 2])
    expect(result).toMatchObject({ cluster: 'prod-cluster', count: 12, unhealthy: 1, truncated: false })
    expect(result.services[0]).toEqual({
      name: 'svc-7',
      status: 'ACTIVE',
      desired: 2,
      running: 0,
      pending: 0,
      healthy: false,
      deploying: false,
      rolloutState: 'COMPLETED',
      taskDefinition: 'prod-backend:412',
      lastDeploymentAt: '2026-11-19T09:00:00.000Z',
    })
    expect(result.services[1].name).toBe('svc-0')
  })

  it('flags a service that is rolling out or whose rollout failed', async () => {
    const rolling = service({
      serviceName: 'rolling',
      deployments: [
        { status: 'PRIMARY', rolloutState: 'IN_PROGRESS', taskDefinition: TASK_DEFINITION },
        { status: 'ACTIVE', rolloutState: 'COMPLETED', taskDefinition: TASK_DEFINITION },
      ],
    })
    const failed = service({
      serviceName: 'failed',
      deployments: [{ status: 'PRIMARY', rolloutState: 'FAILED', taskDefinition: TASK_DEFINITION }],
    })
    useHandlers({
      ListServices: () => ({ serviceArns: ['rolling', 'failed'] }),
      DescribeServices: () => ({ services: [rolling, failed] }),
    })

    const result = await listEcsServices({ cluster: 'prod-cluster' })

    expect(commandsNamed('ListClusters')).toHaveLength(0)
    expect(result.services.map(({ name, healthy, deploying }) => ({ name, healthy, deploying }))).toEqual([
      { name: 'failed', healthy: false, deploying: false },
      { name: 'rolling', healthy: true, deploying: true },
    ])
  })

  it('asks for the cluster when there are several', async () => {
    useHandlers({ ListClusters: () => ({ clusterArns: [CLUSTER_ARN, 'arn:aws:ecs:x:1:cluster/staging'] }) })

    await expect(listEcsServices()).rejects.toThrow(
      'Several ECS clusters exist (prod-cluster, staging): pass the one to look at as "cluster".'
    )
  })

  it('says so when the account has no cluster', async () => {
    useHandlers({ ListClusters: () => ({ clusterArns: [] }) })

    await expect(listEcsServices({ cluster: null })).rejects.toThrow(
      'There are no ECS clusters in this account and region.'
    )
  })
})

describe('getEcsService', () => {
  it('returns deployments, events and the recently stopped tasks, newest first', async () => {
    useHandlers({
      ListClusters: () => ({ clusterArns: [CLUSTER_ARN] }),
      DescribeServices: () => ({ services: [service()] }),
      ListTasks: () => ({
        taskArns: ['arn:aws:ecs:x:1:task/prod-cluster/aaa', 'arn:aws:ecs:x:1:task/prod-cluster/bbb'],
      }),
      DescribeTasks: () => ({
        tasks: [
          {
            taskArn: 'arn:aws:ecs:x:1:task/prod-cluster/aaa',
            taskDefinitionArn: TASK_DEFINITION,
            startedAt: new Date('2026-11-19T08:00:00Z'),
            stoppedAt: new Date('2026-11-19T08:30:00Z'),
            stopCode: 'EssentialContainerExited',
            stoppedReason: 'Essential container in task exited',
            containers: [
              { name: 'app', exitCode: 137, reason: 'OutOfMemoryError: Container killed due to memory usage' },
            ],
          },
          {
            taskArn: 'arn:aws:ecs:x:1:task/prod-cluster/bbb',
            taskDefinitionArn: TASK_DEFINITION,
            stoppedAt: new Date('2026-11-19T08:45:00Z'),
            stoppedReason: 'Scaling activity initiated by deployment',
            containers: [{ name: 'app' }],
          },
        ],
      }),
    })

    const result = await getEcsService({ service: ' prod-backend ' })

    expect(commandsNamed('DescribeServices')[0].input).toEqual({ cluster: 'prod-cluster', services: ['prod-backend'] })
    expect(commandsNamed('ListTasks')[0].input).toEqual({
      cluster: 'prod-cluster',
      serviceName: 'prod-backend',
      desiredStatus: 'STOPPED',
      maxResults: 10,
    })
    expect(result).toMatchObject({
      cluster: 'prod-cluster',
      name: 'prod-backend',
      healthy: true,
      launchType: 'FARGATE',
    })
    expect(result.deployments).toEqual([
      {
        status: 'PRIMARY',
        rolloutState: 'COMPLETED',
        rolloutStateReason: null,
        taskDefinition: 'prod-backend:412',
        desired: 2,
        running: 2,
        pending: 0,
        failedTasks: 0,
        createdAt: '2026-11-19T09:00:00.000Z',
        updatedAt: '2026-11-19T09:06:00.000Z',
      },
    ])
    expect(result.events).toEqual([
      { at: '2026-11-19T09:06:00.000Z', message: '(service prod-backend) has reached a steady state.' },
    ])
    expect(result.recentlyStoppedTasks.map(task => task.id)).toEqual(['bbb', 'aaa'])
    expect(result.recentlyStoppedTasks[1]).toEqual({
      id: 'aaa',
      taskDefinition: 'prod-backend:412',
      startedAt: '2026-11-19T08:00:00.000Z',
      stoppedAt: '2026-11-19T08:30:00.000Z',
      stopCode: 'EssentialContainerExited',
      stoppedReason: 'Essential container in task exited',
      containers: [{ name: 'app', exitCode: 137, reason: 'OutOfMemoryError: Container killed due to memory usage' }],
    })
  })

  it('returns an empty list without describing tasks when none stopped', async () => {
    useHandlers({
      DescribeServices: () => ({ services: [service()] }),
      ListTasks: () => ({ taskArns: [] }),
    })

    const result = await getEcsService({ cluster: 'prod-cluster', service: 'prod-backend' })

    expect(result.recentlyStoppedTasks).toEqual([])
    expect(commandsNamed('DescribeTasks')).toHaveLength(0)
  })

  it('still answers when the stopped tasks cannot be read, and says why', async () => {
    useHandlers({
      DescribeServices: () => ({ services: [service()] }),
      ListTasks: () => {
        throw awsFailure('AccessDeniedException', { status: 400 })
      },
    })

    const result = await getEcsService({ cluster: 'prod-cluster', service: 'prod-backend' })

    expect(result.recentlyStoppedTasks).toBeNull()
    expect(result.stoppedTasksError).toBe(
      'AWS denied ecs:ListTasks. Add it to the IAM policy of the role or user Soporti reads this account with.'
    )
  })

  it('names the failure when something other than AWS breaks while reading stopped tasks', async () => {
    awsSend.mockImplementation(async (_service, command) => {
      if (command.name === 'DescribeServices') return { services: [service()] }
      throw new TypeError('boom')
    })

    const result = await getEcsService({ cluster: 'prod-cluster', service: 'prod-backend' })

    expect(result.stoppedTasksError).toBe('AWS ecs:ListTasks failed (TypeError).')
  })

  it('needs a service name and reports one that does not exist', async () => {
    await expect(getEcsService({ cluster: 'prod-cluster' })).rejects.toThrow('Pass the ECS service name as "service".')

    useHandlers({ DescribeServices: () => ({ services: [], failures: [{ reason: 'MISSING' }] }) })

    await expect(getEcsService({ cluster: 'prod-cluster', service: 'ghost' })).rejects.toThrow(
      'ECS service "ghost" was not found in cluster "prod-cluster".'
    )
  })
})

describe('listMetrics', () => {
  it('lists the recently active namespaces when no namespace is given', async () => {
    useHandlers({
      ListMetrics: input =>
        input.NextToken
          ? { Metrics: [{ Namespace: 'App/Queues' }] }
          : { Metrics: [{ Namespace: 'AWS/ECS' }, { Namespace: 'App/Queues' }], NextToken: 'next' },
    })

    const result = await listMetrics({ namespace: null })

    expect(commandsNamed('ListMetrics')[0].input).toEqual({ RecentlyActive: 'PT3H', NextToken: undefined })
    expect(result).toEqual({ namespaces: ['AWS/ECS', 'App/Queues'], truncated: false })
  })

  it('lists the metrics of a namespace with their dimensions', async () => {
    useHandlers({
      ListMetrics: () => ({
        Metrics: [
          {
            Namespace: 'AWS/ECS',
            MetricName: 'CPUUtilization',
            Dimensions: [
              { Name: 'ClusterName', Value: 'prod-cluster' },
              { Name: 'ServiceName', Value: 'prod-backend' },
            ],
          },
        ],
      }),
    })

    const result = await listMetrics({
      namespace: 'AWS/ECS',
      metricName: 'CPUUtilization',
      dimensions: [{ name: 'ServiceName', value: 'prod-backend' }],
    })

    expect(commandsNamed('ListMetrics')[0].input).toEqual({
      Namespace: 'AWS/ECS',
      MetricName: 'CPUUtilization',
      Dimensions: [{ Name: 'ServiceName', Value: 'prod-backend' }],
      RecentlyActive: 'PT3H',
      NextToken: undefined,
    })
    expect(result).toEqual({
      namespace: 'AWS/ECS',
      count: 1,
      truncated: false,
      metrics: [
        {
          name: 'CPUUtilization',
          dimensions: [
            { name: 'ClusterName', value: 'prod-cluster' },
            { name: 'ServiceName', value: 'prod-backend' },
          ],
        },
      ],
    })
  })

  it('caps the metrics at one hundred', async () => {
    const metrics = Array.from({ length: 120 }, (_, index) => ({ Namespace: 'App', MetricName: `m${index}` }))
    useHandlers({ ListMetrics: () => ({ Metrics: metrics }) })

    const result = await listMetrics({ namespace: 'App' })

    expect(result.count).toBe(120)
    expect(result.metrics).toHaveLength(100)
    expect(result.truncated).toBe(true)
    expect(result.metrics[0]).toEqual({ name: 'm0', dimensions: [] })
  })
})

describe('getMetricData', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-11-19T12:00:00Z') })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads the last three hours by default and summarizes the datapoints', async () => {
    useHandlers({
      GetMetricData: () => ({
        MetricDataResults: [
          {
            Timestamps: [new Date('2026-11-19T10:00:00Z'), new Date('2026-11-19T11:00:00Z')],
            Values: [10, 30],
          },
        ],
      }),
    })

    const result = await getMetricData({
      namespace: 'App/Queues',
      metricName: 'messages_ready',
      dimensions: [{ name: 'Queue', value: 'celery' }],
    })

    expect(commandsNamed('GetMetricData')[0].input).toEqual({
      MetricDataQueries: [
        {
          Id: 'm1',
          MetricStat: {
            Metric: {
              Namespace: 'App/Queues',
              MetricName: 'messages_ready',
              Dimensions: [{ Name: 'Queue', Value: 'celery' }],
            },
            Period: 120,
            Stat: 'Average',
          },
          ReturnData: true,
        },
      ],
      StartTime: new Date('2026-11-19T09:00:00Z'),
      EndTime: new Date('2026-11-19T12:00:00Z'),
      ScanBy: 'TimestampAscending',
      NextToken: undefined,
    })
    expect(result).toEqual({
      namespace: 'App/Queues',
      metricName: 'messages_ready',
      dimensions: [{ name: 'Queue', value: 'celery' }],
      stat: 'Average',
      periodSeconds: 120,
      from: '2026-11-19T09:00:00.000Z',
      to: '2026-11-19T12:00:00.000Z',
      datapoints: [
        { at: '2026-11-19T10:00:00.000Z', value: 10 },
        { at: '2026-11-19T11:00:00.000Z', value: 30 },
      ],
      summary: { min: 10, max: 30, average: 20, latest: { at: '2026-11-19T11:00:00.000Z', value: 30 } },
    })
  })

  it('keeps a requested period, rounded to whole minutes, unless the range needs a wider one', async () => {
    useHandlers({ GetMetricData: () => ({ MetricDataResults: [] }) })

    const narrow = await getMetricData({
      namespace: 'AWS/ECS',
      metricName: 'CPUUtilization',
      stat: 'Maximum',
      from: '2026-11-19T11:00:00Z',
      to: '2026-11-19T12:00:00Z',
      period: 90,
    })
    const wide = await getMetricData({
      namespace: 'AWS/ECS',
      metricName: 'CPUUtilization',
      from: '2026-11-12T12:00:00Z',
      period: 60,
    })

    expect(narrow).toMatchObject({ periodSeconds: 120, stat: 'Maximum', dimensions: [], datapoints: [], summary: null })
    expect(wide.periodSeconds).toBe(5040)
    expect(commandsNamed('GetMetricData')[1].input.MetricDataQueries[0].MetricStat.Period).toBe(5040)
  })

  it('rounds the period to the 300-second steps CloudWatch keeps for data older than 15 days', async () => {
    useHandlers({ GetMetricData: () => ({ MetricDataResults: [] }) })

    const twoMonths = await getMetricData({
      namespace: 'AWS/ECS',
      metricName: 'CPUUtilization',
      from: '2026-09-17T12:00:00Z',
    })
    const twentyDaysAgo = await getMetricData({
      namespace: 'AWS/ECS',
      metricName: 'CPUUtilization',
      from: '2026-10-30T12:00:00Z',
      to: '2026-10-30T13:00:00Z',
      period: 90,
    })

    expect(twoMonths.periodSeconds).toBe(45600)
    expect(twoMonths.periodSeconds % 300).toBe(0)
    expect(twentyDaysAgo.periodSeconds).toBe(300)
  })

  it('rounds the period to whole hours for data older than 63 days', async () => {
    useHandlers({ GetMetricData: () => ({ MetricDataResults: [] }) })

    const result = await getMetricData({
      namespace: 'AWS/ECS',
      metricName: 'CPUUtilization',
      from: '2026-08-01T00:00:00Z',
      to: '2026-08-02T00:00:00Z',
      period: 600,
    })

    expect(result.periodSeconds).toBe(3600)
    expect(commandsNamed('GetMetricData')[0].input.MetricDataQueries[0].MetricStat.Period).toBe(3600)
  })

  it('rejects a missing metric, a bad timestamp and an impossible range before calling AWS', async () => {
    await expect(getMetricData({ namespace: 'AWS/ECS' })).rejects.toThrow(
      'Pass both "namespace" and "metricName" (see aws_list_metrics).'
    )
    await expect(getMetricData({ namespace: 'A', metricName: 'm', from: 'yesterday' })).rejects.toThrow(
      '"from" must be an ISO 8601 timestamp.'
    )
    await expect(
      getMetricData({ namespace: 'A', metricName: 'm', from: '2026-11-19T12:00:00Z', to: '2026-11-19T11:00:00Z' })
    ).rejects.toThrow('"from" must be earlier than "to".')
    await expect(getMetricData({ namespace: 'A', metricName: 'm', from: '2026-01-01T00:00:00Z' })).rejects.toThrow(
      'The time range can span at most 63 days.'
    )
    expect(awsSend).not.toHaveBeenCalled()
  })
})

describe('testConnection', () => {
  const OWN_ARN = 'arn:aws:sts::123456789012:assumed-role/soporti-task/abc'

  it('reports the identity, the region and which read permissions work, even while the switch is off', async () => {
    isAwsConfigured.mockResolvedValue(false)
    useHandlers({
      GetCallerIdentity: () => ({ Account: '123456789012', Arn: OWN_ARN }),
      DescribeAlarms: () => ({ MetricAlarms: [] }),
      ListMetrics: () => ({ Metrics: [] }),
      ListClusters: () => {
        throw awsFailure('AccessDeniedException', { status: 400 })
      },
    })

    const result = await testConnection()

    expect(result).toEqual({
      region: 'env-region-1',
      runsAs: { account: '123456789012', arn: OWN_ARN },
      accounts: [
        {
          name: null,
          account: '123456789012',
          arn: OWN_ARN,
          checks: [
            { id: 'alarms', label: 'CloudWatch alarms', action: 'cloudwatch:DescribeAlarms', ok: true },
            { id: 'metrics', label: 'CloudWatch metrics', action: 'cloudwatch:ListMetrics', ok: true },
            {
              id: 'ecs',
              label: 'ECS clusters',
              action: 'ecs:ListClusters',
              ok: false,
              error:
                'AWS denied ecs:ListClusters. Add it to the IAM policy of the role or user Soporti reads this account with.',
            },
          ],
        },
      ],
    })
    expect(commandsNamed('DescribeAlarms')[0].input).toEqual({ MaxRecords: 1 })
  })

  it('reports a missing identity per account instead of failing as a whole', async () => {
    useHandlers({
      GetCallerIdentity: () => {
        throw awsFailure('CredentialsProviderError')
      },
    })

    const result = await testConnection()

    expect(result.runsAs).toEqual({ error: expect.stringMatching(/No AWS credentials/) })
    expect(result.accounts).toEqual([{ name: null, error: expect.stringMatching(/No AWS credentials/) }])
  })

  it('fails as a whole when no region is set anywhere', async () => {
    environment.region = undefined

    await expect(testConnection()).rejects.toMatchObject({
      code: AWS_REQUEST_FAILED,
      message: expect.stringMatching(/No AWS region is set/),
    })
    expect(awsSend).not.toHaveBeenCalled()
  })

  it('names the failure of a check that broke for another reason', async () => {
    useHandlers({
      GetCallerIdentity: () => ({ Account: '1', Arn: 'arn' }),
      DescribeAlarms: () => ({}),
      ListMetrics: () => {
        throw new Error('plain')
      },
      ListClusters: () => ({}),
    })

    const result = await testConnection()
    const [{ checks }] = result.accounts

    expect(checks.map(check => check.ok)).toEqual([true, false, true])
    expect(checks[1].error).toBe('AWS cloudwatch:ListMetrics failed (Error).')
  })
})
