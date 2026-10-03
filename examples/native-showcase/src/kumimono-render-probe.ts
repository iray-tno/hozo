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
) {
  const render = renderer.render
  let lastEndpoint: number | undefined
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
    const result = render.call(this, scene, camera)
    // Opt-in comparison only: Expo's public flushEXP waits for queued native
    // commands. It is not GPU-present proof and must not be a default/perf path.
    const flushStarted = flushNativeCommands ? performance.now() : undefined
    flushNativeCommands?.()
    if (endpoint) {
      report({
        phase: 'render-return',
        progress,
        pieceWorldMatrix: study.animationObject.matrixWorld.toArray(),
        drawCalls: renderer.info?.render.calls,
        triangles: renderer.info?.render.triangles,
        frame: renderer.info?.render.frame,
        commandFlushMs: flushStarted === undefined ? undefined : performance.now() - flushStarted,
        defaultFramebuffer: renderer.getRenderTarget
          ? renderer.getRenderTarget() === null
          : undefined,
      })
      lastEndpoint = progress
    }
    return result
  }
}
