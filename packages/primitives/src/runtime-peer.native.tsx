// Sibling interaction scoping on React Native for `peer-hover:`, `peer-focus:`,
// `peer-focus-visible:`, and `peer-pressed:`.
//
// Like `HozoContainerQuery` and `HozoParentSizeQuery`, neither component
// inserts a native host View: `HozoPeerScope` provides an external store whose
// updates never re-render the parent container, and `HozoPeerQuery` subscribes
// only to the specific preceding peer IDs referenced by that sibling.

import { type ReactNode, useCallback, useContext, useRef, useSyncExternalStore } from 'react'

import { HozoPeerContext } from './peer-context.native.ts'
import {
  buildPeerSnapshot,
  createHozoPeerStore,
  type HozoPeerSnapshot,
  type HozoPeerStore,
} from './peer-store.ts'

export interface HozoPeerScopeProps {
  children?: ReactNode
}

export function HozoPeerScope({ children }: HozoPeerScopeProps): ReactNode {
  const storeRef = useRef<HozoPeerStore | null>(null)
  if (storeRef.current === null) {
    storeRef.current = createHozoPeerStore()
  }
  return <HozoPeerContext.Provider value={storeRef.current}>{children}</HozoPeerContext.Provider>
}

export interface HozoPeerQueryProps {
  peerIds: readonly number[]
  children: (peers: HozoPeerSnapshot) => ReactNode
}

export function HozoPeerQuery({ peerIds, children }: HozoPeerQueryProps): ReactNode {
  const store = useContext(HozoPeerContext)
  const snapshotRef = useRef<HozoPeerSnapshot | null>(null)
  const key = peerIds.join(',')

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!store) return () => {}
      const ids = key === '' ? [] : key.split(',').map(Number)
      return store.subscribe(ids, onStoreChange)
    },
    [store, key],
  )

  const getSnapshot = useCallback(() => {
    const ids = key === '' ? [] : key.split(',').map(Number)
    const next = buildPeerSnapshot(store, ids, snapshotRef.current)
    snapshotRef.current = next
    return next
  }, [store, key])

  const peers = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return children(peers)
}
