import {
  type CanvasPaintProps,
  type CanvasScene,
  type CanvasSceneNode,
  type CanvasTransform,
  type ClipProps,
  cssFontShorthand,
  paintFills,
  paintStrokes,
  unhandledShape,
} from './scene.tsx'

export interface CanvasViewport {
  width: number
  height: number
  pixelRatio: number
  viewBox?: readonly [x: number, y: number, width: number, height: number]
  fit?: 'contain' | 'stretch'
}

function applyTransform(context: CanvasRenderingContext2D, transform?: CanvasTransform) {
  if (!transform) return
  const originX = transform.originX ?? 0
  const originY = transform.originY ?? 0
  context.translate(transform.translateX ?? 0, transform.translateY ?? 0)
  if (originX !== 0 || originY !== 0) context.translate(originX, originY)
  if (transform.rotate) context.rotate((transform.rotate * Math.PI) / 180)
  context.scale(transform.scaleX ?? 1, transform.scaleY ?? 1)
  if (originX !== 0 || originY !== 0) context.translate(-originX, -originY)
}

function applyPaint(context: CanvasRenderingContext2D, paint: CanvasPaintProps) {
  context.globalAlpha *= paint.opacity ?? 1
  if (paint.fill && paint.fill !== 'none') context.fillStyle = paint.fill
  if (paint.stroke && paint.stroke !== 'none') context.strokeStyle = paint.stroke
  if (paint.strokeWidth !== undefined) context.lineWidth = paint.strokeWidth
  if (paint.lineCap) context.lineCap = paint.lineCap
  if (paint.lineJoin) context.lineJoin = paint.lineJoin
}

function paints(
  paint: CanvasPaintProps,
  context: CanvasRenderingContext2D,
  fillRule?: CanvasFillRule,
) {
  if (paintFills(paint)) context.fill(fillRule)
  if (paintStrokes(paint)) context.stroke()
}

function pathForClip(context: CanvasRenderingContext2D, props: Omit<ClipProps, 'children'>) {
  if (props.path !== undefined) {
    if (typeof Path2D === 'undefined') {
      throw new Error(
        'This browser does not support Path2D, which Canvas.Path and path clips require.',
      )
    }
    context.clip(new Path2D(props.path))
    return
  }
  context.beginPath()
  context.rect(props.x ?? 0, props.y ?? 0, props.width ?? 0, props.height ?? 0)
  context.clip()
}

