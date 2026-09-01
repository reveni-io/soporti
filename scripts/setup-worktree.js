import { execFileSync, execSync } from 'node:child_process'
import { existsSync, lstatSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'

const ENV_FILE = '.env'
const INSTALL_COMMANDS = ['npm install', 'npm install --prefix server', 'npm install --prefix client']

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function linkEnv(worktreeRoot, primaryRoot) {
  const link = join(worktreeRoot, ENV_FILE)
  const target = join(primaryRoot, ENV_FILE)

  if (worktreeRoot === primaryRoot) return `${ENV_FILE}: primary checkout, nothing to link.`
  if (lstatSync(link, { throwIfNoEntry: false })) return `${ENV_FILE}: already there, left untouched.`
  if (!existsSync(target)) return `${ENV_FILE}: not found at ${target}. Create it there first (cp .env.example .env).`

  symlinkSync(target, link)

  return `${ENV_FILE}: linked to ${target}.`
}

function setupWorktree() {
  const worktreeRoot = git('rev-parse', '--show-toplevel')
  const primaryRoot = dirname(git('rev-parse', '--path-format=absolute', '--git-common-dir'))

  console.log(linkEnv(worktreeRoot, primaryRoot))

  for (const command of INSTALL_COMMANDS) {
    console.log(`\n> ${command}`)
    execSync(command, { cwd: worktreeRoot, stdio: 'inherit' })
  }
}

setupWorktree()
