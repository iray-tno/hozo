import type {
  CanvasScene,
  CanvasSceneNode,
  CanvasTransform,
  ClipProps,
} from './scene.tsx'

export interface CanvasPoint {
  x: number
  y: number
}

export interface CanvasHitTestViewport {
  /** Logical surface width in CSS pixels or React Native points. */
  width: number
  /** Logical surface height in CSS pixels or React Native points. */
  height: number
  viewBox?: readonly [x: number, y: number, width: number, height: number]
  fit?: 'contain' | 'stretch'
}

export interface CanvasHitTestResult {
  id: string
  /** Point in the root scene coordinate system, after the viewBox transform. */
  point: CanvasPoint
  /** Point after the target's ancestor transforms have also been inverted. */
  localPoint: CanvasPoint
}

type Matrix = readonly [
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
]

const identity: Matrix = [1, 0, 0, 1, 0, 0]

function multiply(left: Matrix, right: Matrix): Matrix {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ]
}

function translate(x: number, y: number): Matrix {
  return [1, 0, 0, 1, x, y]
}

function scale(x: number, y: number): Matrix {
  return [x, 0, 0, y, 0, 0]
}

function rotate(degrees: number): Matrix {
  const radians = degrees * Math.PI / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  return [cosine, sine, -sine, cosine, 0, 0]
}

function invert(matrix: Matrix): Matrix | undefined {
  const determinant = matrix[0] * matrix[3] - matrix[1] * matrix[2]
  if (!Number.isFinite(determinant) || Math.abs(determinant) < Number.EPSILON) return undefined
  return [
    matrix[3] / determinant,
    -matrix[1] / determinant,
    -matrix[2] / determinant,
    matrix[0] / determinant,
    (matrix[2] * matrix[5] - matrix[3] * matrix[4]) / determinant,
    (matrix[1] * matrix[4] - matrix[0] * matrix[5]) / determinant,
  ]
}

function apply(matrix: Matrix, point: CanvasPoint): CanvasPoint {
  return {
    x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
    y: matrix[1] * point.x + matrix[3] * point.y + matrix[5],
  }
}

function groupMatrix(transform?: CanvasTransform): Matrix {
  if (!transform) return identity
  const originX = transform.originX ?? 0
  const originY = transform.originY ?? 0
  let result = translate(transform.translateX ?? 0, transform.translateY ?? 0)
  if (originX !== 0 || originY !== 0) result = multiply(result, translate(originX, originY))
  if (transform.rotate) result = multiply(result, rotate(transform.rotate))
  result = multiply(result, scale(transform.scaleX ?? 1, transform.scaleY ?? 1))
  if (originX !== 0 || originY !== 0) result = multiply(result, translate(-originX, -originY))
  return result
}

function viewportMatrix(viewport: CanvasHitTestViewport): Matrix | undefined {
  if (viewport.width <= 0 || viewport.height <= 0) return undefined
  const viewBox = viewport.viewBox
  if (!viewBox) return identity
  if (viewBox[2] <= 0 || viewBox[3] <= 0) return undefined
  const scaleX = viewport.width / viewBox[2]
  const scaleY = viewport.height / viewBox[3]
  if ((viewport.fit ?? 'contain') === 'stretch') {
    return multiply(scale(scaleX, scaleY), translate(-viewBox[0], -viewBox[1]))
  }
  const uniformScale = Math.min(scaleX, scaleY)
  const offsetX = (viewport.width - viewBox[2] * uniformScale) / 2
  const offsetY = (viewport.height - viewBox[3] * uniformScale) / 2
  return multiply(
    multiply(translate(offsetX, offsetY), scale(uniformScale, uniformScale)),
    translate(-viewBox[0], -viewBox[1]),
  )
}

function normalRect(x: number, y: number, width: number, height: number) {
  return {
    x: width < 0 ? x + width : x,
    y: height < 0 ? y + height : y,
    width: Math.abs(width),
    height: Math.abs(height),
  }
}

