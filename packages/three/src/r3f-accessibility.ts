import type { RefObject } from 'react'
import type { Object3D } from 'three'

export type R3FAccessibleObjectTarget = Object3D | RefObject<Object3D | null>

interface R3FAccessibleObjectBase {
  /** Stable identity and semantic-control order are owned by the application. */
  id: string
  label: string
  object: R3FAccessibleObjectTarget
  disabled?: boolean
  /** Stable selector for Native device automation and Web accessibility tests. */
  testID?: string
}

export interface R3FAccessibleObjectEvent {
  id: string
  object: Object3D
}

export type R3FAccessibleObject =
  | (R3FAccessibleObjectBase & {
      href?: never
      external?: never
      replace?: never
      onPress: (event: R3FAccessibleObjectEvent) => void
    })
  | (R3FAccessibleObjectBase & {
      href: string
      external?: boolean
      replace?: boolean
      onPress?: never
    })

export function resolveR3FAccessibleObject(target: R3FAccessibleObjectTarget) {
  return 'current' in target ? target.current : target
}
