import {
  CloudWatchClient,
  DescribeAlarmsCommand,
  GetMetricDataCommand,
  ListMetricsCommand,
} from '@aws-sdk/client-cloudwatch'
import {
  DescribeClustersCommand,
  DescribeServicesCommand,
  DescribeTasksCommand,
  ECSClient,
  ListClustersCommand,
  ListServicesCommand,
  ListTasksCommand,
} from '@aws-sdk/client-ecs'
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts'
import { getAwsAccessKey, getAwsRegion, isAwsConfigured } from './settings.js'

export const AWS_REQUEST_FAILED = 'AWS_REQUEST_FAILED'

const MAX_ATTEMPTS = 3
const ALARM_STATES = ['ALARM', 'INSUFFICIENT_DATA', 'OK']
const ANY_STATE = 'ANY'
const AUTOSCALING_ALARM_PREFIX = 'TargetTracking-'
const ALARM_PAGE_SIZE = 100
const MAX_ALARM_PAGES = 5
const MAX_ALARMS = 50
const CLUSTER_PAGE_SIZE = 100
const SERVICE_PAGE_SIZE = 100
const MAX_SERVICE_PAGES = 5
const DESCRIBE_SERVICES_BATCH = 10
const MAX_SERVICE_EVENTS = 20
const MAX_STOPPED_TASKS = 10
const RECENTLY_ACTIVE = 'PT3H'
const MAX_NAMESPACE_PAGES = 20
const MAX_METRIC_PAGES = 5
const MAX_METRICS = 100
const DEFAULT_METRIC_WINDOW_MS = 3 * 60 * 60 * 1000
const MAX_METRIC_WINDOW_MS = 63 * 24 * 60 * 60 * 1000
const MAX_DATAPOINTS = 120
const MIN_PERIOD_SECONDS = 60
const MAX_METRIC_DATA_PAGES = 5
const DEFAULT_STAT = 'Average'
const ACCESS_DENIED_NAMES = new Set(['AccessDenied', 'AccessDeniedException', 'UnauthorizedOperation'])
const NOT_FOUND_NAMES = new Set(['ClusterNotFoundException', 'ServiceNotFoundException', 'ResourceNotFound'])
const REJECTED_CREDENTIAL_NAMES = new Set([
  'InvalidClientTokenId',
  'SignatureDoesNotMatch',
  'UnrecognizedClientException',
  'ExpiredToken',
  'ExpiredTokenException',
])
const INVALID_INPUT_NAMES = new Set([
  'InvalidParameterValueException',
  'InvalidParameterCombinationException',
  'InvalidParameterException',
  'MissingRequiredParameterException',
  'InvalidNextToken',
])
const HTTP_FORBIDDEN = 403
const REJECTED_CREDENTIALS_MESSAGE =
  'AWS rejected the credentials. Check the access key in /admin → AWS, or the IAM role Soporti runs with.'
const NO_CREDENTIALS_MESSAGE =
  'No AWS credentials were found. Run Soporti with an IAM role (ECS task role, EC2 instance profile) or save an access key in /admin → AWS.'
const NO_REGION_MESSAGE =
  'No AWS region is set. Save one in /admin → AWS, or run Soporti where AWS_REGION is set (ECS and Lambda set it on their own).'
const NOT_ENABLED_MESSAGE = 'AWS is not enabled. Turn it on in /admin → AWS.'
const CONNECTION_CHECKS = [
  { id: 'alarms', label: 'CloudWatch alarms', action: 'cloudwatch:DescribeAlarms' },
  { id: 'metrics', label: 'CloudWatch metrics', action: 'cloudwatch:ListMetrics' },
  { id: 'ecs', label: 'ECS clusters', action: 'ecs:ListClusters' },
]

let cachedClients = null

function awsError(message) {
  const error = new Error(message)
  error.code = AWS_REQUEST_FAILED
  return error
}

function isMissingRegion(err) {
  return /region is missing/i.test(err.message ?? '')
}

function isAccessDenied(err) {
  return ACCESS_DENIED_NAMES.has(err.name) || err.$metadata?.httpStatusCode === HTTP_FORBIDDEN
}