function pointInRect(point: CanvasPoint, x: number, y: number, width: number, height: number) {
  const rect = normalRect(x, y, width, height)
  return rect.width > 0
    && rect.height > 0
    && point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height
}

function pointInRoundedRect(
  point: CanvasPoint,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const rect = normalRect(x, y, width, height)
  if (!pointInRect(point, rect.x, rect.y, rect.width, rect.height)) return false
  const cornerRadius = Math.max(0, Math.min(Math.abs(radius), rect.width / 2, rect.height / 2))
  if (cornerRadius === 0) return true
  const centerX = Math.max(rect.x + cornerRadius, Math.min(point.x, rect.x + rect.width - cornerRadius))
  const centerY = Math.max(rect.y + cornerRadius, Math.min(point.y, rect.y + rect.height - cornerRadius))
  const dx = point.x - centerX
  const dy = point.y - centerY
  return dx * dx + dy * dy <= cornerRadius * cornerRadius
}

function pointInNode(node: CanvasSceneNode, point: CanvasPoint) {
  switch (node.kind) {
    case 'rect':
      return pointInRect(
        point,
        node.props.x ?? 0,
        node.props.y ?? 0,
        node.props.width,
        node.props.height,
      )
    case 'rounded-rect':
      return pointInRoundedRect(
        point,
        node.props.x ?? 0,
        node.props.y ?? 0,
        node.props.width,
        node.props.height,
        node.props.radius,
      )
    case 'circle': {
      if (node.props.radius <= 0) return false
      const dx = point.x - node.props.cx
      const dy = point.y - node.props.cy
      return dx * dx + dy * dy <= node.props.radius * node.props.radius
    }
    case 'ellipse': {
      if (node.props.radiusX <= 0 || node.props.radiusY <= 0) return false
      const dx = (point.x - node.props.cx) / node.props.radiusX
      const dy = (point.y - node.props.cy) / node.props.radiusY
      return dx * dx + dy * dy <= 1
    }
    case 'line':
    case 'path':
    case 'group':
    case 'clip':
      return false
  }
}

function pointInClip(point: CanvasPoint, props: Omit<ClipProps, 'children'>) {
  if (props.path !== undefined) return false
  return pointInRect(point, props.x ?? 0, props.y ?? 0, props.width ?? 0, props.height ?? 0)
}

/**
 * Finds the topmost interactive geometry at a logical surface point.
 *
 * Rectangle clips and the four closed primitive shapes are portable today.
 * Path clips, paths, and lines deliberately refuse hits until both renderers
 * can implement the same contract.
 */
export function hitTestCanvas(
  scene: CanvasScene,
  surfacePoint: CanvasPoint,
  viewport: CanvasHitTestViewport,
  isInteractive: (id: string) => boolean,
): CanvasHitTestResult | undefined {
  const rootMatrix = viewportMatrix(viewport)
  if (!rootMatrix) return undefined
  const rootInverse = invert(rootMatrix)
  if (!rootInverse) return undefined
  const scenePoint = apply(rootInverse, surfacePoint)

  const visit = (nodes: CanvasScene, matrix: Matrix): CanvasHitTestResult | undefined => {
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const node = nodes[index]
      if (!node) continue
      if (node.kind === 'group') {
        const hit = visit(node.children, multiply(matrix, groupMatrix(node.props.transform)))
        if (hit) return hit
        continue
      }
      if (node.kind === 'clip') {
        const inverse = invert(matrix)
        if (!inverse || !pointInClip(apply(inverse, surfacePoint), node.props)) continue
        const hit = visit(node.children, matrix)
        if (hit) return hit
        continue
      }
      if (!node.id || !isInteractive(node.id)) continue
      const inverse = invert(matrix)
      if (!inverse) continue
      const localPoint = apply(inverse, surfacePoint)
      if (pointInNode(node, localPoint)) {
        return { id: node.id, point: scenePoint, localPoint }
      }
    }
    return undefined
  }

  return visit(scene, rootMatrix)
}
