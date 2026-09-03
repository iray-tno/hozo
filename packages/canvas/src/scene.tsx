import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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
  /**
   * The shape a person is currently indicating, by whatever means the
   * device has. `undefined` when they stop indicating it.
   *
   * One notion rather than one per input, because a tooltip is one
   * feature and a chart should not carry three implementations of it. A
   * mouse or a pen indicates by hovering; a finger indicates by holding.
   * Both arrive here, and the handler cannot tell which -- deliberately,
   * since the answer never changes what a tooltip does.
   *
   * Hover is not a Web-only idea, which is worth stating because it is
   * easy to assume: React Native's `View` declares the whole W3C pointer
   * set and its payload carries `pointerType` and `offsetX`/`offsetY`,
   * the same as the browser's. A tablet with a trackpad hovers.
   *
   * Keyboard is *not* a source yet, and that is the honest gap. Making
   * one would mean deciding how a shape inside a canvas takes focus
   * without inventing a control nobody can see, which is its own
   * question -- see #26.
   */
  onActiveChange?: (event: CanvasPressEvent | undefined) => void
  /**
   * What this shape is called, which is what makes it reachable at all.
   *
   * A pressable shape is a control, and a control on a canvas is
   * unreachable by every route except a pointer: there is one element,
   * and the shapes inside it are pixels. So a named one is given a real
   * `<button>` in the surface's hidden layer -- real DOM, real focus,
   * real Enter and Space -- and the canvas keeps the drawing.
   *
   * Required for that to happen, and deliberately: a button with no
   * accessible name is announced as "button" and is exactly the invisible
   * control this is meant to avoid. A shape with a handler and no name
   * says so in development rather than being silently pointer-only.
   */
  accessibilityLabel?: string
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

/**
 * Whether this paint puts anything on the surface, per channel.
 *
 * Both renderers had these two conditions written out, identically and
 * separately -- Canvas2D in `applyPaint`, Skia in `paintLayers`. Hit
 * testing needs the same answer for a third time, and a hit test that
 * disagrees with the paint is worse than one that refuses: it reports a
 * press on something nobody can see. So the condition is written once and
 * all three read it.
 *
 * The defaults are the platforms' own and agree: an unset `strokeWidth`
 * is 1 in Canvas2D and in Skia, so `?? 1` is not a Hozo policy.
 */
export function paintStrokes(paint: CanvasPaintProps): boolean {
  return paint.stroke !== undefined && paint.stroke !== 'none' && (paint.strokeWidth ?? 1) > 0
}

export function paintFills(paint: CanvasPaintProps): boolean {
  return paint.fill !== 'none' && (paint.fill !== undefined || paint.stroke === undefined)
}

/**
 * The four fields both platforms take, defaulted once.
 *
 * Shared so a face cannot differ between the surfaces for a reason Hozo
 * chose. What it cannot make equal is the face a *system* resolves these
 * to, which is why `fontFamily` is passed through untouched rather than
 * mapped to something clever.
 */
export function textFontSpec(props: TextProps) {
  return {
    fontFamily: props.fontFamily ?? 'sans-serif',
    fontSize: props.fontSize,
    fontStyle: props.fontStyle ?? 'normal',
    fontWeight: props.fontWeight ?? 'normal',
  } as const
}

