import type { createKumimonoScene } from '@hozo/example-three-kumimono'
import type { WebGLRenderer } from 'three'

/** Endpoint observations: no extra rendering or GL calls unless explicitly diagnosing a flush. */
export function observeKumimonoRender(
  renderer: Pick<WebGLRenderer, 'render'> &
    Partial<Pick<WebGLRenderer, 'info' | 'getRenderTarget'>>,
  study: ReturnType<typeof createKumimonoScene>,
  readProgress: () => number,
  report: (event: Record<string, unknown>) => void,
  flushNativeCommands?: () => void,
  now = () => performance.now(),
) {
  const render = renderer.render
  let lastEndpoint: number | undefined
  let previousEndpointAt: number | undefined
  let intervalFrames = 0
  let intervalSubmitMs = 0
  let intervalMaxSubmitMs = 0
  let intervalMainPassDrawCalls = 0
  renderer.render = function (scene, camera) {
    const progress = readProgress()
    const endpoint = (progress === 0 || progress === 1) && progress !== lastEndpoint
    if (endpoint) {
      report({
        phase: 'render-start',
        progress,
        sameScene: scene === study.scene,
        sameCamera: camera === study.camera,
        cameraPosition: camera.position.toArray(),
        piecePosition: study.animationObject.position.toArray(),
      })
    }
    // R3F Native's existing wrapper renders and calls endFrameEXP. Preserve its
    // receiver, arguments, return value and errors. A return is not GPU-present
    // proof: the separate screenshot/pixel assertions remain authoritative.
    const startedAt = now()
    const result = render.call(this, scene, camera)
    const returnedAt = now()
    const submitMs = returnedAt - startedAt
    intervalFrames++
    intervalSubmitMs += submitMs
    intervalMaxSubmitMs = Math.max(intervalMaxSubmitMs, submitMs)
    // Three's normal auto-reset excludes the shadow pass from these counters.
    // These are CPU-side submissions, NOT GL commands, native queue depth or
    // presented frames. Sampling info does not add a GL query/synchronization.
    intervalMainPassDrawCalls += renderer.info?.render.calls ?? 0
    // Opt-in comparison only: Expo's public flushEXP waits for queued native
    // commands. It is not GPU-present proof and must not be a default/perf path.
    const flushStarted = flushNativeCommands ? now() : undefined
    flushNativeCommands?.()
    if (endpoint) {
      report({
        phase: 'render-return',
        progress,
        pieceWorldMatrix: study.animationObject.matrixWorld.toArray(),
        drawCalls: renderer.info?.render.calls,
        triangles: renderer.info?.render.triangles,
        frame: renderer.info?.render.frame,
        jsSubmitMs: submitMs,
        intervalSubmittedFrames: intervalFrames,
        intervalJsSubmitMs: intervalSubmitMs,
        intervalMaxJsSubmitMs: intervalMaxSubmitMs,
        intervalMainPassDrawCalls,
        sincePreviousEndpointMs:
          previousEndpointAt === undefined ? undefined : returnedAt - previousEndpointAt,
        commandFlushMs: flushStarted === undefined ? undefined : now() - flushStarted,
        defaultFramebuffer: renderer.getRenderTarget
          ? renderer.getRenderTarget() === null
          : undefined,
      })
      lastEndpoint = progress
      previousEndpointAt = returnedAt
      intervalFrames = 0
      intervalSubmitMs = 0
      intervalMaxSubmitMs = 0
      intervalMainPassDrawCalls = 0
    }
    return result
  }
}
