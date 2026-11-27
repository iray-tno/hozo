// Opt-in descendant interaction tracking on React Native for `focus-within:`,
// `has-[:focus]:`, and `has-hover:`.
//
// Split into two zero-host-View components so the queried element's own
// interaction never pollutes its descendant-only `:has(...)` state:
// - `HozoSubtreeScope` holds the store and passes the reactive snapshot to
//   its render prop (outside the host element).
// - `HozoSubtreeBoundary` wraps only the host's children and provides the
//   reporting context to descendants.

import { type ReactNode, useContext, useMemo, useRef, useSyncExternalStore } from 'react'

import { HozoSubtreeContext } from './subtree-context.native.ts'
import {
  createHozoSubtreeStore,
  type HozoSubtreeReporter,
  type HozoSubtreeState,
  type HozoSubtreeStore,
} from './subtree-store.ts'

export interface HozoSubtreeHandle extends HozoSubtreeState {
  readonly _reporter: HozoSubtreeReporter
}

export interface HozoSubtreeScopeProps {
  children: (subtree: HozoSubtreeHandle) => ReactNode
}

export function HozoSubtreeScope({ children }: HozoSubtreeScopeProps): ReactNode {
  const parentReporter = useContext(HozoSubtreeContext)
  const storeRef = useRef<HozoSubtreeStore | null>(null)
  if (storeRef.current === null) {
    storeRef.current = createHozoSubtreeStore(parentReporter)
  } else {
    storeRef.current.setParent(parentReporter)
  }
  const store = storeRef.current
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const handle = useMemo<HozoSubtreeHandle>(
    () => ({ ...state, _reporter: store.reporter }),
    [state, store],
  )
  return children(handle)
}

export interface HozoSubtreeBoundaryProps {
  scope: HozoSubtreeHandle
  children?: ReactNode
}

export function HozoSubtreeBoundary({ scope, children }: HozoSubtreeBoundaryProps): ReactNode {
  return (
    <HozoSubtreeContext.Provider value={scope._reporter}>{children}</HozoSubtreeContext.Provider>
  )
}
