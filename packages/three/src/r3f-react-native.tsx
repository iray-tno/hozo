import type { ThreeCanvasProps } from './r3f.tsx'

export type {
  R3FAccessibleObject,
  R3FAccessibleObjectEvent,
  R3FAccessibleObjectTarget,
  R3FRendererFactory,
  R3FRendererFactoryProps,
  ThreeCanvasProps,
} from './r3f.tsx'

/** Native R3F hosting uses the explicit, separately shipped r3f-native entry. */
export function ThreeCanvas(_props: ThreeCanvasProps): never {
  throw new Error(
    '@hozo/three/r3f is Web-only. Use portable @hozo/three on React Native, or import the experimental Expo GL host from @hozo/three/r3f-native.',
  )
}
