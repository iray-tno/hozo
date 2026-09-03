import {
  type DrawingNodeProps,
  matchFont,
  Canvas as SkiaCanvas,
  Circle as SkiaCircle,
  Group as SkiaGroup,
  Line as SkiaLine,
  Oval as SkiaOval,
  Path as SkiaPath,
  Rect as SkiaRect,
  RoundedRect as SkiaRoundedRect,
  Text as SkiaText,
  type Transforms3d,
} from '@shopify/react-native-skia'
import { type ComponentType, Fragment, type ReactNode, useMemo, useRef, useState } from 'react'
import {
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PointerEvent,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native'

import { type CanvasAccessibilityProps, canvasAccessibilityMode } from './accessibility.ts'
import { type CanvasPoint, hitTestCanvas } from './hit-test.ts'
import {
  type CanvasPaintProps,
  type CanvasScene,
  type CanvasSceneNode,
  Text as CanvasText,
  type CanvasTransform,
  Circle,
  Clip,
  type ClipProps,
  Ellipse,
  Group,
  Line,
  Path,
  paintFills,
  paintStrokes,
  Rect,
  RoundedRect,
  type TextProps,
  textFontSpec,
  useCanvasScene,
} from './scene.tsx'

export type { CanvasAccessibilityProps, CanvasAccessibleFallback } from './accessibility.ts'
export {
  type CanvasHitTestResult,
  type CanvasHitTestViewport,
  type CanvasPoint,
  hitTestCanvas,
} from './hit-test.ts'
export type {
  CanvasInteractionProps,
  CanvasPaintProps,
  CanvasPressEvent,
  CanvasScene,
  CanvasSceneNode,
  CanvasTransform,
  CircleProps,
  ClipProps,
  EllipseProps,
  GroupProps,
  LineProps,
  PathProps,
  RectProps,
  RoundedRectProps,
} from './scene.tsx'
export { CanvasSceneStore } from './scene.tsx'

export type CanvasProps = CanvasAccessibilityProps & {
  children?: ReactNode
  className?: string
  style?: StyleProp<ViewStyle>
  width?: number
  height?: number
  viewBox?: readonly [x: number, y: number, width: number, height: number]
  fit?: 'contain' | 'stretch'
  testID?: string
}

function transformFor(transform?: CanvasTransform): Transforms3d | undefined {
  if (!transform) return undefined
  // `Transforms3d` and not `Record<string, number>[]`: Skia's type is a
  // union of one-key objects, and the loose annotation is what let this
  // compile against a stub that checked nothing.
  const result: Transforms3d = []
  if (transform.translateX) result.push({ translateX: transform.translateX })
  if (transform.translateY) result.push({ translateY: transform.translateY })
  if (transform.rotate) result.push({ rotate: (transform.rotate * Math.PI) / 180 })
  if (transform.scaleX !== undefined) result.push({ scaleX: transform.scaleX })
  if (transform.scaleY !== undefined) result.push({ scaleY: transform.scaleY })
  return result
}

/**
 * One Skia element per painted channel, since Skia paints one at a time.
 *
 * Generic over the shape rather than typed `typeof SkiaRect` with the
 * geometry as `Record<string, unknown>`. That signature erased every
 * geometry prop, so nothing checked that a `Circle` was handed `cx`/`cy`
 * or a `Line` its two points -- and the hand-written module stub this
 * package used to carry declared every component as
 * `ComponentType<Record<string, unknown>>`, so nothing checked the paint
 * props either. Against Skia's own types, with the geometry kept, both are
 * checked.
 */
/**
 * The system face for a font spec, resolved once per spec.
 *
 * `matchFont` walks the platform's font manager, so calling it per text
 * node per frame would put that walk on every redraw. Keyed by the four
 * fields rather than by object identity, since the spec is rebuilt each
 * render.
 */
const fonts = new Map<string, ReturnType<typeof matchFont>>()
function fontFor(props: TextProps) {
  const spec = textFontSpec(props)
  const key = `${spec.fontStyle} ${spec.fontWeight} ${spec.fontSize} ${spec.fontFamily}`
  let font = fonts.get(key)
  if (!font) {
    font = matchFont(spec)
    fonts.set(key, font)
  }
  return font
}

/**
 * Where the run starts, given which part of it sits at `x`.
 *
 * Skia's `Text` draws from the left and has no alignment of its own, so
 * this measures. Canvas2D does not measure here -- it is told
 * `textAlign` and aligns against its own metrics, which is the only
 * measurement that can agree with what it rasterises. Two mechanisms for
 * one contract, because each renderer's metrics are its own.
 */
function alignedX(props: TextProps, font: ReturnType<typeof matchFont>) {
  const align = props.textAlign ?? 'left'
  if (align === 'left') return props.x
  const width = font.measureText(props.text).width
  return align === 'center' ? props.x - width / 2 : props.x - width
}

function paintLayers<Geometry extends object>(
  key: string,
  Shape: ComponentType<Geometry & DrawingNodeProps>,
  geometry: Geometry,
  paint: CanvasPaintProps,
) {
  const layers: ReactNode[] = []
  const hasFill = paintFills(paint)
  const hasStroke = paintStrokes(paint)
  if (hasFill) {
    layers.push(
      <Shape
        key={`${key}:fill`}
        {...geometry}
        color={paint.fill ?? 'black'}
        opacity={paint.opacity}
        style="fill"
      />,
    )
  }
  if (hasStroke) {
    layers.push(
      <Shape
        key={`${key}:stroke`}
        {...geometry}
        color={paint.stroke}
        opacity={paint.opacity}
        style="stroke"
        strokeWidth={paint.strokeWidth ?? 1}
        strokeCap={paint.lineCap}
        strokeJoin={paint.lineJoin}
      />,
    )
  }
  return layers
}

function renderNode(node: CanvasSceneNode, key: string): ReactNode {
  switch (node.kind) {
    case 'group':
      return (
        <SkiaGroup
          key={key}
          opacity={node.props.opacity}
          transform={transformFor(node.props.transform)}
          origin={
            node.props.transform
              ? { x: node.props.transform.originX ?? 0, y: node.props.transform.originY ?? 0 }
              : undefined
          }
        >
          {node.children.map((child, index) => renderNode(child, `${key}.${index}`))}
        </SkiaGroup>
      )
    case 'clip': {
      const props = node.props as Omit<ClipProps, 'children'>
      const clip =
        props.path !== undefined
          ? props.path
          : // `?? 0` on all four, as `pointInClip` and the Canvas2D renderer
            // already do. The union says a rectangle clip has a width, but
            // the scene node is reached through a cast, so nothing enforces
            // it -- and Skia given `undefined` clips to nothing in silence.
            {
              x: props.x ?? 0,
              y: props.y ?? 0,
              width: props.width ?? 0,
              height: props.height ?? 0,
            }
      return (
        <SkiaGroup key={key} clip={clip}>
          {node.children.map((child, index) => renderNode(child, `${key}.${index}`))}
        </SkiaGroup>
      )
    }
    case 'rect':
      return paintLayers(
        key,
        SkiaRect,
        {
          x: node.props.x ?? 0,
          y: node.props.y ?? 0,
          width: node.props.width,
          height: node.props.height,
        },
        node.props,
      )
    case 'rounded-rect':
      return paintLayers(
        key,
        SkiaRoundedRect,
        {
          x: node.props.x ?? 0,
          y: node.props.y ?? 0,
          width: node.props.width,
          height: node.props.height,
          r: node.props.radius,
        },
        node.props,
      )
    case 'circle':
      return paintLayers(
        key,
        SkiaCircle,
        {
          cx: node.props.cx,
          cy: node.props.cy,
          r: node.props.radius,
        },
        node.props,
      )
    case 'ellipse':
      return paintLayers(
        key,
        SkiaOval,
        {
          rect: {
            x: node.props.cx - node.props.radiusX,
            y: node.props.cy - node.props.radiusY,
            width: node.props.radiusX * 2,
            height: node.props.radiusY * 2,
          },
        },
        node.props,
      )
    case 'line':
      return paintLayers(
        key,
        SkiaLine,
        {
          p1: { x: node.props.x1, y: node.props.y1 },
          p2: { x: node.props.x2, y: node.props.y2 },
        },
        { ...node.props, fill: 'none', stroke: node.props.stroke ?? 'black' },
      )
    case 'text': {
      const font = fontFor(node.props)
      return paintLayers(
        key,
        SkiaText,
        { font, text: node.props.text, x: alignedX(node.props, font), y: node.props.y },
        node.props,
      )
    }
    case 'path':
      return paintLayers(
        key,
        SkiaPath,
        {
          path: node.props.path,
          // `as const` so this stays the enum Skia names rather than
          // widening to `string`. The mapping itself was already right;
          // nothing was checking it.
          fillType: node.props.fillRule === 'evenodd' ? ('evenOdd' as const) : ('winding' as const),
        },
        node.props,
      )
  }
}

function viewportTransform(
  viewBox: CanvasProps['viewBox'],
  width: number,
  height: number,
  fit: CanvasProps['fit'],
): Transforms3d | undefined {
  if (!viewBox || width <= 0 || height <= 0 || viewBox[2] <= 0 || viewBox[3] <= 0) return undefined
  const scaleX = width / viewBox[2]
  const scaleY = height / viewBox[3]
  if ((fit ?? 'contain') === 'stretch') {
    const result: Transforms3d = []
    result.push({ scaleX })
    result.push({ scaleY })
    result.push({ translateX: -viewBox[0] })
    result.push({ translateY: -viewBox[1] })
    return result
  }
  const scale = Math.min(scaleX, scaleY)
  const result: Transforms3d = []
  result.push({ translateX: (width - viewBox[2] * scale) / 2 })
  result.push({ translateY: (height - viewBox[3] * scale) / 2 })
  result.push({ scale })
  result.push({ translateX: -viewBox[0] })
  result.push({ translateY: -viewBox[1] })
  return result
}

function Scene({ scene, transform }: { scene: CanvasScene; transform?: Transforms3d }) {
  const nodes = scene.map((node, index) => renderNode(node, `root.${index}`))
  return transform ? <SkiaGroup transform={transform}>{nodes}</SkiaGroup> : nodes
}

function Root({
  children,
  className,
  style,
  width,
  height,
  viewBox,
  fit = 'contain',
  decorative,
  accessibilityLabel,
  accessibleFallback,
  testID,
}: CanvasProps) {
  const pressedTarget = useRef<{ id: string; touchId: number } | undefined>(undefined)
  const { scene, collector, isInteractive, press, activate } = useCanvasScene(children)
  const [layout, setLayout] = useState({
    width: width ?? viewBox?.[2] ?? 0,
    height: height ?? viewBox?.[3] ?? 0,
  })
  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout
    setLayout((current) =>
      current.width === next.width && current.height === next.height
        ? current
        : { width: next.width, height: next.height },
    )
  }
  const transform = useMemo(
    () => viewportTransform(viewBox, layout.width, layout.height, fit),
    [viewBox, layout, fit],
  )
  const hasValidViewport =
    !viewBox || (layout.width > 0 && layout.height > 0 && viewBox[2] > 0 && viewBox[3] > 0)
  const nativeClass = { className } as Record<string, unknown>
  const accessibilityMode = canvasAccessibilityMode({ decorative, accessibleFallback })
  const fallbackContent =
    typeof accessibleFallback === 'string' ||
    typeof accessibleFallback === 'number' ||
    typeof accessibleFallback === 'bigint' ? (
      <Text>{String(accessibleFallback)}</Text>
    ) : (
      accessibleFallback
    )
  const surfacePoint = (event: GestureResponderEvent): CanvasPoint => ({
    x: event.nativeEvent.locationX,
    y: event.nativeEvent.locationY,
  })
  const hitAt = (point: CanvasPoint) =>
    hitTestCanvas(
      scene,
      point,
      { width: layout.width, height: layout.height, viewBox, fit },
      isInteractive,
    )
  const onStartShouldSetResponder = (event: GestureResponderEvent) => {
    pressedTarget.current = undefined
    if (event.nativeEvent.touches.length !== 1) return false
    const hit = hitAt(surfacePoint(event))
    if (hit) {
      pressedTarget.current = { id: hit.id, touchId: event.nativeEvent.identifier }
      activate(hit.id, { point: hit.point, surfacePoint: surfacePoint(event) })
    }
    return hit !== undefined
  }
  const onResponderRelease = (event: GestureResponderEvent) => {
    const startedTarget = pressedTarget.current
    pressedTarget.current = undefined
    if (
      !startedTarget ||
      event.nativeEvent.touches.length > 0 ||
      event.nativeEvent.identifier !== startedTarget.touchId
    )
      return
    const point = surfacePoint(event)
    const hit = hitAt(point)
    activate(undefined, undefined)
    if (!hit || hit.id !== startedTarget.id) return
    press(hit.id, { point: hit.point, surfacePoint: point })
  }
  const onResponderTerminate = () => {
    pressedTarget.current = undefined
    activate(undefined, undefined)
  }

  /**
   * The same hover as the Web surface, from the same event.
   *
   * React Native's `View` declares the whole W3C pointer set and its
   * payload carries `pointerType` and `offsetX`/`offsetY`, so this is the
   * browser's handler with a different import. A tablet with a trackpad
   * and a phone with a mouse both reach it; a finger does not, and is
   * excluded by `pointerType` for the reason the Web side gives.
   *
   * Not verified on a device. The types and the prop declarations are as
   * far as this repository can check from here, and #26 asks for device
   * validation as an item of its own.
   */
  const pointerPoint = (event: PointerEvent): CanvasPoint => ({
    x: event.nativeEvent.offsetX,
    y: event.nativeEvent.offsetY,
  })
  const onPointerMove = (event: PointerEvent) => {
    if (event.nativeEvent.pointerType === 'touch') return
    const point = pointerPoint(event)
    const hit = hitAt(point)
    activate(hit?.id, hit ? { point: hit.point, surfacePoint: point } : undefined)
  }
  const onPointerLeave = () => activate(undefined, undefined)

  return (
    <View
      {...nativeClass}
      style={[
        styles.root,
        width === undefined ? null : { width },
        height === undefined ? null : { height },
        style,
      ]}
      onLayout={onLayout}
      accessible={accessibilityMode === 'label'}
      accessibilityRole={accessibilityMode === 'label' ? 'image' : undefined}
      accessibilityLabel={accessibilityMode === 'label' ? accessibilityLabel : undefined}
      testID={testID}
      onStartShouldSetResponder={onStartShouldSetResponder}
      onResponderRelease={onResponderRelease}
      onResponderTerminate={onResponderTerminate}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      {collector}
      <View
        style={StyleSheet.absoluteFill}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
      >
        <SkiaCanvas style={StyleSheet.absoluteFill}>
          {hasValidViewport ? <Scene scene={scene} transform={transform} /> : null}
        </SkiaCanvas>
      </View>
      {accessibilityMode === 'fallback' ? (
        <View style={styles.accessibleFallback} accessible={false} pointerEvents="none">
          {accessibilityLabel ? <Text>{accessibilityLabel}</Text> : null}
          {fallbackContent}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { position: 'relative', overflow: 'hidden' },
  accessibleFallback: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
  },
})

/** Canvas root plus the same scene vocabulary exported on Web. */
export const Canvas = Object.assign(Root, {
  Group,
  Clip,
  // Under a local alias only because React Native's own `Text` is in
  // scope in this module; the public name is the same on both surfaces.
  Text: CanvasText,
  Rect,
  RoundedRect,
  Circle,
  Ellipse,
  Line,
  Path,
})
