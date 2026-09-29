import type { ThreeCanvasProps } from './r3f-native.tsx'

export type {
  R3FAccessibleObject,
  R3FAccessibleObjectEvent,
  R3FAccessibleObjectTarget,
  ThreeCanvasProps,
} from './r3f-native.tsx'

/** The Expo GL host is deliberately available only to React Native resolution. */
export function ThreeCanvas(_props: ThreeCanvasProps): never {
  throw new Error(
    '@hozo/three/r3f-native requires React Native with Expo GL. Web applications should import @hozo/three/r3f, @hozo/three/webgl, or @hozo/three/webgpu.',
  )
}
