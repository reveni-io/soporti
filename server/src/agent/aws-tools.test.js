import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RunContext } from '@openai/agents'

const listAlarms = vi.fn()
const listEcsClusters = vi.fn()
const listEcsServices = vi.fn()
const getEcsService = vi.fn()
const listMetrics = vi.fn()
const getMetricData = vi.fn()
vi.mock('../aws/client.js', () => ({
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
  listAwsAlarmsTool,
  listAwsEcsClustersTool,
  listAwsEcsServicesTool,
  listAwsMetricsTool,
} = await import('./aws-tools.js')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AWS_TOOLS', () => {
  it('registers the six read-only AWS tools', () => {
    expect(AWS_TOOLS.map(candidate => candidate.name)).toEqual([
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
      input: { state: 'ALARM', namePrefix: null },
      expected: { state: 'ALARM' },
    },
    {
      name: 'aws_list_ecs_services',
      tool: listAwsEcsServicesTool,
      clientFunction: listEcsServices,
      input: { cluster: 'prod-cluster' },
      expected: { cluster: 'prod-cluster' },
    },
    {
      name: 'aws_get_ecs_service',
      tool: getAwsEcsServiceTool,
      clientFunction: getEcsService,
      input: { service: 'prod-backend', cluster: null },
      expected: { service: 'prod-backend' },
    },
    {
      name: 'aws_list_metrics',
      tool: listAwsMetricsTool,
      clientFunction: listMetrics,
      input: { namespace: 'AWS/ECS', metricName: null, dimensions: null },
      expected: { namespace: 'AWS/ECS' },
    },
    {
      name: 'aws_get_metric_data',
      tool: getAwsMetricDataTool,
      clientFunction: getMetricData,
      input: {
        namespace: 'AWS/ECS',
        metricName: 'CPUUtilization',
        dimensions: [{ name: 'ServiceName', value: 'prod-backend' }],
        stat: 'Maximum',
        from: '2026-11-19T09:00:00Z',
        to: null,
        period: null,
      },
      expected: {
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

  it('lists the clusters without input', async () => {
    listEcsClusters.mockResolvedValue({ clusters: [{ name: 'prod-cluster' }] })

    const result = await listAwsEcsClustersTool.invoke(new RunContext(), '{}')

    expect(JSON.parse(result)).toEqual({ clusters: [{ name: 'prod-cluster' }] })
    expect(listEcsClusters).toHaveBeenCalledTimes(1)
  })
})
