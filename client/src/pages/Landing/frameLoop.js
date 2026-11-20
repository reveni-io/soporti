export function frameLoop(steps) {
  return async function play({ show, sleep, isCancelled }) {
    while (!isCancelled()) {
      for (const step of steps) {
        show(step.frame)
        await sleep(step.ms)
        if (isCancelled()) return
      }
    }
  }
}
