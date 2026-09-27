import type { ThreeCanvasProps } from './webgl-renderer.tsx'

export type {
  ThreeCanvasFrame,
  ThreeCanvasFrameloop,
  ThreeCanvasHandle,
  ThreeCanvasObjectEvent,
  ThreeCanvasProps,
  ThreeWebGLRendererFactory,
} from './webgl-renderer.tsx'

/** Classic WebGL has no implicit React Native surface/context host. */
export function ThreeCanvas(_props: ThreeCanvasProps): never {
  throw new Error(
    '@hozo/three/webgl is not available on React Native. Use the portable @hozo/three surface or an explicit Native GPU host.',
  )
}