function toAwsError(err, action) {
  if (err.name === 'CredentialsProviderError') return awsError(NO_CREDENTIALS_MESSAGE)
  if (isMissingRegion(err)) return awsError(NO_REGION_MESSAGE)
  if (REJECTED_CREDENTIAL_NAMES.has(err.name)) return awsError(REJECTED_CREDENTIALS_MESSAGE)
  if (isAccessDenied(err)) {
    return awsError(`AWS denied ${action}. Add it to the IAM policy of the role or user Soporti runs with.`)
  }
  if (NOT_FOUND_NAMES.has(err.name)) return awsError(err.message)
  if (INVALID_INPUT_NAMES.has(err.name)) return awsError(`AWS ${action} rejected the request: ${err.message}`)

  return awsError(`AWS ${action} failed (${err.name}).`)
}

async function resolveClientConfig() {
  const [region, accessKey] = await Promise.all([getAwsRegion(), getAwsAccessKey()])

  return {
    region: region ?? undefined,
    credentials: accessKey ?? undefined,
    maxAttempts: MAX_ATTEMPTS,
  }
}

function clientSignature({ region, credentials }) {
  return JSON.stringify([region ?? null, credentials?.accessKeyId ?? null, credentials?.secretAccessKey ?? null])
}

async function getClients() {
  const clientConfig = await resolveClientConfig()
  const signature = clientSignature(clientConfig)
  if (cachedClients?.signature === signature) return cachedClients

  cachedClients = {
    signature,
    cloudwatch: new CloudWatchClient(clientConfig),
    ecs: new ECSClient(clientConfig),
    sts: new STSClient(clientConfig),
  }
  return cachedClients
}

async function send(service, command, action) {
  const clients = await getClients()

  try {
    return await clients[service].send(command)
  } catch (err) {
    throw toAwsError(err, action)
  }
}

async function collectPages(fetchPage, { maxPages }) {
  const items = []
  let nextToken
  let pages = 0

  do {
    const page = await fetchPage(nextToken)
    items.push(...page.items)
    nextToken = page.nextToken
    pages += 1
  } while (nextToken && pages < maxPages)

  return { items, truncated: Boolean(nextToken) }
}

function chunk(list, size) {
  const chunks = []
  for (let index = 0; index < list.length; index += size) chunks.push(list.slice(index, index + size))
  return chunks
}

function lastSegment(arn) {
  return String(arn ?? '')
    .split('/')
    .pop()
}

function shortTaskDefinition(arn) {
  return arn ? lastSegment(arn) : null
}

function toIso(date) {
  return date ? new Date(date).toISOString() : null
}

function fromAwsDimensions(dimensions) {
  return (dimensions ?? []).map(dimension => ({ name: dimension.Name, value: dimension.Value }))
}

function toAwsDimensions(dimensions) {
  return (dimensions ?? []).map(dimension => ({ Name: dimension.name, Value: dimension.value }))
}

export async function isConfigured() {
  return isAwsConfigured()
}

async function assertEnabled() {
  if (!(await isAwsConfigured())) throw awsError(NOT_ENABLED_MESSAGE)
}

function resolveAlarmState(state) {
  const normalized = String(state ?? 'ALARM').toUpperCase()
  if (normalized === ANY_STATE) return null
  if (ALARM_STATES.includes(normalized)) return normalized

  throw awsError(`Unknown alarm state "${state}". Use one of ${[...ALARM_STATES, ANY_STATE].join(', ')}.`)
}

function describeAlarmMetric(alarm) {
  if (!alarm.MetricName) return null

  return {
    namespace: alarm.Namespace,
    name: alarm.MetricName,
    dimensions: fromAwsDimensions(alarm.Dimensions),
    statistic: alarm.Statistic ?? alarm.ExtendedStatistic ?? null,
    comparison: alarm.ComparisonOperator ?? null,
    threshold: alarm.Threshold ?? null,
  }
}

function describeAlarm(alarm, type) {
  return {
    name: alarm.AlarmName,
    type,
    state: alarm.StateValue,
    since: toIso(alarm.StateUpdatedTimestamp),
    reason: alarm.StateReason ?? null,
    description: alarm.AlarmDescription ?? null,
    metric: describeAlarmMetric(alarm),
    rule: alarm.AlarmRule ?? null,
  }
}

async function fetchAlarmPage({ stateValue, namePrefix }, nextToken) {
  const response = await send(
    'cloudwatch',
    new DescribeAlarmsCommand({
      StateValue: stateValue ?? undefined,
      AlarmNamePrefix: namePrefix || undefined,
      AlarmTypes: ['MetricAlarm', 'CompositeAlarm'],
      MaxRecords: ALARM_PAGE_SIZE,
      NextToken: nextToken,
    }),
    'cloudwatch:DescribeAlarms'
  )
  const metricAlarms = (response.MetricAlarms ?? []).map(alarm => describeAlarm(alarm, 'metric'))
  const compositeAlarms = (response.CompositeAlarms ?? []).map(alarm => describeAlarm(alarm, 'composite'))

  return { items: [...metricAlarms, ...compositeAlarms], nextToken: response.NextToken }
}

