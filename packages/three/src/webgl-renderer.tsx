import { useCallback, useRef } from 'react'
import { Raycaster, WebGLRenderer, type WebGLRendererParameters } from 'three'

import {
  type ThreeCanvasFrame,
  type ThreeCanvasFrameloop,
  type ThreeCanvasHandle,
  type ThreeCanvasObjectEvent,
  ThreeWebCanvas,
  type ThreeWebCanvasProps,
} from './web-surface.tsx'

export type { ThreeCanvasFrame, ThreeCanvasFrameloop, ThreeCanvasHandle, ThreeCanvasObjectEvent }

export type ThreeWebGLRendererFactory = (
  canvas: HTMLCanvasElement,
  options: Omit<WebGLRendererParameters, 'canvas'>,
) => WebGLRenderer

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export type ThreeCanvasProps = DistributiveOmit<
  ThreeWebCanvasProps<WebGLRenderer>,
  'createRaycaster' | 'createRenderer' | 'onCreated'
> & {
  /** Creates the owned renderer. Primarily useful for custom renderer subclasses and tests. */
  createRenderer?: ThreeWebGLRendererFactory
  onCreated?: (renderer: WebGLRenderer) => void
  rendererOptions?: Omit<WebGLRendererParameters, 'canvas'>
}

const defaultCreateRenderer: ThreeWebGLRendererFactory = (canvas, options) =>
  new WebGLRenderer({ ...options, canvas })
const createRaycaster = () => new Raycaster()

/** A Web-only Three.js surface backed by the classic `WebGLRenderer`. */
export function ThreeCanvas({
  createRenderer = defaultCreateRenderer,
  onCreated,
  rendererOptions = {},
  ...props
}: ThreeCanvasProps) {
  const creationOptions = useRef(rendererOptions)
  const create = useCallback(
    (canvas: HTMLCanvasElement) => createRenderer(canvas, creationOptions.current),
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
