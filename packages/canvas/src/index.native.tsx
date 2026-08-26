import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native'
import {
  Canvas as SkiaCanvas,
  Circle as SkiaCircle,
  Group as SkiaGroup,
  Line as SkiaLine,
  Oval as SkiaOval,
  Path as SkiaPath,
  Rect as SkiaRect,
  RoundedRect as SkiaRoundedRect,
} from '@shopify/react-native-skia'

import {
  Circle,
  Clip,
  Ellipse,
  Group,
  Line,
  Path,
  Rect,
  RoundedRect,
  useCanvasScene,
  type CanvasPaintProps,
  type CanvasScene,
  type CanvasSceneNode,
  type CanvasTransform,
  type ClipProps,
} from './scene.tsx'

export type {
  CanvasPaintProps,
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

type AccessibleCanvas =
  | { decorative: true; accessibilityLabel?: never; accessibleFallback?: never }
  | { decorative?: false; accessibilityLabel: string; accessibleFallback?: ReactNode }
  | { decorative?: false; accessibilityLabel?: string; accessibleFallback: ReactNode }

export type CanvasProps = AccessibleCanvas & {
  children?: ReactNode
  className?: string
  style?: StyleProp<ViewStyle>
  width?: number
  height?: number
  viewBox?: readonly [x: number, y: number, width: number, height: number]
  fit?: 'contain' | 'stretch'
  testID?: string
}

function transformFor(transform?: CanvasTransform) {
  if (!transform) return undefined
  const result: Record<string, number>[] = []
  if (transform.translateX) result.push({ translateX: transform.translateX })
  if (transform.translateY) result.push({ translateY: transform.translateY })
  if (transform.rotate) result.push({ rotate: transform.rotate * Math.PI / 180 })
  if (transform.scaleX !== undefined) result.push({ scaleX: transform.scaleX })
  if (transform.scaleY !== undefined) result.push({ scaleY: transform.scaleY })
  return result
}

function paintLayers(
  key: string,
  Shape: typeof SkiaRect,
  geometry: Record<string, unknown>,
  paint: CanvasPaintProps,
) {
  const layers: ReactNode[] = []
  const hasFill = paint.fill !== 'none' && (paint.fill !== undefined || paint.stroke === undefined)
  const hasStroke = paint.stroke !== undefined && paint.stroke !== 'none' && (paint.strokeWidth ?? 1) > 0
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
          origin={node.props.transform
            ? { x: node.props.transform.originX ?? 0, y: node.props.transform.originY ?? 0 }
            : undefined}
        >
          {node.children.map((child, index) => renderNode(child, `${key}.${index}`))}
        </SkiaGroup>
      )
    case 'clip': {
      const props = node.props as Omit<ClipProps, 'children'>
      const clip = props.path !== undefined
        ? props.path
        : { x: props.x ?? 0, y: props.y ?? 0, width: props.width, height: props.height }
      return (
        <SkiaGroup key={key} clip={clip}>
          {node.children.map((child, index) => renderNode(child, `${key}.${index}`))}
        </SkiaGroup>
      )
    }
    case 'rect':
      return paintLayers(key, SkiaRect, {
        x: node.props.x ?? 0,
        y: node.props.y ?? 0,
        width: node.props.width,
        height: node.props.height,
      }, node.props)
    case 'rounded-rect':
      return paintLayers(key, SkiaRoundedRect, {
        x: node.props.x ?? 0,
        y: node.props.y ?? 0,
        width: node.props.width,
        height: node.props.height,
        r: node.props.radius,
      }, node.props)
    case 'circle':
      return paintLayers(key, SkiaCircle, {
        cx: node.props.cx,
        cy: node.props.cy,
        r: node.props.radius,
      }, node.props)
    case 'ellipse':
      return paintLayers(key, SkiaOval, {
        rect: {
          x: node.props.cx - node.props.radiusX,
          y: node.props.cy - node.props.radiusY,
          width: node.props.radiusX * 2,
          height: node.props.radiusY * 2,
        },
      }, node.props)
    case 'line':
      return paintLayers(key, SkiaLine, {
        p1: { x: node.props.x1, y: node.props.y1 },
        p2: { x: node.props.x2, y: node.props.y2 },
      }, { ...node.props, fill: 'none', stroke: node.props.stroke ?? 'black' })
    case 'path':
      return paintLayers(key, SkiaPath, {
        path: node.props.path,
        fillType: node.props.fillRule === 'evenodd' ? 'evenOdd' : 'winding',
      }, node.props)
  }
}

function viewportTransform(
  viewBox: CanvasProps['viewBox'],
  width: number,
  height: number,
  fit: CanvasProps['fit'],
): Record<string, number>[] | undefined {
  if (!viewBox || width <= 0 || height <= 0 || viewBox[2] <= 0 || viewBox[3] <= 0) return undefined
  const scaleX = width / viewBox[2]
  const scaleY = height / viewBox[3]
  if ((fit ?? 'contain') === 'stretch') {
    const result: Record<string, number>[] = []
    result.push({ scaleX })
    result.push({ scaleY })
    result.push({ translateX: -viewBox[0] })
    result.push({ translateY: -viewBox[1] })
    return result
  }
  const scale = Math.min(scaleX, scaleY)
  const result: Record<string, number>[] = []
  result.push({ translateX: (width - viewBox[2] * scale) / 2 })
  result.push({ translateY: (height - viewBox[3] * scale) / 2 })
  result.push({ scale })
  result.push({ translateX: -viewBox[0] })
  result.push({ translateY: -viewBox[1] })
  return result
}

function Scene({ scene, transform }: { scene: CanvasScene; transform?: Record<string, number>[] }) {
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
  const { scene, collector } = useCanvasScene(children)
  const [layout, setLayout] = useState({
    width: width ?? viewBox?.[2] ?? 0,
    height: height ?? viewBox?.[3] ?? 0,
  })
  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout
    setLayout((current) => current.width === next.width && current.height === next.height
      ? current
      : { width: next.width, height: next.height })
  }
  const transform = useMemo(
    () => viewportTransform(viewBox, layout.width, layout.height, fit),
    [viewBox, layout, fit],
  )
  const nativeClass = { className } as Record<string, unknown>

  return (
    <View
      {...nativeClass}
      style={[styles.root, width === undefined ? null : { width }, height === undefined ? null : { height }, style]}
      onLayout={onLayout}
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={decorative ? undefined : accessibilityLabel}
      testID={testID}
    >
      {collector}
      <SkiaCanvas style={StyleSheet.absoluteFill}>
        <Scene scene={scene} transform={transform} />
      </SkiaCanvas>
      {accessibleFallback
        ? <View style={styles.accessibleFallback}>{accessibleFallback}</View>
        : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { position: 'relative', overflow: 'hidden' },
  accessibleFallback: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    opacity: 0,
  },
})

/** Canvas root plus the same scene vocabulary exported on Web. */
export const Canvas = Object.assign(Root, {
  Group,
  Clip,
  Rect,
  RoundedRect,
  Circle,
  Ellipse,
  Line,
  Path,
})
