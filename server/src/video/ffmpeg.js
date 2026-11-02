import { spawn } from 'node:child_process'

const STDERR_TAIL_CHARS = 8192
const STDERR_TAIL_LINES = 6

export function describeFfmpegFailure(code, stderr) {
  const tail = stderr
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .slice(-STDERR_TAIL_LINES)
    .join(' | ')
  const status = code === null ? 'was stopped' : `exited with code ${code}`

  if (!tail) return `ffmpeg ${status}.`
  return `ffmpeg ${status}: ${tail}`
}

function describeSpawnError(error, ffmpegPath) {
  if (error.name === 'AbortError') return error
  if (error.code === 'ENOENT') {
    return new Error(`ffmpeg was not found at "${ffmpegPath}": install it or point FFMPEG_PATH at the binary.`)
  }
  return error
}

function keepTail(text, chunk) {
  const next = text + chunk
  return next.length > STDERR_TAIL_CHARS ? next.slice(-STDERR_TAIL_CHARS) : next
}

export function spawnFfmpeg({ ffmpegPath, args, signal }) {
  const child = spawn(ffmpegPath, ['-hide_banner', ...args], { signal, killSignal: 'SIGKILL' })
  let stderr = ''

  child.stdin.on('error', () => {})
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => {
    stderr = keepTail(stderr, chunk)
  })

  const done = new Promise((resolve, reject) => {
    child.on('error', error => reject(describeSpawnError(error, ffmpegPath)))
    child.on('close', code => {
      if (code === 0) return resolve(stderr)
      reject(new Error(describeFfmpegFailure(code, stderr)))
    })
  })
  done.catch(() => {})

  return { child, done }
}

export async function runFfmpeg({ ffmpegPath, args, input, signal }) {
  const { child, done } = spawnFfmpeg({ ffmpegPath, args, signal })
  const chunks = []

  child.stdout.on('data', chunk => chunks.push(chunk))
  child.stdin.end(input)

  const stderr = await done
  return { stdout: Buffer.concat(chunks), stderr }
}
