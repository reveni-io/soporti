import { listCheckRuns, listCommitStatuses } from '../github/client.js'
import { shortSha } from '../github/sanitize.js'

const MAX_FAILURE_DETAILS_CHARS = 1000
const COMPLETED_RUN_STATUS = 'completed'
const PENDING_STATE = 'pending'
const FAILED_CONCLUSIONS = new Set(['failure', 'timed_out', 'startup_failure', 'action_required'])
const FAILED_STATUS_STATES = new Set(['failure', 'error'])
const STATE_ORDER = ['failed', 'pending', 'completed']

export async function loadCiStatus({ repoFullName, headSha }, { logger = console }) {
  const subject = `${repoFullName}@${shortSha(headSha)}`
  const [checkRuns, statuses] = await Promise.allSettled([
    listCheckRuns(repoFullName, headSha),
    listCommitStatuses(repoFullName, headSha),
  ])

  warnIfRejected(checkRuns, `the check runs of ${subject}`, logger)
  warnIfRejected(statuses, `the commit statuses of ${subject}`, logger)
  if (checkRuns.status === 'rejected' && statuses.status === 'rejected') return null

  const checks = [...(checkRuns.value ?? []).map(fromCheckRun), ...(statuses.value ?? []).map(fromCommitStatus)]

  return {
    checks: checks.sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state)),
    incomplete: checkRuns.status === 'rejected' || statuses.status === 'rejected',
  }
}

function warnIfRejected(result, label, logger) {
  if (result.status !== 'rejected') return

  logger.warn(`[review] Could not load ${label} (${result.reason?.message}); reviewing without them`)
}

function fromCheckRun(run) {
  if (run.status !== COMPLETED_RUN_STATUS) {
    return { name: run.name, state: PENDING_STATE, result: describePending(run.status), details: '' }
  }

  const failed = FAILED_CONCLUSIONS.has(run.conclusion)

  return {
    name: run.name,
    state: failed ? 'failed' : 'completed',
    result: run.conclusion ?? 'unknown',
    details: failed ? truncateDetails([run.title, run.summary]) : '',
  }
}

function fromCommitStatus(status) {
  if (status.state === PENDING_STATE) {
    return { name: status.context, state: PENDING_STATE, result: PENDING_STATE, details: '' }
  }

  const failed = FAILED_STATUS_STATES.has(status.state)

  return {
    name: status.context,
    state: failed ? 'failed' : 'completed',
    result: status.state,
    details: failed ? truncateDetails([status.description]) : '',
  }
}

function describePending(runStatus) {
  return runStatus === PENDING_STATE ? PENDING_STATE : `${PENDING_STATE} (${runStatus})`
}

function truncateDetails(parts) {
  const text = parts
    .map(part => String(part ?? '').trim())
    .filter(Boolean)
    .join('\n')

  return text.length > MAX_FAILURE_DETAILS_CHARS ? `${text.slice(0, MAX_FAILURE_DETAILS_CHARS)}…` : text
}
