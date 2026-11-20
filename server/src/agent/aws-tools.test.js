import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RunContext } from '@openai/agents'

const listAccounts = vi.fn()
const listAlarms = vi.fn()
const listEcsClusters = vi.fn()
const listEcsServices = vi.fn()
const getEcsService = vi.fn()
const listMetrics = vi.fn()
const getMetricData = vi.fn()
vi.mock('../aws/client.js', () => ({
  listAccounts,
  listAlarms,
  listEcsClusters,
  listEcsServices,
  getEcsService,
  listMetrics,
  getMetricData,
}))

const {
  AWS_TOOLS,
  getAwsEcsServiceTool,
  getAwsMetricDataTool,
  listAwsAccountsTool,
  listAwsAlarmsTool,
  listAwsEcsClustersTool,
  listAwsEcsServicesTool,
  listAwsMetricsTool,
} = await import('./aws-tools.js')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AWS_TOOLS', () => {
  it('registers the seven read-only AWS tools', () => {
    expect(AWS_TOOLS.map(candidate => candidate.name)).toEqual([
      'aws_list_accounts',
      'aws_list_alarms',
      'aws_list_ecs_clusters',
      'aws_list_ecs_services',
      'aws_get_ecs_service',
      'aws_list_metrics',
      'aws_get_metric_data',
    ])
  })

  it('describes dimensions as a strict list of name and value pairs', () => {
    const dimensions = getAwsMetricDataTool.parameters.properties.dimensions.anyOf[0]

    expect(dimensions.type).toBe('array')
    expect(dimensions.items).toMatchObject({ required: ['name', 'value'], additionalProperties: false })
  })
})

describe('AWS tool execution', () => {
  it.each([
    {
      name: 'aws_list_alarms',
      tool: listAwsAlarmsTool,
      clientFunction: listAlarms,
      input: { account: 'dev', state: 'ALARM', namePrefix: null },
      expected: { account: 'dev', state: 'ALARM' },
    },
    {
      name: 'aws_list_ecs_services',
      tool: listAwsEcsServicesTool,
      clientFunction: listEcsServices,
      input: { account: null, cluster: 'prod-cluster' },
      expected: { cluster: 'prod-cluster' },
    },
    {
      name: 'aws_get_ecs_service',
      tool: getAwsEcsServiceTool,
      clientFunction: getEcsService,
      input: { account: null, service: 'prod-backend', cluster: null },
      expected: { service: 'prod-backend' },
    },
    {
      name: 'aws_list_metrics',
      tool: listAwsMetricsTool,
      clientFunction: listMetrics,
      input: { account: null, namespace: 'AWS/ECS', metricName: null, dimensions: null },
      expected: { namespace: 'AWS/ECS' },
    },
    {
      name: 'aws_get_metric_data',
      tool: getAwsMetricDataTool,
      clientFunction: getMetricData,
      input: {
        account: 'prod',
        namespace: 'AWS/ECS',
        metricName: 'CPUUtilization',
        dimensions: [{ name: 'ServiceName', value: 'prod-backend' }],
        stat: 'Maximum',
        from: '2026-11-19T09:00:00Z',
        to: null,
        period: null,
      },
      expected: {
        account: 'prod',
        namespace: 'AWS/ECS',
        metricName: 'CPUUtilization',
        dimensions: [{ name: 'ServiceName', value: 'prod-backend' }],
        stat: 'Maximum',
        from: '2026-11-19T09:00:00Z',
      },
    },
  ])(
    '$name forwards its input without the nulls and returns JSON',
    async ({ name, tool, clientFunction, input, expected }) => {
      clientFunction.mockResolvedValue({ answered: name })

      const result = await tool.invoke(new RunContext(), JSON.stringify(input))

      expect(JSON.parse(result)).toEqual({ answered: name })
      expect(clientFunction).toHaveBeenCalledTimes(1)
      expect(clientFunction).toHaveBeenCalledWith(expected)
    }
  )

  it('lists the clusters of the account it is given', async () => {
    listEcsClusters.mockResolvedValue({ account: 'dev', clusters: [{ name: 'dev-cluster' }] })

    const result = await listAwsEcsClustersTool.invoke(new RunContext(), JSON.stringify({ account: 'dev' }))

    expect(JSON.parse(result)).toEqual({ account: 'dev', clusters: [{ name: 'dev-cluster' }] })
    expect(listEcsClusters).toHaveBeenCalledTimes(1)
    expect(listEcsClusters).toHaveBeenCalledWith({ account: 'dev' })
  })

  it('lists the configured accounts without input', async () => {
    listAccounts.mockResolvedValue({ accounts: [{ name: 'prod' }] })

    const result = await listAwsAccountsTool.invoke(new RunContext(), '{}')

    expect(JSON.parse(result)).toEqual({ accounts: [{ name: 'prod' }] })
    expect(listAccounts).toHaveBeenCalledTimes(1)
  })
})
