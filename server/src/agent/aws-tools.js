import { z } from 'zod'
import { tool } from '@openai/agents'
import * as aws from '../aws/client.js'

const ACCOUNT_PARAM = z
  .string()
  .optional()
  .describe(
    'Name of the AWS account to read, exactly as aws_list_accounts lists it. Leave it out when no account or a single one is configured.'
  )

const CLUSTER_PARAM = z
  .string()
  .optional()
  .describe('ECS cluster name. Leave it out when the account has a single cluster.')

const DIMENSIONS_PARAM = z
  .array(z.object({ name: z.string(), value: z.string() }))
  .optional()
  .describe(
    'Metric dimensions exactly as aws_list_metrics returns them, e.g. [{"name": "ServiceName", "value": "api"}].'
  )

export const listAwsAccountsTool = tool({
  name: 'aws_list_accounts',
  description:
    'List the names of the AWS accounts Soporti can read (for example one per environment). Every other AWS tool takes one of these names as `account`. An empty list means there is a single account — the one Soporti runs against — and `account` must be left out.',
  parameters: z.object({}),
  execute: async () => JSON.stringify(await aws.listAccounts()),
})

export const listAwsAlarmsTool = tool({
  name: 'aws_list_alarms',
  description:
    'List the CloudWatch alarms of an AWS account, newest state change first. By default only the alarms firing right now (state ALARM). Autoscaling alarms (TargetTracking-*) are left out because firing is their normal job: they only tell the cluster to scale. Each alarm has its state reason, description and the metric and threshold it watches.',
  parameters: z.object({
    account: ACCOUNT_PARAM,
    state: z
      .enum(['ALARM', 'INSUFFICIENT_DATA', 'OK', 'ANY'])
      .optional()
      .describe('Alarm state to list. Defaults to ALARM (firing now). ANY lists every alarm.'),
    namePrefix: z.string().optional().describe('Only alarms whose name starts with this prefix.'),
  }),
  execute: async input => JSON.stringify(await aws.listAlarms(input)),
})

export const listAwsEcsClustersTool = tool({
  name: 'aws_list_ecs_clusters',
  description:
    'List the ECS clusters of an AWS account with how many services are active and how many tasks are running or pending in each.',
  parameters: z.object({ account: ACCOUNT_PARAM }),
  execute: async input => JSON.stringify(await aws.listEcsClusters(input)),
})

export const listAwsEcsServicesTool = tool({
  name: 'aws_list_ecs_services',
  description:
    'List the services of an ECS cluster with their health, unhealthy ones first: desired, running and pending tasks, whether a deployment is in progress, the task definition revision they run and when the current deployment started. Use it to answer "is anything down?" or "what was deployed today?".',
  parameters: z.object({ account: ACCOUNT_PARAM, cluster: CLUSTER_PARAM }),
  execute: async input => JSON.stringify(await aws.listEcsServices(input)),
})

export const getAwsEcsServiceTool = tool({
  name: 'aws_get_ecs_service',
  description:
    'Get one ECS service in detail: its deployments with their rollout state, its latest events (failed health checks, tasks that could not be placed, steady state reached) and the tasks that stopped recently with the reason and the exit code of each container (out of memory, essential container exited, failed health check). ECS only keeps stopped tasks for about an hour.',
  parameters: z.object({
    account: ACCOUNT_PARAM,
    service: z.string().describe('ECS service name, as aws_list_ecs_services returns it.'),
    cluster: CLUSTER_PARAM,
  }),
  execute: async input => JSON.stringify(await aws.getEcsService(input)),
})

export const listAwsMetricsTool = tool({
  name: 'aws_list_metrics',
  description:
    "Discover CloudWatch metrics that received data in the last 3 hours. Without a namespace it lists the namespaces: the AWS ones (AWS/ECS, AWS/RDS, AWS/ApplicationELB…) and the custom ones the team publishes. With a namespace it lists that namespace's metrics and the dimensions of each, which aws_get_metric_data needs verbatim.",
  parameters: z.object({
    account: ACCOUNT_PARAM,
    namespace: z.string().optional().describe('Namespace to list the metrics of. Leave it out to list namespaces.'),
    metricName: z.string().optional().describe('Only this metric of the namespace.'),
    dimensions: DIMENSIONS_PARAM,
  }),
  execute: async input => JSON.stringify(await aws.listMetrics(input)),
})

export const getAwsMetricDataTool = tool({
  name: 'aws_get_metric_data',
  description:
    'Read the values of one CloudWatch metric over a time range, oldest first, with its min, max, average and latest value. The range defaults to the last 3 hours and can span up to 63 days; the period is widened on its own so the answer stays under about 120 datapoints.',
  parameters: z.object({
    account: ACCOUNT_PARAM,
    namespace: z.string().describe('Metric namespace, e.g. "AWS/ECS".'),
    metricName: z.string().describe('Metric name, e.g. "CPUUtilization".'),
    dimensions: DIMENSIONS_PARAM,
    stat: z
      .string()
      .optional()
      .describe('Statistic: Average (default), Sum, Minimum, Maximum, SampleCount or a percentile like p99.'),
    from: z
      .string()
      .optional()
      .describe('Start of the range as an ISO 8601 timestamp. Defaults to 3 hours before "to".'),
    to: z.string().optional().describe('End of the range as an ISO 8601 timestamp. Defaults to now.'),
    period: z
      .number()
      .optional()
      .describe(
        'Seconds per datapoint. Picked automatically when left out, and always rounded up to what CloudWatch keeps for the range: 60-second steps, 300 for data older than 15 days, 3600 for data older than 63 days.'
      ),
  }),
  execute: async input => JSON.stringify(await aws.getMetricData(input)),
})

export const AWS_TOOLS = [
  listAwsAccountsTool,
  listAwsAlarmsTool,
  listAwsEcsClustersTool,
  listAwsEcsServicesTool,
  getAwsEcsServiceTool,
  listAwsMetricsTool,
  getAwsMetricDataTool,
]
