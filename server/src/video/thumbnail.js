import config from '../config.js'
import { runFfmpeg } from './ffmpeg.js'

const THUMBNAIL_WIDTH = 640
const JPEG_QUALITY = 3

export function thumbnailArgs({ mp4Path, atSeconds }) {
  return [
    '-loglevel',
    'error',
    '-ss',
    String(Math.max(0, atSeconds)),
    '-i',
    mp4Path,
    '-frames:v',
    '1',
    '-vf',
    `scale=${THUMBNAIL_WIDTH}:-2:out_range=pc,format=yuvj420p`,
    '-f',
    'image2pipe',
    '-c:v',
    'mjpeg',
    '-q:v',
    String(JPEG_QUALITY),
    '-',
  ]
}

export async function extractThumbnail({ mp4Path, atSeconds = 0 }) {
  const { stdout } = await runFfmpeg({
    ffmpegPath: config.video.ffmpegPath,
    args: thumbnailArgs({ mp4Path, atSeconds }),
  })
  if (stdout.length === 0) throw new Error(`The video has no frame at ${atSeconds} s.`)
  return stdout
}
