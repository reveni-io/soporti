// Auto-diagnose poller (issue #56). Soporti polls a Slack List of support
// tickets every N seconds; for each item whose "Diagnosis" column
// is still empty, it reads the ticket (and any screenshots), runs an autonomous
// diagnosis, and writes the result back into that column.
//
// Why polling: Slack list item creation is not delivered to a bot over Socket
// Mode, and there is no public API to write a list-item comment — but a bot
// token can both read items (`slackLists.items.list`) and write a cell
// (`slackLists.items.update`). The diagnosis column itself is the dedup marker:
// "empty = not yet diagnosed", which is durable across restarts (Slack does not
// re-deliver anything, so an in-memory marker would lose tickets on deploy).

import config from '../config.js'
import {
  fetchList,
  fetchSchema,
  updateItemField,
  getRowId,
  fieldMap,
  toTicket,
  resolveColumnId,
  isArchived,
  getCreatedMs,
  parseListTimestamp,
} from './lists-client.js'
import { collectTicketImages } from './attachments.js'
import { diagnoseTicket } from './auto-diagnose.js'
import { getSlackBotToken } from './settings.js'

function log(icon, ...args) {
  const timestamp = new Date().toISOString().slice(11, 23)
  console.log(`[${timestamp}] [auto-diagnose] ${icon}`, ...args)
}

let intervalHandle = null
// Guards a ticket already being diagnosed from being picked up again by an
// overlapping poll tick (a diagnosis can outlast one poll interval).
const inFlight = new Set()

async function diagnoseAndWrite(client, { item, rowId, columns, diagnosisColumnId }) {
  const ticket = toTicket(item, { columns })
  // The bot token lives in the database (admin panel → Slack section); needed
  // to download url_private attachments.
  const botToken = await getSlackBotToken()
  const images = await collectTicketImages(item, {
    client,
    botToken,
    maxBytes: config.autoDiagnose.maxAttachmentBytes,
  }).catch(() => [])

  log('🩺', `Diagnosing row ${rowId} — "${(ticket.title || '').slice(0, 80)}" (${images.length} image(s))`)
  const diagnosis = await diagnoseTicket(ticket, { images })
  await updateItemField(client, {
    listId: config.autoDiagnose.listId,
    rowId,
    columnId: diagnosisColumnId,
    text: diagnosis,
  })
  log('✅', `Wrote diagnosis to row ${rowId}`)
}

// One poll pass. Exported for tests (drives the loop without timers). Never
// throws: a per-item failure is logged and the loop moves on.
export async function runPollOnce(client) {
  const { listId, columnId, columnName, maxItemsPerPoll, skipArchived, skipBefore } = config.autoDiagnose
  // Items and the column schema come from two different endpoints (items.list
  // has no schema; the schema lives in files.info — see fetchSchema).
  const [{ items }, columns] = await Promise.all([fetchList(client, { listId }), fetchSchema(client, { listId })])

  const diagnosisColumnId = resolveColumnId(columns, { columnId, columnName })
  if (!diagnosisColumnId) {
    log(
      '⛔',
      `Could not resolve the "${columnName}" column on list ${listId}. ` +
        'Set SLACK_AUTODIAGNOSE_COLUMN_ID, or add a column with that name. Skipping this poll.'
    )
    return { processed: 0 }
  }

  // Cutoff that keeps the historical backlog from being diagnosed on first
  // activation (see config.autoDiagnose.skipBefore). Fail safe: a set-but-
  // unparseable cutoff skips the whole poll rather than silently disabling
  // itself and diagnosing the backlog the operator was trying to exclude.
  let skipBeforeMs = null
  if (skipBefore) {
    skipBeforeMs = parseListTimestamp(skipBefore)
    if (skipBeforeMs == null) {
      log(
        '⛔',
        `SLACK_AUTODIAGNOSE_SKIP_BEFORE="${skipBefore}" is not a valid date; ` +
          'skipping this poll to avoid diagnosing the backlog. Fix the value (ISO date or epoch).'
      )
      return { processed: 0 }
    }
  }

  let processed = 0
  let unparsedDates = 0
  for (const item of items) {
    if (processed >= maxItemsPerPoll) break
    const rowId = getRowId(item)
    if (!rowId) continue
    if (skipArchived && isArchived(item)) continue // closed/archived old ticket
    if (skipBeforeMs != null) {
      const createdMs = getCreatedMs(item)
      // Fail safe: when a cutoff is set but we cannot read the creation date,
      // skip rather than risk diagnosing an undatable backlog item.
      if (createdMs == null) {
        unparsedDates++
        continue
      }
      if (createdMs < skipBeforeMs) continue // created before the cutoff
    }
    if ((fieldMap(item)[diagnosisColumnId] || '').trim()) continue // already diagnosed
    if (inFlight.has(rowId)) continue

    inFlight.add(rowId)
    processed++
    try {
      await diagnoseAndWrite(client, { item, rowId, columns, diagnosisColumnId })
    } catch (err) {
      log('⚠️', `Failed to diagnose row ${rowId}: ${err.message}`)
    } finally {
      inFlight.delete(rowId)
    }
  }

  if (unparsedDates > 0) {
    log('⚠️', `Skipped ${unparsedDates} item(s) with an unreadable date while SLACK_AUTODIAGNOSE_SKIP_BEFORE is set`)
  }
  return { processed }
}

export function startAutoDiagnose({ client }) {
  if (!config.autoDiagnose?.enabled) return null
  if (intervalHandle) return intervalHandle

  const { listId, pollIntervalMs } = config.autoDiagnose
  log('🩺', `Auto-diagnose enabled: polling list ${listId} every ${pollIntervalMs}ms`)

  const tick = () => {
    runPollOnce(client).catch(err => log('⚠️', `Poll failed: ${err.message}`))
  }
  intervalHandle = setInterval(tick, pollIntervalMs)
  intervalHandle.unref?.()
  tick() // run one pass immediately rather than waiting a full interval
  return intervalHandle
}

export function stopAutoDiagnose() {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
  inFlight.clear()
}
