import type { createKumimonoScene } from '@hozo/example-three-kumimono'
import type { WebGLRenderer } from 'three'

/** Diagnostic only: coalesce intermediate R3F submissions, not simulation ticks.
 * No GL query, blocking flush, native completion claim or production policy.
 * Installed OUTSIDE the renderer observation and R3F's endFrameEXP wrapper, so
 * skipped calls submit neither drawing nor empty presentation commands.
 */
export function paceKumimonoRender(
  renderer: Pick<WebGLRenderer, 'render'>,
  study: ReturnType<typeof createKumimonoScene>,
  readProgress: () => number,
  report: (event: Record<string, unknown>) => void,
  now = () => performance.now(),
) {
  const render = renderer.render
  const intervalMs = 200
  let lastSubmittedAt = -Infinity
  let lastSubmittedProgress: number | undefined
  let submitted = 0
  let coalesced = 0
  renderer.render = function (scene, camera) {
    // This example's gate must not suppress rendering another scene/camera.
    if (scene !== study.scene || camera !== study.camera) return render.call(this, scene, camera)
    const progress = readProgress()
    const time = now()
    const endpoint = (progress === 0 || progress === 1) && progress !== lastSubmittedProgress
    if (!endpoint && time - lastSubmittedAt < intervalMs) {
      coalesced++
      return
    }
    const result = render.call(this, scene, camera)
    lastSubmittedAt = now()
    lastSubmittedProgress = progress
    submitted++
    if (endpoint) {
      report({ phase: 'submission-policy', progress, intervalMs, submitted, coalesced })
    }
    return result
  }
}
