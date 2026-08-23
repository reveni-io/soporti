export const ARTIFACT_HEIGHT_MESSAGE = 'artifact_height'
export const ARTIFACT_PRINT_MESSAGE = 'artifact_print'

export function buildArtifactRuntime(parentOrigin) {
  return `
;(function () {
  var target = ${JSON.stringify(parentOrigin)}

  var lastHeight = 0
  var scheduled = false

  function measure() {
    scheduled = false
    var height = Math.ceil(document.body.getBoundingClientRect().height)
    if (height <= 0 || height === lastHeight) return

    lastHeight = height
    parent.postMessage({ type: ${JSON.stringify(ARTIFACT_HEIGHT_MESSAGE)}, height: height }, target)
  }

  function report() {
    if (scheduled) return

    scheduled = true
    requestAnimationFrame(measure)
  }

  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(report).observe(document.body)
  }
  window.addEventListener('load', report)
  report()

  window.addEventListener('message', function (event) {
    if (event.origin !== target) return
    if (!event.data || event.data.type !== ${JSON.stringify(ARTIFACT_PRINT_MESSAGE)}) return

    window.print()
  })
})()
`
}