/** The same four as the CSS shorthand `CanvasRenderingContext2D.font` takes. */
export function cssFontShorthand(props: TextProps): string {
  const font = textFontSpec(props)
  return `${font.fontStyle} ${font.fontWeight} ${font.fontSize}px ${font.fontFamily}`
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

export interface LineProps extends CanvasPaintProps, CanvasInteractionProps {
  x1: number
  y1: number
  x2: number
  y2: number
}

/**
 * A single line of text, drawn at a baseline.
 *
 * One line, and no wrapping. Neither renderer breaks lines -- Canvas2D's
 * `fillText` and Skia's `Text` both draw a run and stop -- so wrapping
 * would be Hozo's own layout engine rather than a shared contract, and
 * the labels a chart needs are one line each.
 *
 * `x` is the left edge and `y` the alphabetic baseline, which is not a
 * choice so much as the one place the platforms already agreed: it is
 * Skia's only model and Canvas2D's default.
 *
 * The font is named rather than supplied. Skia's `matchFont` resolves a
 * system face from these four fields synchronously, and Canvas2D takes
 * the same four as a CSS shorthand, so nothing has to ship a font file.
 * The cost is that the two may not resolve to the same face: system fonts
 * differ, and a chart that needs identical glyphs on both has to load
 * one, which is outside this contract.
 */
export interface TextProps extends CanvasPaintProps {
  text: string
  x: number
  y: number
  /**
   * Required, because the platforms disagree on a default and neither
   * default is a good one -- Canvas2D starts at 10px, which is smaller
   * than any label anybody wants.
   */
  fontSize: number
  fontFamily?: string
  fontStyle?: 'normal' | 'italic'
  fontWeight?:
    | 'normal'
    | 'bold'
    | '100'
    | '200'
    | '300'
    | '400'
    | '500'
    | '600'
    | '700'
    | '800'
    | '900'
  /** Which part of the run sits at `x`. */
  textAlign?: 'left' | 'center' | 'right'
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
  | { id?: string; kind: 'line'; props: SceneProps<LineProps> }
  | { id?: string; kind: 'text'; props: TextProps }
  | { id?: string; kind: 'path'; props: PathProps }

export type CanvasSceneNode =
  | CanvasLeafNode
  | {
      id?: string
      kind: 'group'
      props: Omit<GroupProps, 'children'>
      children: readonly CanvasSceneNode[]
    }
  | {
      id?: string
      kind: 'clip'
      props: Omit<ClipProps, 'children'>
      children: readonly CanvasSceneNode[]
    }

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
  readonly #labels = new Map<string, string>()

  set(id: string, handler: (event: CanvasPressEvent) => void, label?: string) {
    this.#handlers.set(id, handler)
    if (label === undefined) this.#labels.delete(id)
    else this.#labels.set(id, label)
  }

  label(id: string) {
    return this.#labels.get(id)
  }

  remove(id: string) {
    this.#handlers.delete(id)
    this.#labels.delete(id)
  }

  has(id: string) {
    return this.#handlers.has(id)
  }

  press(id: string, event: CanvasPressEvent) {
    this.#handlers.get(id)?.(event)
  }
}

/**
 * Which shape is currently indicated, and who to tell when that changes.
 *
 * The active id lives here rather than in each surface because it is one
 * fact about the scene: two pointers cannot indicate two different shapes
 * and both be right, and a tooltip that believed otherwise would show
 * two.
 */
class CanvasActiveStore {
  readonly #handlers = new Map<string, (event: CanvasPressEvent | undefined) => void>()
  #activeId: string | undefined

  set(id: string, handler: (event: CanvasPressEvent | undefined) => void) {
    this.#handlers.set(id, handler)
  }

  remove(id: string) {
    this.#handlers.delete(id)
    // A shape that unmounts while indicated leaves nothing to be
    // indicated, and the handler it would have been told through is the
    // one that just went away.
    if (this.#activeId === id) this.#activeId = undefined
  }

  has(id: string) {
    return this.#handlers.has(id)
  }

  get activeId() {
    return this.#activeId
  }

  /**
   * Moves the indication, telling the shape that lost it and the one that
   * gained it, in that order.
   *
   * Nothing happens when the target has not changed, so a pointer moving
   * across one shape reports once rather than once per pixel -- which is
   * what makes this usable from `onPointerMove` at all.
   */
  activate(id: string | undefined, event: CanvasPressEvent | undefined) {
    if (this.#activeId === id) return
    const previous = this.#activeId
    this.#activeId = id
    if (previous !== undefined) this.#handlers.get(previous)?.(undefined)
    if (id !== undefined && event !== undefined) this.#handlers.get(id)?.(event)
  }
}

function sceneValueEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sceneValueEqual(value, right[index]))
    )
  }
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  const rightKeys = Object.keys(rightRecord)
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) => key in rightRecord && sceneValueEqual(leftRecord[key], rightRecord[key]),
    )
  )
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
  active: CanvasActiveStore
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
    active: context.active,
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
  // `line` joins the four closed shapes now that `pointInLine` can answer
  // for it. Named rather than widened to every kind: `path` still refuses
  // hits, and the list is what says which geometry the hit test covers.
  kind: 'rect' | 'rounded-rect' | 'circle' | 'ellipse' | 'line',
) {
  const Component = ({ onPress, onActiveChange, accessibilityLabel, disabled, ...props }: P) => {
    const node = useMemo(() => ({ kind, props }) as unknown as FlatNode, [props])
    const context = useSceneNode(node)
    useIsoLayoutEffect(() => {
      if (!onPress || disabled) {
        context.interactions.remove(context.id)
        return
      }
      context.interactions.set(context.id, onPress, accessibilityLabel)
      return () => context.interactions.remove(context.id)
    }, [context.interactions, context.id, onPress, accessibilityLabel, disabled])
    useIsoLayoutEffect(() => {
      if (!onActiveChange || disabled) {
        context.active.remove(context.id)
        return
      }
      context.active.set(context.id, onActiveChange)
      return () => context.active.remove(context.id)
    }, [context.active, context.id, onActiveChange, disabled])
    if (onPress && !disabled && context.interactionBlockReason === 'path-clip') {
      throw new Error(
        'Canvas interactions inside path clips are unsupported. ' +
          'Use a rectangle clip or move the interactive shape outside the path clip.',
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
export const Line = interactiveLeaf<LineProps>('line')
// Not an `interactiveLeaf`: the hit test refuses text for the same
// reason it refuses paths -- the region is whatever the rasteriser drew,
// and only the renderers know that. See `pointInNode`.
export const Text = leaf<TextProps>('text')
export const Path = leaf<PathProps>('path')

export function Group({ children, ...props }: GroupProps) {
  const node = useMemo(() => ({ kind: 'group' as const, props }), [props])
  const context = useSceneNode(node)
  return (
    <SceneContext.Provider
      value={{
        store: context.store,
        interactions: context.interactions,
        active: context.active,
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
        active: context.active,
        parentId: context.id,
        interactionBlockReason:
          props.path !== undefined ? 'path-clip' : context.interactionBlockReason,
      }}
    >
      {children}
    </SceneContext.Provider>
  )
}

export interface CanvasControl {
  id: string
  label: string
}

/**
 * The named pressable shapes, in the order they were drawn.
 *
 * Scene order and not registration order, so the tab order a keyboard
 * walks is the order an eye reads. The registry knows the handlers; only
 * the scene knows where they sit.
 *
 * Unnamed ones are left out and reported instead. A `<button>` with no
 * accessible name is announced as "button" and is the invisible control
 * this whole route exists to avoid, so the shape stays pointer-only and
 * says so rather than becoming one.
 */
const warned = new Set<string>()

export function canvasControls(
  scene: CanvasScene,
  interactions: CanvasInteractionStore,
  warn?: (message: string) => void,
): CanvasControl[] {
  const found: CanvasControl[] = []
  const walk = (nodes: CanvasScene) => {
    for (const node of nodes) {
      if (node.id !== undefined && interactions.has(node.id)) {
        const label = interactions.label(node.id)
        if (label === undefined) {
          // Once per shape, not once per render: `useId` is stable for
          // the life of the component, and a redraw is not new news.
          if (!warned.has(node.id)) {
            warned.add(node.id)
            warn?.(
              `a Canvas ${node.kind} has onPress but no accessibilityLabel, so it can only be ` +
                'reached with a pointer. Name it to give it a keyboard control.',
            )
          }
        } else {
          found.push({ id: node.id, label })
        }
      }
      if (node.kind === 'group' || node.kind === 'clip') walk(node.children)
    }
  }
  walk(scene)
  return found
}

/** Shared by the Web and Native roots; `collector` executes arbitrary React composition. */
export function useCanvasScene(children: ReactNode) {
  const storeRef = useRef<CanvasSceneStore | null>(null)
  if (!storeRef.current) storeRef.current = new CanvasSceneStore()
  const store = storeRef.current
  const interactionStoreRef = useRef<CanvasInteractionStore | null>(null)
  if (!interactionStoreRef.current) interactionStoreRef.current = new CanvasInteractionStore()
  const interactions = interactionStoreRef.current
  const activeStoreRef = useRef<CanvasActiveStore | null>(null)
  if (!activeStoreRef.current) activeStoreRef.current = new CanvasActiveStore()
  const active = activeStoreRef.current
  const [revision, setRevision] = useState(store.version)

  useIsoLayoutEffect(() => {
    setRevision(store.version)
    return store.subscribe(() => setRevision(store.version))
  }, [store])

  const rootContext = useMemo(
    () => ({ store, interactions, active }),
    [store, interactions, active],
  )
  const collector = useMemo(
    () => <SceneContext.Provider value={rootContext}>{children}</SceneContext.Provider>,
    [rootContext, children],
  )

  // A shape is worth hit testing if either handler is on it. Without the
  // second half a hover-only shape would never be found, and `onActiveChange`
  // would be a prop that type-checks and never fires.
  const isInteractive = useCallback(
    (id: string) => interactions.has(id) || active.has(id),
    [interactions, active],
  )
  const press = useCallback(
    (id: string, event: CanvasPressEvent) => interactions.press(id, event),
    [interactions],
  )
  const activate = useCallback(
    (id: string | undefined, event: CanvasPressEvent | undefined) => active.activate(id, event),
    [active],
  )

  return {
    scene: useMemo(() => store.snapshot(), [store, revision]),
    // A scene revision redraws the platform surface, but must not rerender
    // every marker just because the root observed it. Stable provider value
    // and element identity keep large scenes from doing that second pass.
    collector,
    isInteractive,
    press,
    activate,
    interactions,
  }
}
