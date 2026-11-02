export class VideoProjectError extends Error {
  constructor(message) {
    super(message)
    this.name = 'VideoProjectError'
  }
}