function drawNode(context: CanvasRenderingContext2D, node: CanvasSceneNode) {
  context.save()
  try {
    switch (node.kind) {
      case 'group':
        context.globalAlpha *= node.props.opacity ?? 1
        applyTransform(context, node.props.transform)
        for (const child of node.children) drawNode(context, child)
        return
      case 'clip':
        pathForClip(context, node.props)
        for (const child of node.children) drawNode(context, child)
        return
      case 'rect': {
        applyPaint(context, node.props)
        context.beginPath()
        context.rect(node.props.x ?? 0, node.props.y ?? 0, node.props.width, node.props.height)
        paints(node.props, context)
        return
      }
      case 'rounded-rect': {
        applyPaint(context, node.props)
        context.beginPath()
        const roundRect = (context as Partial<CanvasRenderingContext2D>).roundRect
        if (typeof roundRect === 'function') {
          roundRect.call(
            context,
            node.props.x ?? 0,
            node.props.y ?? 0,
            node.props.width,
            node.props.height,
            node.props.radius,
          )
        } else {
          // Older embedded WebViews get a correct shape, not a hard failure.
          const x = node.props.x ?? 0
          const y = node.props.y ?? 0
          const radius = Math.min(node.props.radius, node.props.width / 2, node.props.height / 2)
          context.moveTo(x + radius, y)
          context.arcTo(
            x + node.props.width,
            y,
            x + node.props.width,
            y + node.props.height,
            radius,
          )
          context.arcTo(
            x + node.props.width,
            y + node.props.height,
            x,
            y + node.props.height,
            radius,
          )
          context.arcTo(x, y + node.props.height, x, y, radius)
          context.arcTo(x, y, x + node.props.width, y, radius)
          context.closePath()
        }
        paints(node.props, context)
        return
      }
      case 'circle':
        applyPaint(context, node.props)
        context.beginPath()
        context.arc(node.props.cx, node.props.cy, node.props.radius, 0, Math.PI * 2)
        paints(node.props, context)
        return
      case 'ellipse':
        applyPaint(context, node.props)
        context.beginPath()
        context.ellipse(
          node.props.cx,
          node.props.cy,
          node.props.radiusX,
          node.props.radiusY,
          0,
          0,
          Math.PI * 2,
        )
        paints(node.props, context)
        return
      case 'line':
        applyPaint(context, node.props)
        context.beginPath()
        context.moveTo(node.props.x1, node.props.y1)
        context.lineTo(node.props.x2, node.props.y2)
        // A line is stroke-only; `fill` is accepted as part of the common
        // paint contract but intentionally has no geometrical meaning here.
        if (node.props.stroke !== 'none' && (node.props.strokeWidth ?? 1) > 0) context.stroke()
        return
      case 'text': {
        // `textAlign` is set on the context rather than measured here:
        // that is the renderer aligning against its own metrics, which is
        // the only measurement that can agree with what it rasterises.
        // `textBaseline` is left alone -- alphabetic is its default and
        // is the anchor `TextProps` documents.
        context.font = cssFontShorthand(node.props)
        context.textAlign = node.props.textAlign ?? 'left'
        applyPaint(context, node.props)
        if (paintFills(node.props)) context.fillText(node.props.text, node.props.x, node.props.y)
        if (paintStrokes(node.props)) {
          context.strokeText(node.props.text, node.props.x, node.props.y)
        }
        return
      }
      case 'path': {
        if (typeof Path2D === 'undefined') {
          throw new Error('This browser does not support Path2D, which Canvas.Path requires.')
        }
        applyPaint(context, node.props)
        const path = new Path2D(node.props.path)
        const hasFill =
          node.props.fill !== 'none' &&
          (node.props.fill !== undefined || node.props.stroke === undefined)
        const hasStroke = node.props.stroke !== undefined && node.props.stroke !== 'none'
        if (hasFill) context.fill(path, node.props.fillRule)
        if (hasStroke) context.stroke(path)
        return
      }
      default:
        unhandledShape(node, 'the Canvas2D renderer')
    }
  } finally {
    context.restore()
  }
}

/** Draws one immutable scene snapshot. Exported for custom renderers and deterministic tests. */
export function renderCanvas2D(
  context: CanvasRenderingContext2D,
  scene: CanvasScene,
  viewport: CanvasViewport,
) {
  const pixelRatio = Math.max(1, viewport.pixelRatio || 1)
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.clearRect(0, 0, viewport.width * pixelRatio, viewport.height * pixelRatio)
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)

  context.save()
  try {
    const viewBox = viewport.viewBox
    if (viewBox) {
      const [, , viewWidth, viewHeight] = viewBox
      if (viewWidth <= 0 || viewHeight <= 0) return
      const scaleX = viewport.width / viewWidth
      const scaleY = viewport.height / viewHeight
      if ((viewport.fit ?? 'contain') === 'stretch') {
        context.scale(scaleX, scaleY)
        context.translate(-viewBox[0], -viewBox[1])
      } else {
        const scale = Math.min(scaleX, scaleY)
        const offsetX = (viewport.width - viewWidth * scale) / 2
        const offsetY = (viewport.height - viewHeight * scale) / 2
        context.translate(offsetX, offsetY)
        context.scale(scale, scale)
        context.translate(-viewBox[0], -viewBox[1])
      }
    }
    for (const node of scene) drawNode(context, node)
  } finally {
    context.restore()
  }
}
