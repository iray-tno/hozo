import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export interface CanvasPaintProps {
  /** Compiler input. Runtime drawing uses the explicit paint props below. */
  className?: string
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
  lineCap?: 'butt' | 'round' | 'square'
  lineJoin?: 'bevel' | 'round' | 'miter'
}

export interface CanvasTransform {
  translateX?: number
  translateY?: number
  scaleX?: number
  scaleY?: number
  /** Clockwise degrees. */
  rotate?: number
  originX?: number
  originY?: number
}

export interface GroupProps {
  children?: ReactNode
  opacity?: number
  transform?: CanvasTransform
}

export interface RectProps extends CanvasPaintProps {
  x?: number
  y?: number
  width: number
  height: number
}

export interface RoundedRectProps extends RectProps {
  radius: number
}

export interface CircleProps extends CanvasPaintProps {
  cx: number
  cy: number
  radius: number
}

export interface EllipseProps extends CanvasPaintProps {
  cx: number
  cy: number
  radiusX: number
  radiusY: number
}

export interface LineProps extends CanvasPaintProps {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface PathProps extends CanvasPaintProps {
  path: string
  fillRule?: 'nonzero' | 'evenodd'
}

export type ClipProps = (
  | { path: string; x?: never; y?: never; width?: never; height?: never }
  | { path?: never; x?: number; y?: number; width: number; height: number }
) & { children?: ReactNode }

export type CanvasLeafNode =
  | { kind: 'rect'; props: RectProps }
  | { kind: 'rounded-rect'; props: RoundedRectProps }
  | { kind: 'circle'; props: CircleProps }
  | { kind: 'ellipse'; props: EllipseProps }
  | { kind: 'line'; props: LineProps }
  | { kind: 'path'; props: PathProps }

export type CanvasSceneNode = CanvasLeafNode
  | { kind: 'group'; props: Omit<GroupProps, 'children'>; children: readonly CanvasSceneNode[] }
  | { kind: 'clip'; props: Omit<ClipProps, 'children'>; children: readonly CanvasSceneNode[] }

export type CanvasScene = readonly CanvasSceneNode[]

type FlatNode =
  | CanvasLeafNode
  | { kind: 'group'; props: Omit<GroupProps, 'children'> }
  | { kind: 'clip'; props: Omit<ClipProps, 'children'> }

interface StoredNode {
  id: string
  parentId?: string
  order: number
  node: FlatNode
}

/** A small platform-neutral retained scene. It is deliberately not Hozo's semantic/SVG IR. */
export class CanvasSceneStore {
  readonly #nodes = new Map<string, StoredNode>()
  readonly #listeners = new Set<() => void>()
  #nextOrder = 0
  #version = 0

  get version() {
    return this.#version
  }

  subscribe(listener: () => void) {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  upsert(id: string, parentId: string | undefined, node: FlatNode) {
    const previous = this.#nodes.get(id)
    this.#nodes.set(id, {
      id,
      parentId,
      order: previous?.order ?? this.#nextOrder++,
      node,
    })
    this.#emit()
  }

  remove(id: string) {
    if (!this.#nodes.delete(id)) return
    this.#emit()
  }

  snapshot(): CanvasScene {
    const childrenByParent = new Map<string | undefined, StoredNode[]>()
    for (const stored of this.#nodes.values()) {
      const siblings = childrenByParent.get(stored.parentId) ?? []
      siblings.push(stored)
      childrenByParent.set(stored.parentId, siblings)
    }
    for (const siblings of childrenByParent.values()) {
      siblings.sort((a, b) => a.order - b.order)
    }

    const build = (parentId: string | undefined, ancestors: Set<string>): CanvasSceneNode[] => {
      const result: CanvasSceneNode[] = []
      for (const stored of childrenByParent.get(parentId) ?? []) {
        // A malformed custom renderer cannot turn a parent cycle into an
        // infinite traversal. The public marker components never create one.
        if (ancestors.has(stored.id)) continue
        if (stored.node.kind === 'group' || stored.node.kind === 'clip') {
          const nextAncestors = new Set(ancestors).add(stored.id)
          result.push({
            ...stored.node,
            children: build(stored.id, nextAncestors),
          } as CanvasSceneNode)
        } else {
          result.push(stored.node)
        }
      }
      return result
    }

    return build(undefined, new Set())
  }

  #emit() {
    this.#version += 1
    for (const listener of this.#listeners) listener()
  }
}

interface SceneContextValue {
  store: CanvasSceneStore
  parentId?: string
}

const SceneContext = createContext<SceneContextValue | undefined>(undefined)
const useIsoLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect

function useSceneNode(node: FlatNode) {
  const context = useContext(SceneContext)
  const id = useId()
  if (!context) {
    throw new Error('Canvas shapes must be rendered inside <Canvas>.')
  }

  useIsoLayoutEffect(() => () => context.store.remove(id), [context.store, id])
  useIsoLayoutEffect(() => {
    context.store.upsert(id, context.parentId, node)
  }, [context.store, context.parentId, id, node])
  return { store: context.store, id }
}

function leaf<P>(kind: CanvasLeafNode['kind']) {
  const Component = (props: P) => {
    const node = useMemo(() => ({ kind, props }) as CanvasLeafNode, [props])
    useSceneNode(node)
    return null
  }
  Component.displayName = `Canvas.${kind}`
  return Component
}

export const Rect = leaf<RectProps>('rect')
export const RoundedRect = leaf<RoundedRectProps>('rounded-rect')
export const Circle = leaf<CircleProps>('circle')
export const Ellipse = leaf<EllipseProps>('ellipse')
export const Line = leaf<LineProps>('line')
export const Path = leaf<PathProps>('path')

export function Group({ children, ...props }: GroupProps) {
  const node = useMemo(() => ({ kind: 'group' as const, props }), [props])
  const context = useSceneNode(node)
  return <SceneContext.Provider value={{ store: context.store, parentId: context.id }}>{children}</SceneContext.Provider>
}

export function Clip({ children, ...props }: ClipProps) {
  const node = useMemo(() => ({ kind: 'clip' as const, props }), [props])
  const context = useSceneNode(node)
  return <SceneContext.Provider value={{ store: context.store, parentId: context.id }}>{children}</SceneContext.Provider>
}

/** Shared by the Web and Native roots; `collector` executes arbitrary React composition. */
export function useCanvasScene(children: ReactNode) {
  const storeRef = useRef<CanvasSceneStore | null>(null)
  if (!storeRef.current) storeRef.current = new CanvasSceneStore()
  const store = storeRef.current
  const [revision, setRevision] = useState(store.version)

  useIsoLayoutEffect(() => {
    setRevision(store.version)
    return store.subscribe(() => setRevision(store.version))
  }, [store])

  return {
    scene: useMemo(() => store.snapshot(), [store, revision]),
    collector: <SceneContext.Provider value={{ store }}>{children}</SceneContext.Provider>,
  }
}
