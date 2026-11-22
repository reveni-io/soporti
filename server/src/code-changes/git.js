import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const GIT_TIMEOUT_MS = 60_000
const PUSH_TIMEOUT_MS = 120_000
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024
const WITHOUT_HOOKS = ['-c', 'core.hooksPath=/dev/null']
const FILE_STATUSES = { A: 'added', D: 'deleted' }
const DEFAULT_FILE_STATUS = 'modified'

async function runGit(localPath, args, { timeout = GIT_TIMEOUT_MS } = {}) {
  const { stdout } = await execFileAsync('git', ['-C', localPath, ...args], {
    timeout,
    maxBuffer: MAX_OUTPUT_BYTES,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })

  return String(stdout ?? '')
}

export function gitErrorDetail(err) {
  return String(err.stderr ?? '').trim() || err.message
}

export async function readHead(localPath) {
  return (await runGit(localPath, ['rev-parse', 'HEAD'])).trim()
}

export async function hasUncommittedChanges(localPath) {
  return (await runGit(localPath, ['status', '--porcelain'])).trim().length > 0
}

export async function commitAll(localPath, { message, name, email }) {
  await runGit(localPath, ['add', '--all'])

  const staged = await runGit(localPath, ['diff', '--cached', '--name-only'])
  if (!staged.trim()) return false

  await runGit(localPath, [
    ...WITHOUT_HOOKS,
    '-c',
    `user.name=${name}`,
    '-c',
    `user.email=${email}`,
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--no-verify',
    '--quiet',
    '-m',
    message,
  ])

  return true
}

export async function listChangedFiles(localPath, fromSha) {
  const output = await runGit(localPath, ['diff', '--name-status', '--no-renames', '-z', fromSha, 'HEAD'])
  const fields = output.split('\0').filter(Boolean)
  const files = []

  for (let index = 0; index + 1 < fields.length; index += 2) {
    files.push({ path: fields[index + 1], status: FILE_STATUSES[fields[index]] ?? DEFAULT_FILE_STATUS })
  }

  return files
}

export async function pushHead(localPath, { url, branch }) {
  await runGit(localPath, [...WITHOUT_HOOKS, 'push', '--no-verify', '--quiet', url, `HEAD:refs/heads/${branch}`], {
    timeout: PUSH_TIMEOUT_MS,
  })
}
