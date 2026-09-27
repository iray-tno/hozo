import type { ThreeCanvasProps } from './r3f.tsx'

export type { ThreeCanvasProps }

/** Native R3F hosting is intentionally gated on the host evaluation in #596. */
export function ThreeCanvas(_props: ThreeCanvasProps): never {
  throw new Error(
    '@hozo/three/r3f is currently Web-only. Use portable @hozo/three on React Native while the Native GPU host is evaluated.',
  )
}
