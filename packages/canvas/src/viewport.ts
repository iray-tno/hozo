/** Platform-free geometry used to map a scene onto its drawing surface. */
export interface CanvasViewport {
  width: number
  height: number
  pixelRatio: number
  viewBox?: readonly [x: number, y: number, width: number, height: number]
  fit?: 'contain' | 'stretch'
}