export async function listAlarms({ state, namePrefix } = {}) {
  await assertEnabled()

  const stateValue = resolveAlarmState(state)
  const { items, truncated } = await collectPages(nextToken => fetchAlarmPage({ stateValue, namePrefix }, nextToken), {
    maxPages: MAX_ALARM_PAGES,
  })
  const alarms = items.filter(alarm => !alarm.name.startsWith(AUTOSCALING_ALARM_PREFIX))
  const newestFirst = alarms.toSorted((a, b) => String(b.since).localeCompare(String(a.since)))

  return {
    state: stateValue ?? ANY_STATE,
    count: alarms.length,
    truncated: truncated || alarms.length > MAX_ALARMS,
    hiddenAutoscalingAlarms: items.length - alarms.length,
    alarms: newestFirst.slice(0, MAX_ALARMS),
  }
}

async function listClusterArns() {
  const response = await send('ecs', new ListClustersCommand({ maxResults: CLUSTER_PAGE_SIZE }), 'ecs:ListClusters')

  return response.clusterArns ?? []
}

function describeCluster(cluster) {
  return {
    name: cluster.clusterName,
    status: cluster.status,
    activeServices: cluster.activeServicesCount ?? 0,
    runningTasks: cluster.runningTasksCount ?? 0,
    pendingTasks: cluster.pendingTasksCount ?? 0,
  }
}

export async function listEcsClusters() {
  await assertEnabled()

  const arns = await listClusterArns()
  if (arns.length === 0) return { clusters: [] }

  const response = await send('ecs', new DescribeClustersCommand({ clusters: arns }), 'ecs:DescribeClusters')

  return { clusters: (response.clusters ?? []).map(describeCluster) }
}

async function resolveCluster(cluster) {
  const requested = typeof cluster === 'string' ? cluster.trim() : ''
  if (requested) return requested

  const names = (await listClusterArns()).map(lastSegment)
  if (names.length === 1) return names[0]
  if (names.length === 0) throw awsError('There are no ECS clusters in this account and region.')

  throw awsError(`Several ECS clusters exist (${names.join(', ')}): pass the one to look at as "cluster".`)
}

function primaryDeployment(service) {
  return (service.deployments ?? []).find(deployment => deployment.status === 'PRIMARY') ?? null
}

function isServiceHealthy(service, primary) {
  const desired = service.desiredCount ?? 0
  const running = service.runningCount ?? 0

  return running >= desired && (service.pendingCount ?? 0) === 0 && primary?.rolloutState !== 'FAILED'
}

function summarizeService(service) {
  const primary = primaryDeployment(service)

  return {
    name: service.serviceName,
    status: service.status,
    desired: service.desiredCount ?? 0,
    running: service.runningCount ?? 0,
    pending: service.pendingCount ?? 0,
    healthy: isServiceHealthy(service, primary),
    deploying: (service.deployments ?? []).length > 1 || primary?.rolloutState === 'IN_PROGRESS',
    rolloutState: primary?.rolloutState ?? null,
    taskDefinition: shortTaskDefinition(primary?.taskDefinition ?? service.taskDefinition),
    lastDeploymentAt: toIso(primary?.createdAt),
  }
}

async function describeServices(cluster, names) {
  const batches = await Promise.all(
    chunk(names, DESCRIBE_SERVICES_BATCH).map(batch =>
      send('ecs', new DescribeServicesCommand({ cluster, services: batch }), 'ecs:DescribeServices')
    )
  )
  return batches.flatMap(response => response.services ?? [])
}

export async function listEcsServices({ cluster } = {}) {
  await assertEnabled()

  const clusterName = await resolveCluster(cluster)
  const { items: arns, truncated } = await collectPages(
    async nextToken => {
      const response = await send(
        'ecs',
        new ListServicesCommand({ cluster: clusterName, maxResults: SERVICE_PAGE_SIZE, nextToken }),
        'ecs:ListServices'
      )
      return { items: response.serviceArns ?? [], nextToken: response.nextToken }
    },
    { maxPages: MAX_SERVICE_PAGES }
  )
  const services = (await describeServices(clusterName, arns)).map(summarizeService)
  const unhealthyFirst = services.toSorted((a, b) => a.healthy - b.healthy || a.name.localeCompare(b.name))

  return {
    cluster: clusterName,
    count: services.length,
    unhealthy: services.filter(service => !service.healthy).length,
    truncated,
    services: unhealthyFirst,
  }
}

