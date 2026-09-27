import type { ThreeCanvasProps } from './webgpu.tsx'

export type {
  ThreeCanvasFrame,
  ThreeCanvasFrameloop,
  ThreeCanvasHandle,
  ThreeCanvasObjectEvent,
  ThreeCanvasProps,
  ThreeWebGPURendererFactory,
} from './webgpu.tsx'

/** The browser WebGPU renderer has no implicit React Native surface host. */
export function ThreeCanvas(_props: ThreeCanvasProps): never {
  throw new Error(
    '@hozo/three/webgpu is not available on React Native. Use the portable @hozo/three surface or an explicit Native GPU host.',
  )
}
