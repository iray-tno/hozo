import { createElement, Fragment, type ReactNode, useSyncExternalStore } from 'react'
import type { A2uiStore, A2uiSurfaceSnapshot } from './engine.ts'
import type { ChildList } from './protocol.ts'

export interface A2uiSurfaceProps {
  readonly store: A2uiStore
  readonly surfaceId: string
  readonly rootId?: string
  readonly fallback?: ReactNode
}

function renderNode(
  store: A2uiStore,
  surface: A2uiSurfaceSnapshot,
  componentId: string,
  scopePath: string,
  ancestors: ReadonlySet<string>,
  reportedCycles: Set<string>,
): ReactNode {
  const edgeKey = `${componentId}@${scopePath}`
  if (ancestors.has(edgeKey)) {
    if (!reportedCycles.has(edgeKey)) {
      reportedCycles.add(edgeKey)
      store.reportError(
        'CYCLE_DETECTED',
        surface.surfaceId,
        `/components/${componentId}`,
        `Cyclic component reference detected at "${componentId}" (${scopePath}).`,
      )
    }
    return null
  }

  const record = surface.components.get(componentId)
  if (!record) return null

  const catalog = store.getCatalog(record.catalogId)
  const entry = catalog?.components.get(record.component)
  if (!entry) return null

  const accessibility = store.resolveAccessibility(surface, record.accessibility, scopePath)
  if (accessibility.hidden === true) return null

  const nextAncestors = new Set(ancestors)
  nextAncestors.add(edgeKey)

  const props = store.resolveProps(surface, record, scopePath)

  const renderChildren = (children: ChildList | undefined): ReactNode => {
    const refs = store.resolveChildren(surface, children, scopePath)
    if (refs.length === 0) return null
    return refs.map((ref) =>
      createElement(
        Fragment,
        { key: ref.key },
        renderNode(store, surface, ref.id, ref.scopePath, nextAncestors, reportedCycles),
      ),
    )
  }

  return entry.presenter({
    props,
    accessibility,
    surfaceId: surface.surfaceId,
    componentId: record.id,
    scopePath,
    renderChildren,
    dispatch: (action) => {
      store.dispatchAction(surface.surfaceId, record.id, action, scopePath)
    },
  })
}

/**
 * Platform-agnostic A2UI surface renderer.
 *
 * Uses only React (`useSyncExternalStore`, `createElement`, `Fragment`) and
 * catalog presenters built from Hozo primitives — no Custom Elements, no
 * `react-dom`, no HTML tags.
 */
export function A2uiSurface({
  store,
  surfaceId,
  rootId = 'root',
  fallback = null,
}: A2uiSurfaceProps): ReactNode {
  const surface = useSyncExternalStore(
    store.subscribe,
    () => store.getSurface(surfaceId),
    () => store.getSurface(surfaceId),
  )

  if (!surface?.components.has(rootId)) return fallback

  const reportedCycles = new Set<string>()
  return renderNode(store, surface, rootId, '/', new Set<string>(), reportedCycles)
}
