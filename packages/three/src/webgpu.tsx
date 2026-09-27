import { useCallback, useRef } from 'react'
import type { WebGPURendererParameters } from 'three/src/renderers/webgpu/WebGPURenderer.js'
import { Raycaster, type WebGPURenderer } from 'three/webgpu'

import {
  type ThreeCanvasFrame,
  type ThreeCanvasFrameloop,
  type ThreeCanvasHandle,
  type ThreeCanvasObjectEvent,
  ThreeWebCanvas,
  type ThreeWebCanvasProps,
} from './web-surface.tsx'

export type { ThreeCanvasFrame, ThreeCanvasFrameloop, ThreeCanvasHandle, ThreeCanvasObjectEvent }

export type ThreeWebGPURendererFactory = (
  canvas: HTMLCanvasElement,
  options: Omit<WebGPURendererParameters, 'canvas'>,
) => Promise<WebGPURenderer> | WebGPURenderer

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export type ThreeCanvasProps = DistributiveOmit<
  ThreeWebCanvasProps<WebGPURenderer>,
  'createRaycaster' | 'createRenderer' | 'onCreated'
> & {
  /** Creates the owned modern renderer. Hozo awaits `init()` before drawing. */
  createRenderer?: ThreeWebGPURendererFactory
  onCreated?: (renderer: WebGPURenderer) => void
  rendererOptions?: Omit<WebGPURendererParameters, 'canvas'>
}

const defaultCreateRenderer: ThreeWebGPURendererFactory = async (canvas, options) => {
  const { WebGPURenderer } = await import('three/webgpu')
  return new WebGPURenderer({ ...options, canvas })
}
const createRaycaster = () => new Raycaster()

/**
 * The modern Three.js renderer family. Three chooses WebGPU by default and
 * falls back to its own WebGL 2 backend unless `rendererOptions` says otherwise.
 */
export function ThreeCanvas({
  createRenderer = defaultCreateRenderer,
  onCreated,
  rendererOptions = {},
  ...props
}: ThreeCanvasProps) {
  const creationOptions = useRef(rendererOptions)
  const create = useCallback(
    async (canvas: HTMLCanvasElement) => {
      const renderer = await createRenderer(canvas, creationOptions.current)
      try {
        await renderer.init()
        return renderer
      } catch (error) {
        renderer.dispose()
        throw error
      }
    },
    [createRenderer],
  )
  return (
    <ThreeWebCanvas
      {...props}
      createRaycaster={createRaycaster}
      createRenderer={create}
      onCreated={onCreated}
    />
  )
}
