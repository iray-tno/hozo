import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import type { CanvasPoint } from './hit-test.ts'

export interface CanvasPressEvent {
  /** Position in the root Canvas scene coordinate system. */
  point: CanvasPoint
  /** Position in logical CSS pixels or React Native points. */
  surfacePoint: CanvasPoint
}

export interface CanvasInteractionProps {
  /** Portable discrete activation for closed Canvas geometry. */
  onPress?: (event: CanvasPressEvent) => void
  disabled?: boolean
}

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

export interface RectProps extends CanvasPaintProps, CanvasInteractionProps {
  x?: number
  y?: number
  width: number
  height: number
}

export interface RoundedRectProps extends RectProps {
  radius: number
}

export interface CircleProps extends CanvasPaintProps, CanvasInteractionProps {
  cx: number
  cy: number
  radius: number
}

export interface EllipseProps extends CanvasPaintProps, CanvasInteractionProps {
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

type SceneProps<Props> = Omit<Props, keyof CanvasInteractionProps>

export type CanvasLeafNode =
  | { id?: string; kind: 'rect'; props: SceneProps<RectProps> }
  | { id?: string; kind: 'rounded-rect'; props: SceneProps<RoundedRectProps> }
  | { id?: string; kind: 'circle'; props: SceneProps<CircleProps> }
  | { id?: string; kind: 'ellipse'; props: SceneProps<EllipseProps> }
  | { id?: string; kind: 'line'; props: LineProps }
  | { id?: string; kind: 'path'; props: PathProps }

export type CanvasSceneNode = CanvasLeafNode
  | { id?: string; kind: 'group'; props: Omit<GroupProps, 'children'>; children: readonly CanvasSceneNode[] }
  | { id?: string; kind: 'clip'; props: Omit<ClipProps, 'children'>; children: readonly CanvasSceneNode[] }

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

class CanvasInteractionStore {
  readonly #handlers = new Map<string, (event: CanvasPressEvent) => void>()

  set(id: string, handler: (event: CanvasPressEvent) => void) {
    this.#handlers.set(id, handler)
  }

  remove(id: string) {
    this.#handlers.delete(id)
  }

  has(id: string) {
    return this.#handlers.has(id)
  }

  press(id: string, event: CanvasPressEvent) {
    this.#handlers.get(id)?.(event)
  }
}

function sceneValueEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => sceneValueEqual(value, right[index]))
  }
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  const rightKeys = Object.keys(rightRecord)
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key) => key in rightRecord && sceneValueEqual(leftRecord[key], rightRecord[key]))
}

function flatNodeEqual(left: FlatNode, right: FlatNode) {
  return left.kind === right.kind && sceneValueEqual(left.props, right.props)
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
    if (previous && previous.parentId === parentId && flatNodeEqual(previous.node, node)) return
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
            id: stored.id,
            children: build(stored.id, nextAncestors),
          } as CanvasSceneNode)
        } else {
          result.push({ ...stored.node, id: stored.id })
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
  interactions: CanvasInteractionStore
  parentId?: string
  interactionBlockReason?: 'path-clip'
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
  return {
    store: context.store,
    interactions: context.interactions,
    interactionBlockReason: context.interactionBlockReason,
    id,
  }
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

function interactiveLeaf<P extends CanvasInteractionProps>(
  kind: 'rect' | 'rounded-rect' | 'circle' | 'ellipse',
) {
  const Component = ({ onPress, disabled, ...props }: P) => {
    const node = useMemo(() => ({ kind, props }) as unknown as FlatNode, [props])
    const context = useSceneNode(node)
    useIsoLayoutEffect(() => {
      if (!onPress || disabled) {
        context.interactions.remove(context.id)
        return
      }
      context.interactions.set(context.id, onPress)
      return () => context.interactions.remove(context.id)
    }, [context.interactions, context.id, onPress, disabled])
    if (onPress && !disabled && context.interactionBlockReason === 'path-clip') {
      throw new Error(
        'Canvas interactions inside path clips are unsupported. '
        + 'Use a rectangle clip or move the interactive shape outside the path clip.',
      )
    }
    return null
  }
  Component.displayName = `Canvas.${kind}`
  return Component
}

export const Rect = interactiveLeaf<RectProps>('rect')
export const RoundedRect = interactiveLeaf<RoundedRectProps>('rounded-rect')
export const Circle = interactiveLeaf<CircleProps>('circle')
export const Ellipse = interactiveLeaf<EllipseProps>('ellipse')
export const Line = leaf<LineProps>('line')
export const Path = leaf<PathProps>('path')

export function Group({ children, ...props }: GroupProps) {
  const node = useMemo(() => ({ kind: 'group' as const, props }), [props])
  const context = useSceneNode(node)
  return (
    <SceneContext.Provider
      value={{
        store: context.store,
        interactions: context.interactions,
        parentId: context.id,
        interactionBlockReason: context.interactionBlockReason,
      }}
    >
      {children}
    </SceneContext.Provider>
  )
}

export function Clip({ children, ...props }: ClipProps) {
  const node = useMemo(() => ({ kind: 'clip' as const, props }), [props])
  const context = useSceneNode(node)
  return (
    <SceneContext.Provider
      value={{
        store: context.store,
        interactions: context.interactions,
        parentId: context.id,
        interactionBlockReason: props.path !== undefined
          ? 'path-clip'
          : context.interactionBlockReason,
      }}
    >
      {children}
    </SceneContext.Provider>
  )
}

/** Shared by the Web and Native roots; `collector` executes arbitrary React composition. */
export function useCanvasScene(children: ReactNode) {
  const storeRef = useRef<CanvasSceneStore | null>(null)
  if (!storeRef.current) storeRef.current = new CanvasSceneStore()
  const store = storeRef.current
  const interactionStoreRef = useRef<CanvasInteractionStore | null>(null)
  if (!interactionStoreRef.current) interactionStoreRef.current = new CanvasInteractionStore()
  const interactions = interactionStoreRef.current
  const [revision, setRevision] = useState(store.version)

  useIsoLayoutEffect(() => {
    setRevision(store.version)
    return store.subscribe(() => setRevision(store.version))
  }, [store])

  const rootContext = useMemo(() => ({ store, interactions }), [store, interactions])
  const collector = useMemo(
    () => <SceneContext.Provider value={rootContext}>{children}</SceneContext.Provider>,
    [rootContext, children],
  )

  const isInteractive = useCallback((id: string) => interactions.has(id), [interactions])
  const press = useCallback(
    (id: string, event: CanvasPressEvent) => interactions.press(id, event),
    [interactions],
  )

  return {
    scene: useMemo(() => store.snapshot(), [store, revision]),
    // A scene revision redraws the platform surface, but must not rerender
    // every marker just because the root observed it. Stable provider value
    // and element identity keep large scenes from doing that second pass.
    collector,
    isInteractive,
    press,
  }
}