function describeDeployment(deployment) {
  return {
    status: deployment.status,
    rolloutState: deployment.rolloutState ?? null,
    rolloutStateReason: deployment.rolloutStateReason ?? null,
    taskDefinition: shortTaskDefinition(deployment.taskDefinition),
    desired: deployment.desiredCount ?? 0,
    running: deployment.runningCount ?? 0,
    pending: deployment.pendingCount ?? 0,
    failedTasks: deployment.failedTasks ?? 0,
    createdAt: toIso(deployment.createdAt),
    updatedAt: toIso(deployment.updatedAt),
  }
}

function describeStoppedTask(task) {
  return {
    id: lastSegment(task.taskArn),
    taskDefinition: shortTaskDefinition(task.taskDefinitionArn),
    startedAt: toIso(task.startedAt),
    stoppedAt: toIso(task.stoppedAt),
    stopCode: task.stopCode ?? null,
    stoppedReason: task.stoppedReason ?? null,
    containers: (task.containers ?? []).map(container => ({
      name: container.name,
      exitCode: container.exitCode ?? null,
      reason: container.reason ?? null,
    })),
  }
}

async function listStoppedTasks(cluster, serviceName) {
  const listed = await send(
    'ecs',
    new ListTasksCommand({ cluster, serviceName, desiredStatus: 'STOPPED', maxResults: MAX_STOPPED_TASKS }),
    'ecs:ListTasks'
  )
  const taskArns = listed.taskArns ?? []
  if (taskArns.length === 0) return []

  const described = await send('ecs', new DescribeTasksCommand({ cluster, tasks: taskArns }), 'ecs:DescribeTasks')

  return (described.tasks ?? [])
    .map(describeStoppedTask)
    .toSorted((a, b) => String(b.stoppedAt).localeCompare(String(a.stoppedAt)))
}

async function readStoppedTasks(cluster, serviceName) {
  try {
    return { recentlyStoppedTasks: await listStoppedTasks(cluster, serviceName) }
  } catch (err) {
    return { recentlyStoppedTasks: null, stoppedTasksError: err.message }
  }
}

export async function getEcsService({ cluster, service } = {}) {
  await assertEnabled()

  const serviceName = typeof service === 'string' ? service.trim() : ''
  if (!serviceName) throw awsError('Pass the ECS service name as "service".')

  const clusterName = await resolveCluster(cluster)
  const [found] = await describeServices(clusterName, [serviceName])
  if (!found) throw awsError(`ECS service "${serviceName}" was not found in cluster "${clusterName}".`)

  const stopped = await readStoppedTasks(clusterName, found.serviceName)

  return {
    cluster: clusterName,
    ...summarizeService(found),
    launchType: found.launchType ?? null,
    deployments: (found.deployments ?? []).map(describeDeployment),
    events: (found.events ?? []).slice(0, MAX_SERVICE_EVENTS).map(event => ({
      at: toIso(event.createdAt),
      message: event.message,
    })),
    ...stopped,
  }
}

async function fetchMetricsPage(input, nextToken) {
  const response = await send(
    'cloudwatch',
    new ListMetricsCommand({ ...input, RecentlyActive: RECENTLY_ACTIVE, NextToken: nextToken }),
    'cloudwatch:ListMetrics'
  )
  return { items: response.Metrics ?? [], nextToken: response.NextToken }
}

async function listNamespaces() {
  const { items, truncated } = await collectPages(nextToken => fetchMetricsPage({}, nextToken), {
    maxPages: MAX_NAMESPACE_PAGES,
  })
  const namespaces = [...new Set(items.map(metric => metric.Namespace))].toSorted()

  return { namespaces, truncated }
}

export async function listMetrics({ namespace, metricName, dimensions } = {}) {
  await assertEnabled()

  if (!namespace) return listNamespaces()

  const input = {
    Namespace: namespace,
    MetricName: metricName || undefined,
    Dimensions: dimensions ? toAwsDimensions(dimensions) : undefined,
  }
  const { items, truncated } = await collectPages(nextToken => fetchMetricsPage(input, nextToken), {
    maxPages: MAX_METRIC_PAGES,
  })

  return {
    namespace,
    count: items.length,
    truncated: truncated || items.length > MAX_METRICS,
    metrics: items.slice(0, MAX_METRICS).map(metric => ({
      name: metric.MetricName,
      dimensions: fromAwsDimensions(metric.Dimensions),
    })),
  }
}

