import { z } from 'zod'
import { tool } from '@openai/agents'
import { CHART_TYPES, reconcileChart } from './chart.js'
import { QueryError, runChartQuery } from './query.js'
import { UnknownDatabaseError, resolveDatabase } from '../postgres/client.js'
import { shortenText } from './text.js'
import { MAX_ANALYTICS_TITLE_LENGTH } from '../constants.js'

const DEFAULT_STEP = 'Working on the chart'
const UNKNOWN_TABLE_STEP = 'Reading the columns of a table'
const STEP_LABELS = {
  list_databases: 'Looking at the databases',
  list_database_schemas: 'Looking at the schemas',
  list_database_tables: 'Listing the tables',
  query_database: 'Trying a query',
  submit_chart: 'Building the chart',
}

const SUBMIT_CHART_PARAMETERS = z.object({
  database: z
    .string()
    .nullable()
    .describe(
      'Name of the database the query runs on, exactly as list_databases lists it. Null when only one database is connected.'
    ),
  title: z.string().describe('Short title of the card in the language of the request, with no trailing period.'),
  sql: z.string().describe('The final query: a single SELECT or WITH ... SELECT statement.'),
  type: z.enum(CHART_TYPES).describe('The chart type.'),
  xKey: z.string().describe('Alias of the category or time column. Empty string for the number and table types.'),
  groupKey: z
    .string()
    .describe(
      'Alias of the dimension column that splits the only series into one series per value (long format). Empty string when there is no breakdown.'
    ),
  series: z
    .array(
      z.object({
        key: z.string().describe('Alias of a numeric column to plot.'),
        label: z.string().describe("Label of the series in plain words, in the user's language."),
      })
    )
    .describe('The numeric columns to plot. Empty list for the table type.'),
  stacked: z.boolean().describe('Stack the series or groups. Only meaningful for bar, row and area.'),
})

async function submitChart(ctx, input) {
  const sql = input.sql.trim()

  let database
  let result
  try {
    database = await resolveDatabase(input.database)
    result = await runChartQuery({ connectionId: database.id, sql })
  } catch (error) {
    if (error instanceof QueryError || error instanceof UnknownDatabaseError) {
      return JSON.stringify({ error: error.message })
    }
    throw error
  }

  const chart = reconcileChart(input, result.columns)
  const rowCount = result.rows.length
  ctx.state.submission = {
    title: shortenText(input.title, MAX_ANALYTICS_TITLE_LENGTH) || ctx.card.title,
    sql,
    chart,
    connectionId: database.id,
  }
  ctx.state.settled = rowCount > 0 && !result.truncated && chart.type === input.type

  return JSON.stringify({
    ok: true,
    database: database.name,
    rowCount,
    truncated: result.truncated,
    columns: result.columns,
    chart,
  })
}

export function buildSubmitChartTool(ctx) {
  return tool({
    name: 'submit_chart',
    description:
      'Submit the final query and the chart of the card. The query is run to validate it: an error comes back as { error } so you can fix the query and submit again. On success it returns { ok, database, rowCount, truncated, columns, chart }, where chart is the chart that was saved, adjusted to the columns the query really returns. The last successful submission is the one that is kept.',
    parameters: SUBMIT_CHART_PARAMETERS,
    execute: input => submitChart(ctx, input),
  })
}

function describeTableStep(rawArguments) {
  try {
    const { table } = JSON.parse(rawArguments || '{}')

    return table ? `Reading the columns of ${table}` : UNKNOWN_TABLE_STEP
  } catch {
    return UNKNOWN_TABLE_STEP
  }
}

export function describeToolStep(name, rawArguments) {
  if (name === 'describe_database_table') return describeTableStep(rawArguments)

  return STEP_LABELS[name] ?? DEFAULT_STEP
}