function parseInstant(value, fallback, field) {
  if (value === undefined || value === null || value === '') return fallback

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw awsError(`"${field}" must be an ISO 8601 timestamp.`)

  return parsed
}

function resolveMetricWindow(from, to) {
  const end = parseInstant(to, new Date(), 'to')
  const start = parseInstant(from, new Date(end.getTime() - DEFAULT_METRIC_WINDOW_MS), 'from')

  if (start >= end) throw awsError('"from" must be earlier than "to".')
  if (end - start > MAX_METRIC_WINDOW_MS) throw awsError('The time range can span at most 63 days.')

  return { start, end }
}

function roundUpToMinute(seconds) {
  return Math.max(MIN_PERIOD_SECONDS, Math.ceil(seconds / MIN_PERIOD_SECONDS) * MIN_PERIOD_SECONDS)
}

function resolvePeriod(period, { start, end }) {
  const smallestPeriod = roundUpToMinute((end - start) / 1000 / MAX_DATAPOINTS)
  const requested = Number(period)
  if (!Number.isFinite(requested) || requested <= 0) return smallestPeriod

  return Math.max(roundUpToMinute(requested), smallestPeriod)
}

function summarizeDatapoints(datapoints) {
  if (datapoints.length === 0) return null

  const values = datapoints.map(point => point.value)
  const total = values.reduce((sum, value) => sum + value, 0)

  return {
    min: Math.min(...values),
    max: Math.max(...values),
    average: total / values.length,
    latest: datapoints.at(-1),
  }
}

function toDatapoints(results) {
  return results.flatMap(result =>
    (result.Timestamps ?? []).map((timestamp, index) => ({ at: toIso(timestamp), value: result.Values[index] }))
  )
}

export async function getMetricData({ namespace, metricName, dimensions, stat, from, to, period } = {}) {
  await assertEnabled()

  if (!namespace || !metricName) throw awsError('Pass both "namespace" and "metricName" (see aws_list_metrics).')

  const window = resolveMetricWindow(from, to)
  const periodSeconds = resolvePeriod(period, window)
  const statistic = stat || DEFAULT_STAT
  const query = {
    Id: 'm1',
    MetricStat: {
      Metric: { Namespace: namespace, MetricName: metricName, Dimensions: toAwsDimensions(dimensions) },
      Period: periodSeconds,
      Stat: statistic,
    },
    ReturnData: true,
  }
  const { items } = await collectPages(
    async nextToken => {
      const response = await send(
        'cloudwatch',
        new GetMetricDataCommand({
          MetricDataQueries: [query],
          StartTime: window.start,
          EndTime: window.end,
          ScanBy: 'TimestampAscending',
          NextToken: nextToken,
        }),
        'cloudwatch:GetMetricData'
      )
      return { items: response.MetricDataResults ?? [], nextToken: response.NextToken }
    },
    { maxPages: MAX_METRIC_DATA_PAGES }
  )
  const datapoints = toDatapoints(items)

  return {
    namespace,
    metricName,
    dimensions: dimensions ?? [],
    stat: statistic,
    periodSeconds,
    from: window.start.toISOString(),
    to: window.end.toISOString(),
    datapoints,
    summary: summarizeDatapoints(datapoints),
  }
}

const CHECK_COMMANDS = {
  alarms: () => ['cloudwatch', new DescribeAlarmsCommand({ MaxRecords: 1 })],
  metrics: () => ['cloudwatch', new ListMetricsCommand({ RecentlyActive: RECENTLY_ACTIVE })],
  ecs: () => ['ecs', new ListClustersCommand({ maxResults: 1 })],
}

async function runCheck({ id, label, action }) {
  const [service, command] = CHECK_COMMANDS[id]()

  try {
    await send(service, command, action)
    return { id, label, action, ok: true }
  } catch (err) {
    return { id, label, action, ok: false, error: err.message }
  }
}

export async function testConnection() {
  const identity = await send('sts', new GetCallerIdentityCommand({}), 'sts:GetCallerIdentity')
  const clients = await getClients()
  const region = await clients.sts.config.region()
  const checks = await Promise.all(CONNECTION_CHECKS.map(runCheck))

  return { account: identity.Account, arn: identity.Arn, region, checks }
}

export function _resetAwsClientsForTests() {
  cachedClients = null
}
