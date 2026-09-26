import type {
  CanvasMeshTexture,
  CanvasScene,
  CanvasSceneNode,
  CanvasTextureSource,
  CanvasTextureWrap,
} from '@hozo/canvas'
import {
  type ArrayCamera,
  BackSide,
  type BatchedMesh,
  type BufferAttribute,
  type BufferGeometry,
  ClampToEdgeWrapping,
  Color,
  DoubleSide,
  type InstancedMesh,
  type InterleavedBufferAttribute,
  LessEqualDepth,
  type LineBasicMaterial,
  type LineDashedMaterial,
  type LOD,
  type Material,
  Matrix4,
  Mesh,
  type MeshBasicMaterial,
  NearestFilter,
  NormalBlending,
  type Object3D,
  type OrthographicCamera,
  type PerspectiveCamera,
  type Plane,
  type Points,
  type PointsMaterial,
  RepeatWrapping,
  type Scene,
  type SkinnedMesh,
  type Sprite,
  type SpriteMaterial,
  SRGBColorSpace,
  type Texture,
  type Line as ThreeLine,
  UVMapping,
  Vector2,
  Vector3,
  Vector4,
} from 'three'

export type ThreeProjectionDiagnosticCode =
  | 'INVALID_VIEWPORT'
  | 'UNSUPPORTED_CAMERA'
  | 'UNSUPPORTED_GEOMETRY'
  | 'UNSUPPORTED_MATERIAL'
  | 'UNSUPPORTED_MESH'
  | 'UNSUPPORTED_OBJECT'
  | 'UNSUPPORTED_SCENE'

export interface ThreeProjectionDiagnostic {
  code: ThreeProjectionDiagnosticCode
  message: string
  object?: Object3D
}

export interface ThreeProjectionOptions {
  width: number
  height: number
  onDiagnostic?: (diagnostic: ThreeProjectionDiagnostic) => void
}

export interface ThreeProjection {
  scene: CanvasScene
  /** Source object for each scene node at the same index, absent for scene decoration. */
  objects: readonly (Object3D | undefined)[]
  diagnostics: readonly ThreeProjectionDiagnostic[]
}

interface ProjectedPrimitive {
  depth: number
  groupOrder: number
  object: Object3D
  order: number
  renderOrder: number
  transparent: boolean
  node: CanvasSceneNode
}

type CanvasStroke = Extract<CanvasSceneNode, { kind: 'line' }>['props']['stroke']

type SupportedCamera = PerspectiveCamera | OrthographicCamera
type SupportedFog = NonNullable<Scene['fog']>

function isColorBackground(background: Scene['background']): background is Color {
  return background !== null && (background as Color).isColor === true
}

function isTextureBackground(background: Scene['background']): background is Texture {
  return background !== null && (background as Texture).isTexture === true
}

function fogReason(fog: SupportedFog): string | undefined {
  if ((fog as SupportedFog & { isFogExp2?: boolean }).isFogExp2 === true) {
    const density = (fog as SupportedFog & { density: number }).density
    if (!Number.isFinite(density) || density < 0) {
      return 'FogExp2 density must be finite and non-negative.'
    }
    return undefined
  }
  const linear = fog as SupportedFog & { far: number; near: number }
  if (![linear.near, linear.far].every(Number.isFinite) || linear.far <= linear.near) {
    return 'Fog near and far must be finite, with far greater than near.'
  }
  return undefined
}

function fogFactor(fog: SupportedFog, viewDepth: number): number {
  if ((fog as SupportedFog & { isFogExp2?: boolean }).isFogExp2 === true) {
    const density = (fog as SupportedFog & { density: number }).density
    return Math.max(0, Math.min(1, 1 - Math.exp(-(density * density * viewDepth * viewDepth))))
  }
  const { near, far } = fog as SupportedFog & { far: number; near: number }
  const normalized = Math.max(0, Math.min(1, (viewDepth - near) / (far - near)))
  return normalized * normalized * (3 - 2 * normalized)
}

function foggedColorAtDepth(color: Color, fog: SupportedFog | null, viewDepth: number): Color {
  return fog ? color.clone().lerp(fog.color, fogFactor(fog, viewDepth)) : color.clone()
}

function foggedColorAtWorld(
  color: Color,
  fog: SupportedFog | null,
  world: Vector4,
  viewMatrix: Matrix4,
): Color {
  if (!fog) return color.clone()
  return foggedColorAtDepth(color, fog, -world.clone().applyMatrix4(viewMatrix).z)
}

const clipPlanes = [
  (point: Vector4) => point.w + point.x,
  (point: Vector4) => point.w - point.x,
  (point: Vector4) => point.w + point.y,
  (point: Vector4) => point.w - point.y,
  (point: Vector4) => point.w + point.z,
  (point: Vector4) => point.w - point.z,
] as const

function clippedPolygon(triangle: readonly Vector4[]): Vector4[] {
  let polygon = triangle.map((point) => point.clone())
  for (const distance of clipPlanes) {
    if (polygon.length === 0) return polygon
    const clipped: Vector4[] = []
    let previous = polygon.at(-1) as Vector4
    let previousDistance = distance(previous)
    for (const current of polygon) {
      const currentDistance = distance(current)
      const previousInside = previousDistance >= 0
      const currentInside = currentDistance >= 0
      if (previousInside !== currentInside) {
        const denominator = previousDistance - currentDistance
        if (denominator !== 0) {
          clipped.push(previous.clone().lerp(current, previousDistance / denominator))
        }
      }
      if (currentInside) clipped.push(current.clone())
      previous = current
      previousDistance = currentDistance
    }
    polygon = clipped
  }
  return polygon
}

interface ColouredVertex {
  color: Color
  position: Vector4
  viewDepth?: number
}

function interpolateColouredVertex(
  from: ColouredVertex,
  to: ColouredVertex,
  ratio: number,
): ColouredVertex {
  return {
    color: from.color.clone().lerp(to.color, ratio),
    position: from.position.clone().lerp(to.position, ratio),
    viewDepth:
      from.viewDepth === undefined || to.viewDepth === undefined
        ? undefined
        : from.viewDepth + (to.viewDepth - from.viewDepth) * ratio,
  }
}

function clippedColouredPolygon(triangle: readonly ColouredVertex[]): ColouredVertex[] {
  let polygon: ColouredVertex[] = triangle.map(({ color, position, viewDepth }) => ({
    color: color.clone(),
    position: position.clone(),
    viewDepth,
  }))
  for (const distance of clipPlanes) {
    if (polygon.length === 0) return polygon
    const clipped: ColouredVertex[] = []
    let previous = polygon.at(-1) as ColouredVertex
    let previousDistance = distance(previous.position)
    for (const current of polygon) {
      const currentDistance = distance(current.position)
      const previousInside = previousDistance >= 0
      const currentInside = currentDistance >= 0
      if (previousInside !== currentInside) {
        const denominator = previousDistance - currentDistance
        if (denominator !== 0) {
          clipped.push(interpolateColouredVertex(previous, current, previousDistance / denominator))
        }
      }
      if (currentInside) {
        clipped.push({
          color: current.color.clone(),
          position: current.position.clone(),
          viewDepth: current.viewDepth,
        })
      }
      previous = current
      previousDistance = currentDistance
    }
    polygon = clipped
  }
  return polygon
}

interface TexturedVertex {
  position: Vector4
  texture: Vector2
}

function cloneTexturedVertex(vertex: TexturedVertex): TexturedVertex {
  return { position: vertex.position.clone(), texture: vertex.texture.clone() }
}

function interpolateTexturedVertex(
  from: TexturedVertex,
  to: TexturedVertex,
  ratio: number,
): TexturedVertex {
  return {
    position: from.position.clone().lerp(to.position, ratio),
    texture: from.texture.clone().lerp(to.texture, ratio),
  }
}

function clippedTexturedPolygon(triangle: readonly TexturedVertex[]): TexturedVertex[] {
  let polygon = triangle.map(cloneTexturedVertex)
  for (const distance of clipPlanes) {
    if (polygon.length === 0) return polygon
    const clipped: TexturedVertex[] = []
    let previous = polygon.at(-1) as TexturedVertex
    let previousDistance = distance(previous.position)
    for (const current of polygon) {
      const currentDistance = distance(current.position)
      const previousInside = previousDistance >= 0
      const currentInside = currentDistance >= 0
      if (previousInside !== currentInside) {
        const denominator = previousDistance - currentDistance
        if (denominator !== 0) {
          clipped.push(interpolateTexturedVertex(previous, current, previousDistance / denominator))
        }
      }
      if (currentInside) clipped.push(cloneTexturedVertex(current))
      previous = current
      previousDistance = currentDistance
    }
    polygon = clipped
  }
  return polygon
}

function clippedSegment(from: Vector4, to: Vector4): readonly [Vector4, Vector4] | undefined {
  let start = from.clone()
  let end = to.clone()
  for (const distance of clipPlanes) {
    const startDistance = distance(start)
    const endDistance = distance(end)
    if (startDistance < 0 && endDistance < 0) return undefined
    if (startDistance >= 0 && endDistance >= 0) continue
    const crossing = start.clone().lerp(end, startDistance / (startDistance - endDistance))
    if (startDistance < 0) start = crossing
    else end = crossing
  }
  return [start, end]
}

function planeDistance(plane: Plane, point: Vector4): number {
  return (
    plane.normal.x * point.x + plane.normal.y * point.y + plane.normal.z * point.z + plane.constant
  )
}

function clippedMaterialPolygonSide(
  source: readonly Vector4[],
  plane: Plane,
  keepInside: boolean,
): Vector4[] {
  if (source.length === 0) return []
  const clipped: Vector4[] = []
  let previous = source.at(-1) as Vector4
  let previousDistance = planeDistance(plane, previous)
  for (const current of source) {
    const currentDistance = planeDistance(plane, current)
    const previousInside = keepInside ? previousDistance >= 0 : previousDistance < 0
    const currentInside = keepInside ? currentDistance >= 0 : currentDistance < 0
    if (previousInside !== currentInside) {
      const denominator = previousDistance - currentDistance
      if (denominator !== 0) {
        clipped.push(previous.clone().lerp(current, previousDistance / denominator))
      }
    }
    if (currentInside) clipped.push(current.clone())
    previous = current
    previousDistance = currentDistance
  }
  return clipped
}

function clippedMaterialPolygons(
  source: readonly Vector4[],
  planes: readonly Plane[],
  clipIntersection: boolean,
): readonly Vector4[][] {
  if (planes.length === 0) return [source.map((point) => point.clone())]
  if (!clipIntersection) {
    let polygon = source.map((point) => point.clone())
    for (const plane of planes) polygon = clippedMaterialPolygonSide(polygon, plane, true)
    return polygon.length >= 3 ? [polygon] : []
  }

  let remaining = source.map((point) => point.clone())
  const retained: Vector4[][] = []
  for (const plane of planes) {
    const inside = clippedMaterialPolygonSide(remaining, plane, true)
    if (inside.length >= 3) retained.push(inside)
    remaining = clippedMaterialPolygonSide(remaining, plane, false)
    if (remaining.length < 3) break
  }
  return retained
}

function clippedMaterialColouredPolygonSide(
  source: readonly ColouredVertex[],
  plane: Plane,
  keepInside: boolean,
): ColouredVertex[] {
  if (source.length === 0) return []
  const clipped: ColouredVertex[] = []
  let previous = source.at(-1) as ColouredVertex
  let previousDistance = planeDistance(plane, previous.position)
  for (const current of source) {
    const currentDistance = planeDistance(plane, current.position)
    const previousInside = keepInside ? previousDistance >= 0 : previousDistance < 0
    const currentInside = keepInside ? currentDistance >= 0 : currentDistance < 0
    if (previousInside !== currentInside) {
      const denominator = previousDistance - currentDistance
      if (denominator !== 0) {
        clipped.push(interpolateColouredVertex(previous, current, previousDistance / denominator))
      }
    }
    if (currentInside) {
      clipped.push({
        color: current.color.clone(),
        position: current.position.clone(),
        viewDepth: current.viewDepth,
      })
    }
    previous = current
    previousDistance = currentDistance
  }
  return clipped
}

function clippedMaterialColouredPolygons(
  source: readonly ColouredVertex[],
  planes: readonly Plane[],
  clipIntersection: boolean,
): readonly ColouredVertex[][] {
  const clone = (vertices: readonly ColouredVertex[]): ColouredVertex[] =>
    vertices.map(({ color, position, viewDepth }) => ({
      color: color.clone(),
      position: position.clone(),
      viewDepth,
    }))
  if (planes.length === 0) return [clone(source)]
  if (!clipIntersection) {
    let polygon = clone(source)
    for (const plane of planes) {
      polygon = clippedMaterialColouredPolygonSide(polygon, plane, true)
    }
    return polygon.length >= 3 ? [polygon] : []
  }

  let remaining = clone(source)
  const retained: ColouredVertex[][] = []
  for (const plane of planes) {
    const inside = clippedMaterialColouredPolygonSide(remaining, plane, true)
    if (inside.length >= 3) retained.push(inside)
    remaining = clippedMaterialColouredPolygonSide(remaining, plane, false)
    if (remaining.length < 3) break
  }
  return retained
}

function clippedMaterialTexturedPolygonSide(
  source: readonly TexturedVertex[],
  plane: Plane,
  keepInside: boolean,
): TexturedVertex[] {
  if (source.length === 0) return []
  const clipped: TexturedVertex[] = []
  let previous = source.at(-1) as TexturedVertex
  let previousDistance = planeDistance(plane, previous.position)
  for (const current of source) {
    const currentDistance = planeDistance(plane, current.position)
    const previousInside = keepInside ? previousDistance >= 0 : previousDistance < 0
    const currentInside = keepInside ? currentDistance >= 0 : currentDistance < 0
    if (previousInside !== currentInside) {
      const denominator = previousDistance - currentDistance
      if (denominator !== 0) {
        clipped.push(interpolateTexturedVertex(previous, current, previousDistance / denominator))
      }
    }
    if (currentInside) clipped.push(cloneTexturedVertex(current))
    previous = current
    previousDistance = currentDistance
  }
  return clipped
}

function clippedMaterialTexturedPolygons(
  source: readonly TexturedVertex[],
  planes: readonly Plane[],
  clipIntersection: boolean,
): readonly TexturedVertex[][] {
  if (planes.length === 0) return [source.map(cloneTexturedVertex)]
  if (!clipIntersection) {
    let polygon = source.map(cloneTexturedVertex)
    for (const plane of planes) {
      polygon = clippedMaterialTexturedPolygonSide(polygon, plane, true)
    }
    return polygon.length >= 3 ? [polygon] : []
  }

  let remaining = source.map(cloneTexturedVertex)
  const retained: TexturedVertex[][] = []
  for (const plane of planes) {
    const inside = clippedMaterialTexturedPolygonSide(remaining, plane, true)
    if (inside.length >= 3) retained.push(inside)
    remaining = clippedMaterialTexturedPolygonSide(remaining, plane, false)
    if (remaining.length < 3) break
  }
  return retained
}

function clippedMaterialSegmentSide(
  from: Vector4,
  to: Vector4,
  plane: Plane,
  keepInside: boolean,
): readonly [Vector4, Vector4] | undefined {
  const startDistance = planeDistance(plane, from)
  const endDistance = planeDistance(plane, to)
  const startInside = keepInside ? startDistance >= 0 : startDistance < 0
  const endInside = keepInside ? endDistance >= 0 : endDistance < 0
  if (!startInside && !endInside) return undefined
  if (startInside && endInside) return [from.clone(), to.clone()]
  const crossing = from.clone().lerp(to, startDistance / (startDistance - endDistance))
  return startInside ? [from.clone(), crossing] : [crossing, to.clone()]
}

function clippedMaterialSegments(
  from: Vector4,
  to: Vector4,
  planes: readonly Plane[],
  clipIntersection: boolean,
): readonly (readonly [Vector4, Vector4])[] {
  if (planes.length === 0) return [[from.clone(), to.clone()]]
  if (!clipIntersection) {
    let segment: readonly [Vector4, Vector4] | undefined = [from.clone(), to.clone()]
    for (const plane of planes) {
      segment = clippedMaterialSegmentSide(segment[0], segment[1], plane, true)
      if (!segment) return []
    }
    return [segment]
  }

  let remaining: readonly [Vector4, Vector4] | undefined = [from.clone(), to.clone()]
  const retained: (readonly [Vector4, Vector4])[] = []
  for (const plane of planes) {
    if (!remaining) break
    const inside = clippedMaterialSegmentSide(remaining[0], remaining[1], plane, true)
    if (inside) retained.push(inside)
    remaining = clippedMaterialSegmentSide(remaining[0], remaining[1], plane, false)
  }
  return retained
}

function segmentRatio(point: Vector4, from: Vector4, to: Vector4): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  const dw = to.w - from.w
  const denominator = dx * dx + dy * dy + dz * dz + dw * dw
  if (denominator === 0) return 0
  return Math.max(
    0,
    Math.min(
      1,
      ((point.x - from.x) * dx +
        (point.y - from.y) * dy +
        (point.z - from.z) * dz +
        (point.w - from.w) * dw) /
        denominator,
    ),
  )
}

function positiveModulo(value: number, divisor: number): number {
  return value - divisor * Math.floor(value / divisor)
}

function dashedSegments(
  from: Vector4,
  to: Vector4,
  fromDistance: number,
  toDistance: number,
  material: LineDashedMaterial,
): readonly (readonly [Vector4, Vector4])[] | undefined {
  const dashSize = material.dashSize
  const gapSize = material.gapSize
  const period = dashSize + gapSize
  if (dashSize === 0) return []
  if (gapSize === 0 || material.scale === 0 || fromDistance === toDistance) {
    const phase = positiveModulo(material.scale * fromDistance, period)
    return phase <= dashSize ? [[from, to]] : []
  }

  const scaledFrom = material.scale * fromDistance
  const scaledTo = material.scale * toDistance
  if (!Number.isFinite(scaledFrom) || !Number.isFinite(scaledTo)) return undefined
  const low = Math.min(scaledFrom, scaledTo)
  const high = Math.max(scaledFrom, scaledTo)
  const boundaries = [0, 1]
  const firstPeriod = Math.floor(low / period) - 1
  const lastPeriod = Math.ceil(high / period) + 1
  if (lastPeriod - firstPeriod > 10_000) return undefined
  for (let cycle = firstPeriod; cycle <= lastPeriod; cycle += 1) {
    for (const boundary of [cycle * period, cycle * period + dashSize]) {
      const ratio = (boundary - scaledFrom) / (scaledTo - scaledFrom)
      if (ratio > 0 && ratio < 1) boundaries.push(ratio)
    }
  }
  boundaries.sort((left, right) => left - right)

  const segments: [Vector4, Vector4][] = []
  for (let index = 0; index + 1 < boundaries.length; index += 1) {
    const start = boundaries[index]
    const end = boundaries[index + 1]
    if (start === undefined || end === undefined || end <= start) continue
    const midpoint = (start + end) / 2
    const distance = scaledFrom + (scaledTo - scaledFrom) * midpoint
    if (positiveModulo(distance, period) > dashSize) continue
    segments.push([from.clone().lerp(to, start), from.clone().lerp(to, end)])
  }
  return segments
}

function printable(value: number): string {
  const rounded = Math.abs(value) < 0.0000005 ? 0 : Number(value.toFixed(6))
  return String(rounded)
}

function projectedPoint(point: Vector4, width: number, height: number) {
  if (point.w === 0) return undefined
  const x = point.x / point.w
  const y = point.y / point.w
  const z = point.z / point.w
  if (![x, y, z].every(Number.isFinite)) return undefined
  return {
    x: ((x + 1) * width) / 2,
    y: ((1 - y) * height) / 2,
    z,
  }
}

type PositionAttribute = BufferAttribute | InterleavedBufferAttribute

interface PositionMorphState {
  attributes: readonly PositionAttribute[]
  baseInfluence: number
  influences: readonly number[]
}

function positionMorphState(
  geometry: BufferGeometry,
  influences: readonly number[] | undefined,
): PositionMorphState | undefined {
  const attributes = geometry.morphAttributes.position
  if (!influences || !attributes || attributes.length === 0) return undefined
  return {
    attributes,
    baseInfluence: geometry.morphTargetsRelative
      ? 1
      : 1 - influences.reduce((sum, influence) => sum + influence, 0),
    influences,
  }
}

function localPosition(
  position: PositionAttribute,
  vertexIndex: number,
  morph: PositionMorphState | undefined,
): Vector4 {
  const baseX = position.getX(vertexIndex)
  const baseY = position.getY(vertexIndex)
  const baseZ = position.getZ(vertexIndex)
  if (!morph) return new Vector4(baseX, baseY, baseZ, 1)

  let x = baseX * morph.baseInfluence
  let y = baseY * morph.baseInfluence
  let z = baseZ * morph.baseInfluence
  for (let index = 0; index < morph.attributes.length; index += 1) {
    const influence = morph.influences[index] ?? 0
    const attribute = morph.attributes[index]
    if (influence === 0 || !attribute) continue
    x += attribute.getX(vertexIndex) * influence
    y += attribute.getY(vertexIndex) * influence
    z += attribute.getZ(vertexIndex) * influence
  }
  return new Vector4(x, y, z, 1)
}

function signedArea(points: readonly { x: number; y: number }[]) {
  const [a, b, c] = points
  if (!a || !b || !c) return 0
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function baseMaterialReason(material: Material): string | undefined {
  if (material.blending !== NormalBlending) return 'non-default blending is not projected'
  if (!Number.isFinite(material.alphaTest)) return 'alphaTest must be finite'
  if (material.alphaHash) return 'alpha-hashed transparency needs per-fragment sampling'
  if (material.alphaToCoverage) return 'alpha-to-coverage needs an MSAA renderer'
  if (
    material.depthTest !== true ||
    material.depthWrite !== true ||
    material.depthFunc !== LessEqualDepth
  ) {
    return 'non-default depth material state is not projected'
  }
  if (material.stencilWrite) return 'stencil-writing materials are not projected'
  if (!material.colorWrite) return 'materials with colorWrite disabled are not projected'
  if (material.polygonOffset) return 'polygon-offset material state is not projected'
  if (material.dithering) return 'material dithering needs per-fragment sampling'
  return undefined
}

function passesUniformAlphaTest(material: Material): boolean {
  return material.alphaTest <= 0 || material.opacity >= material.alphaTest
}

function materialReason(material: MeshBasicMaterial): string | undefined {
  const baseReason = baseMaterialReason(material)
  if (baseReason) return baseReason
  if (!Number.isFinite(material.opacity)) return 'material opacity must be finite'
  if (
    material.alphaMap ||
    material.aoMap ||
    material.envMap ||
    material.lightMap ||
    material.specularMap
  ) {
    return 'only the primary MeshBasicMaterial map is projected'
  }
  if (material.map) {
    if (material.vertexColors) return 'texture and vertex-colour modulation is not projected yet'
    if (material.wireframe) return 'textured wireframes are not projected'
    if (material.color.getHex() !== 0xffffff) {
      return 'texture and material-colour modulation is not projected yet'
    }
    if (material.alphaTest > 0) return 'textured alphaTest needs per-pixel sampling'
  }
  return undefined
}

function textureSource(texture: Texture): CanvasTextureSource | undefined {
  const source = texture.source.data as unknown
  if (typeof source === 'string' || typeof source === 'number') return source
  if (!source || typeof source !== 'object') return undefined
  const candidate = source as { default?: unknown; src?: unknown; uri?: unknown }
  if (typeof candidate.uri === 'string') return { uri: candidate.uri }
  if (typeof candidate.src === 'string' && candidate.src.length > 0) return candidate.src
  if (typeof candidate.default === 'string') return { default: candidate.default }
  return undefined
}

function textureReason(texture: Texture, usesGeometryChannel = false): string | undefined {
  if (texture.mapping !== UVMapping) return 'portable colour textures need UVMapping'
  if (
    usesGeometryChannel &&
    (!Number.isInteger(texture.channel) || texture.channel < 0 || texture.channel > 3)
  ) {
    return 'texture channel must select uv, uv1, uv2, or uv3'
  }
  if (!textureWrap(texture)) {
    return 'texture wrapping must clamp or repeat; mirrored wrapping is not projected'
  }
  if (texture.colorSpace !== SRGBColorSpace) {
    return 'colour textures need SRGBColorSpace for portable Canvas sampling'
  }
  if (texture.premultiplyAlpha) return 'premultiplied texture alpha is not projected'
  if (!textureSource(texture)) return 'texture source needs a URL, URI, or Native asset ID'
  return undefined
}

function textureWrapAxis(wrap: number): CanvasTextureWrap | undefined {
  if (wrap === ClampToEdgeWrapping) return 'clamp'
  if (wrap === RepeatWrapping) return 'repeat'
  return undefined
}

function textureWrap(
  texture: Texture,
): readonly [CanvasTextureWrap, CanvasTextureWrap] | undefined {
  const wrapX = textureWrapAxis(texture.wrapS)
  const wrapY = textureWrapAxis(texture.wrapT)
  return wrapX && wrapY ? [wrapX, wrapY] : undefined
}

function textureWrapProps(texture: Texture): Pick<CanvasMeshTexture, 'wrap' | 'wrapX' | 'wrapY'> {
  const [wrapX, wrapY] = textureWrap(texture) ?? ['clamp', 'clamp']
  if (wrapX === wrapY) return wrapX === 'repeat' ? { wrap: 'repeat' } : {}
  return { wrapX, wrapY }
}

function textureAttributeName(texture: Texture): `uv${string}` {
  return texture.channel === 0 ? 'uv' : `uv${texture.channel}`
}

function portableTexturePoint(texture: Texture, x: number, y: number): Vector2 | undefined {
  const coordinate = new Vector2(x, y).applyMatrix3(texture.matrix)
  const [wrapX, wrapY] = textureWrap(texture) ?? ['clamp', 'clamp']
  if (
    !Number.isFinite(coordinate.x) ||
    !Number.isFinite(coordinate.y) ||
    (wrapX === 'clamp' && (coordinate.x < 0 || coordinate.x > 1)) ||
    (wrapY === 'clamp' && (coordinate.y < 0 || coordinate.y > 1))
  ) {
    return undefined
  }
  if (texture.flipY) coordinate.y = 1 - coordinate.y
  return coordinate
}

function portablePointTexturePoint(texture: Texture, x: number, y: number): Vector2 | undefined {
  const coordinate = new Vector2(x, y).applyMatrix3(texture.matrix)
  const [wrapX, wrapY] = textureWrap(texture) ?? ['clamp', 'clamp']
  if (
    !Number.isFinite(coordinate.x) ||
    !Number.isFinite(coordinate.y) ||
    (wrapX === 'clamp' && (coordinate.x < 0 || coordinate.x > 1)) ||
    (wrapY === 'clamp' && (coordinate.y < 0 || coordinate.y > 1))
  ) {
    return undefined
  }
  // Three's point shader already turns gl_PointCoord into top-left image space.
  // Only an upload that opts out of Three's usual flip needs reversing here.
  if (!texture.flipY) coordinate.y = 1 - coordinate.y
  return coordinate
}

function portableTextureCoordinate(
  texture: Texture,
  attribute: BufferAttribute | InterleavedBufferAttribute,
  vertexIndex: number,
): Vector2 | undefined {
  return portableTexturePoint(texture, attribute.getX(vertexIndex), attribute.getY(vertexIndex))
}

function canvasVertexColor(color: Color) {
  const value = { r: 0, g: 0, b: 0 }
  color.getRGB(value, SRGBColorSpace)
  return value
}

function lineMaterialReason(material: LineBasicMaterial): string | undefined {
  const baseReason = baseMaterialReason(material)
  if (baseReason) return baseReason
  if ((material as LineDashedMaterial).isLineDashedMaterial) {
    const dashed = material as LineDashedMaterial
    if (
      ![dashed.scale, dashed.dashSize, dashed.gapSize].every(Number.isFinite) ||
      dashed.dashSize < 0 ||
      dashed.gapSize < 0 ||
      dashed.dashSize + dashed.gapSize <= 0
    ) {
      return 'dashed line sizes and scale must be finite and non-negative'
    }
  }
  if (!Number.isFinite(material.opacity)) return 'line opacity must be finite'
  return undefined
}

function pointsMaterialReason(material: PointsMaterial): string | undefined {
  const baseReason = baseMaterialReason(material)
  if (baseReason) return baseReason
  if (!Number.isFinite(material.opacity)) return 'point opacity must be finite'
  if (material.alphaMap) return 'PointsMaterial alphaMap needs per-pixel sampling'
  if (material.map) {
    const mapReason = textureReason(material.map)
    if (mapReason) return mapReason
    if (material.vertexColors) return 'texture and per-point colour modulation is not projected yet'
    if (material.color.getHex() !== 0xffffff) {
      return 'texture and point-colour modulation is not projected yet'
    }
    if (material.alphaTest > 0) return 'textured alphaTest needs per-pixel sampling'
  }
  return undefined
}

function spriteMaterialReason(material: SpriteMaterial): string | undefined {
  const baseReason = baseMaterialReason(material)
  if (baseReason) return baseReason
  if (!Number.isFinite(material.opacity)) return 'sprite opacity must be finite'
  if (material.alphaMap) return 'SpriteMaterial alphaMap needs per-pixel sampling'
  if (material.map) {
    const mapReason = textureReason(material.map)
    if (mapReason) return mapReason
    if (material.color.getHex() !== 0xffffff) {
      return 'texture and sprite-colour modulation is not projected yet'
    }
    if (material.alphaTest > 0) return 'textured alphaTest needs per-pixel sampling'
  }
  return undefined
}

function projectedOpacity(material: Material): number | undefined {
  if (!material.transparent) return undefined
  const opacity = Math.max(0, Math.min(1, material.opacity))
  return opacity === 1 ? undefined : opacity
}

function projectedOpacityProps(material: Material): { opacity?: number } {
  const opacity = projectedOpacity(material)
  return opacity === undefined ? {} : { opacity }
}

function effectiveMaterial(original: Material, override: Material | null): Material {
  return override && original.allowOverride ? override : original
}

function isSupportedCamera(object: Object3D): object is SupportedCamera {
  const candidate = object as Partial<PerspectiveCamera & OrthographicCamera>
  return candidate.isPerspectiveCamera === true || candidate.isOrthographicCamera === true
}

function inheritedGroupOrder(object: Object3D, camera: SupportedCamera): number {
  let ancestor = object.parent
  while (ancestor) {
    if (
      (ancestor as Object3D & { isGroup?: boolean }).isGroup === true &&
      ancestor.layers.test(camera.layers)
    ) {
      return ancestor.renderOrder
    }
    ancestor = ancestor.parent
  }
  return 0
}

function diagnostic(
  diagnostics: ThreeProjectionDiagnostic[],
  options: ThreeProjectionOptions,
  value: ThreeProjectionDiagnostic,
) {
  diagnostics.push(value)
  options.onDiagnostic?.(value)
}

/**
 * Projects the deliberately portable part of a Three.js scene into Hozo's
 * retained 2D scene.
 *
 * This is not a software WebGL renderer. It accepts ordinary public Three.js
 * scene objects and preserves their world transforms, camera projection,
 * clip volume, face side and back-to-front order. Features whose correct
 * answer needs a GPU -- general texture sampling, blending and shaders among
 * them -- are omitted with a diagnostic rather than drawn approximately.
 */
function projectThreeSceneInternal(
  scene: Scene,
  camera: Object3D,
  options: ThreeProjectionOptions,
  includeSceneState: boolean,
): ThreeProjection {
  const diagnostics: ThreeProjectionDiagnostic[] = []
  if (!(options.width > 0) || !(options.height > 0)) {
    diagnostic(diagnostics, options, {
      code: 'INVALID_VIEWPORT',
      message: `Three projection needs a positive viewport; received ${options.width} x ${options.height}.`,
    })
    return { scene: [], objects: [], diagnostics }
  }
  const arrayCamera =
    (camera as Object3D & { isArrayCamera?: boolean }).isArrayCamera === true
      ? (camera as ArrayCamera)
      : undefined
  if (!arrayCamera && !isSupportedCamera(camera)) {
    diagnostic(diagnostics, options, {
      code: 'UNSUPPORTED_CAMERA',
      message: 'Only Three.js PerspectiveCamera and OrthographicCamera are portable.',
      object: camera,
    })
    return { scene: [], objects: [], diagnostics }
  }

  const decoration: CanvasSceneNode[] = []
  const decorationObjects: (Object3D | undefined)[] = []
  if (includeSceneState && isColorBackground(scene.background)) {
    decoration.push({
      kind: 'rect',
      props: {
        x: 0,
        y: 0,
        width: options.width,
        height: options.height,
        fill: `#${scene.background.getHexString()}`,
      },
    })
    decorationObjects.push(undefined)
  } else if (includeSceneState && isTextureBackground(scene.background)) {
    const background = scene.background
    let reason = textureReason(background)
    if (!reason && scene.backgroundBlurriness !== 0) {
      reason = 'blurred scene backgrounds need environment-map sampling'
    }
    if (!reason && scene.backgroundIntensity !== 1) {
      reason = 'scene backgroundIntensity needs per-pixel colour modulation'
    }
    if (background.matrixAutoUpdate) background.updateMatrix()
    const coordinates = [
      portableTexturePoint(background, 0, 1),
      portableTexturePoint(background, 1, 1),
      portableTexturePoint(background, 1, 0),
      portableTexturePoint(background, 0, 0),
    ]
    if (!reason && coordinates.some((coordinate) => coordinate === undefined)) {
      reason =
        'scene background texture coordinates must remain finite and inside 0..1 after the texture transform'
    }
    if (reason) {
      diagnostic(diagnostics, options, {
        code: 'UNSUPPORTED_SCENE',
        message: reason,
        object: scene,
      })
    } else {
      decoration.push({
        kind: 'triangle-mesh',
        props: {
          indices: [0, 1, 2, 0, 2, 3],
          texture: {
            source: textureSource(background) as CanvasTextureSource,
            coordinates: coordinates.map((coordinate) => ({
              x: (coordinate as Vector2).x,
              y: (coordinate as Vector2).y,
            })),
            filter: background.magFilter === NearestFilter ? 'nearest' : 'linear',
            ...textureWrapProps(background),
          },
          vertices: [
            { x: 0, y: 0 },
            { x: options.width, y: 0 },
            { x: options.width, y: options.height },
            { x: 0, y: options.height },
          ],
        },
      })
      decorationObjects.push(undefined)
    }
  } else if (includeSceneState && scene.background !== null) {
    diagnostic(diagnostics, options, {
      code: 'UNSUPPORTED_SCENE',
      message: 'This scene background type is not projected yet.',
      object: scene,
    })
  }

  if (includeSceneState && scene.fog !== null) {
    const reason = fogReason(scene.fog)
    if (reason) {
      diagnostic(diagnostics, options, {
        code: 'UNSUPPORTED_SCENE',
        message: reason,
        object: scene,
      })
      return { scene: decoration, objects: decorationObjects, diagnostics }
    }
  }

  if (arrayCamera) {
    for (const subCamera of arrayCamera.cameras) {
      const viewport = (subCamera as PerspectiveCamera & { viewport?: Vector4 }).viewport
      if (!viewport) {
        diagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_CAMERA',
          message: 'Every ArrayCamera sub-camera needs a viewport.',
          object: subCamera,
        })
        continue
      }
      const projected = projectThreeSceneInternal(
        scene,
        subCamera,
        {
          width: viewport.z,
          height: viewport.w,
          onDiagnostic: options.onDiagnostic,
        },
        false,
      )
      diagnostics.push(...projected.diagnostics)
      const translateX = viewport.x
      const translateY = options.height - viewport.y - viewport.w
      for (let index = 0; index < projected.scene.length; index += 1) {
        const node = projected.scene[index]
        if (!node) continue
        decoration.push({
          kind: 'group',
          props: { transform: { translateX, translateY } },
          children: [node],
        })
        decorationObjects.push(projected.objects[index])
      }
    }
    return { scene: decoration, objects: decorationObjects, diagnostics }
  }
  if (!isSupportedCamera(camera))
    return { scene: decoration, objects: decorationObjects, diagnostics }

  scene.updateMatrixWorld(true)
  camera.updateMatrixWorld(true)
  const viewProjection = new Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  )
  const primitives: ProjectedPrimitive[] = []
  let order = 0

  scene.traverseVisible((object) => {
    const candidate = object as Partial<Mesh & Points & ThreeLine> & {
      isBatchedMesh?: boolean
      isLOD?: boolean
      isSprite?: boolean
    }
    if (candidate.isLOD === true) {
      const lod = object as LOD
      if (lod.layers.test(camera.layers) && lod.autoUpdate) lod.update(camera)
      return
    }
    if (!object.layers.test(camera.layers)) return
    const groupOrder = inheritedGroupOrder(object, camera)
    if (candidate.isSprite === true) {
      const sprite = object as Sprite
      if (sprite.count <= 0) return
      if (sprite.material.visible === false) return
      const material = effectiveMaterial(
        sprite.material,
        scene.overrideMaterial,
      ) as Partial<SpriteMaterial>
      if (material.isSpriteMaterial !== true) {
        diagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_MATERIAL',
          message: 'The portable sprite subset currently accepts SpriteMaterial only.',
          object,
        })
        return
      }
      const reason = spriteMaterialReason(material as SpriteMaterial)
      if (reason) {
        diagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_MATERIAL',
          message: reason,
          object,
        })
        return
      }
      if (!passesUniformAlphaTest(material as SpriteMaterial)) return

      const spriteMaterial = material as SpriteMaterial
      const spriteMap = spriteMaterial.map
      if (spriteMap && spriteMaterial.fog && scene.fog) {
        diagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_MATERIAL',
          message: 'texture and sprite fog modulation is not projected yet',
          object,
        })
        return
      }
      if (spriteMap?.matrixAutoUpdate) spriteMap.updateMatrix()
      const modelView = new Matrix4().multiplyMatrices(
        camera.matrixWorldInverse,
        sprite.matrixWorld,
      )
      const world = sprite.matrixWorld.elements
      let scaleX = Math.hypot(world[0] ?? 0, world[1] ?? 0, world[2] ?? 0)
      let scaleY = Math.hypot(world[4] ?? 0, world[5] ?? 0, world[6] ?? 0)
      const viewX = modelView.elements[12] ?? 0
      const viewY = modelView.elements[13] ?? 0
      const viewZ = modelView.elements[14] ?? 0
      const spriteColor = foggedColorAtDepth(
        spriteMaterial.color,
        spriteMaterial.fog ? scene.fog : null,
        -viewZ,
      )
      if (
        (camera as Partial<PerspectiveCamera>).isPerspectiveCamera === true &&
        !spriteMaterial.sizeAttenuation
      ) {
        scaleX *= -viewZ
        scaleY *= -viewZ
      }
      const cosine = Math.cos(spriteMaterial.rotation)
      const sine = Math.sin(spriteMaterial.rotation)
      const corners = [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
      ] as const
      const spriteTexture = spriteMap
        ? [
            portableTexturePoint(spriteMap, 0, 0),
            portableTexturePoint(spriteMap, 1, 0),
            portableTexturePoint(spriteMap, 1, 1),
            portableTexturePoint(spriteMap, 0, 1),
          ]
        : undefined
      if (spriteTexture?.some((coordinate) => coordinate === undefined)) {
        diagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_MATERIAL',
          message:
            'sprite texture coordinates must remain finite and inside 0..1 after the texture transform',
          object,
        })
        return
      }
      const worldCorners = corners.map(([x, y]) => {
        const alignedX = (x - (sprite.center.x - 0.5)) * scaleX
        const alignedY = (y - (sprite.center.y - 0.5)) * scaleY
        return new Vector4(
          viewX + cosine * alignedX - sine * alignedY,
          viewY + sine * alignedX + cosine * alignedY,
          viewZ,
          1,
        ).applyMatrix4(camera.matrixWorld)
      })
      const materialPolygons = spriteTexture
        ? clippedMaterialTexturedPolygons(
            worldCorners.map((position, index) => ({
              position,
              texture: spriteTexture[index] as Vector2,
            })),
            (spriteMaterial.clippingPlanes ?? []) as readonly Plane[],
            spriteMaterial.clipIntersection,
          )
        : clippedMaterialPolygons(
            worldCorners,
            (spriteMaterial.clippingPlanes ?? []) as readonly Plane[],
            spriteMaterial.clipIntersection,
          )
      for (const materialPolygon of materialPolygons) {
        const polygon = spriteTexture
          ? clippedTexturedPolygon(
              (materialPolygon as TexturedVertex[]).map(({ position, texture }) => ({
                position: position.clone().applyMatrix4(viewProjection),
                texture,
              })),
            )
          : clippedPolygon(
              (materialPolygon as Vector4[]).map((point) => point.applyMatrix4(viewProjection)),
            )
        if (polygon.length < 3) continue
        const projected = polygon.map((point) =>
          projectedPoint(
            spriteTexture ? (point as TexturedVertex).position : (point as Vector4),
            options.width,
            options.height,
          ),
        )
        if (projected.some((point) => point === undefined)) continue
        const points = projected as { x: number; y: number; z: number }[]
        const [first, ...rest] = points
        if (!first) continue
        const path = spriteTexture
          ? undefined
          : `M ${printable(first.x)} ${printable(first.y)} ${rest
              .map((point) => `L ${printable(point.x)} ${printable(point.y)}`)
              .join(' ')} Z`
        const indices: number[] = []
        for (let fan = 1; fan + 1 < points.length; fan += 1) indices.push(0, fan, fan + 1)
        primitives.push({
          depth: points.reduce((sum, point) => sum + point.z, 0) / points.length,
          groupOrder,
          object,
          order: order++,
          renderOrder: object.renderOrder,
          transparent: spriteMaterial.transparent,
          node:
            spriteTexture && spriteMap
              ? {
                  kind: 'triangle-mesh',
                  props: {
                    indices,
                    texture: {
                      source: textureSource(spriteMap) as CanvasTextureSource,
                      coordinates: (polygon as TexturedVertex[]).map(({ texture }) => ({
                        x: texture.x,
                        y: texture.y,
                      })),
                      filter: spriteMap.magFilter === NearestFilter ? 'nearest' : 'linear',
                      ...textureWrapProps(spriteMap),
                    },
                    vertices: points.map(({ x, y }) => ({ x, y })),
                    ...projectedOpacityProps(spriteMaterial),
                  },
                }
              : {
                  kind: 'path',
                  props: {
                    path: path as string,
                    fill: `#${spriteColor.getHexString()}`,
                    ...projectedOpacityProps(spriteMaterial),
                  },
                },
        })
      }
      return
    }
    if (candidate.isLine === true) {
      const line = object as ThreeLine
      if (Array.isArray(line.material)) {
        diagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_MATERIAL',
          message: 'Material arrays and geometry groups are not projected yet.',
          object,
        })
        return
      }
      if (line.material.visible === false) return
      const material = effectiveMaterial(
        line.material,
        scene.overrideMaterial,
      ) as Partial<LineBasicMaterial>
      if (material.isLineBasicMaterial !== true) {
        diagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_MATERIAL',
          message: 'The portable line subset currently accepts LineBasicMaterial only.',
          object,
        })
        return
      }
      const reason = lineMaterialReason(material as LineBasicMaterial)
      if (reason) {
        diagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_MATERIAL',
          message: reason,
          object,
        })
        return
      }
      if (
        !(material as LineDashedMaterial).isLineDashedMaterial &&
        !passesUniformAlphaTest(material as LineBasicMaterial)
      ) {
        return
      }
      const position = line.geometry.getAttribute('position')
      if (!position || position.itemSize < 3) {
        diagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_GEOMETRY',
          message: 'BufferGeometry needs a position attribute with three components.',
          object,
        })
        return
      }
      const index = line.geometry.getIndex()
      const available = index?.count ?? position.count
      const start = Math.max(0, Math.floor(line.geometry.drawRange.start))
      const requested = line.geometry.drawRange.count
      const end = Math.min(available, Number.isFinite(requested) ? start + requested : available)
      const morph = positionMorphState(line.geometry, line.morphTargetInfluences)
      const lineDistance = line.geometry.getAttribute('lineDistance')
      const dashedMaterial = (material as LineDashedMaterial).isLineDashedMaterial
        ? (material as LineDashedMaterial)
        : undefined
      const color = material.vertexColors ? line.geometry.getAttribute('color') : undefined
      if (color && color.itemSize !== 3) {
        diagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_GEOMETRY',
          message:
            'Portable line colour attributes must be RGB; per-vertex alpha is not projected.',
          object,
        })
        return
      }
      const vertex = (offset: number) => {
        const vertexIndex = index ? index.getX(offset) : offset
        return localPosition(position, vertexIndex, morph).applyMatrix4(line.matrixWorld)
      }
      const distance = (offset: number) => {
        const vertexIndex = index ? index.getX(offset) : offset
        return lineDistance?.getX(vertexIndex) ?? 0
      }
      const stroke = `#${(material as LineBasicMaterial).color.getHexString()}`
      const strokeWidth = Math.max(0, (material as LineBasicMaterial).linewidth)
      if (strokeWidth === 0) return
      const segments: [number, number][] = []
      const primitiveStart = primitives.length
      if ((line as ThreeLine & { isLineSegments?: boolean }).isLineSegments) {
        for (let offset = start; offset + 1 < end; offset += 2) {
          segments.push([offset, offset + 1])
        }
      } else {
        for (let offset = start; offset + 1 < end; offset += 1) {
          segments.push([offset, offset + 1])
        }
        if ((line as ThreeLine & { isLineLoop?: boolean }).isLineLoop && end - start > 1) {
          segments.push([end - 1, start])
        }
      }
      for (const [fromOffset, toOffset] of segments) {
        const fromVertex = vertex(fromOffset)
        const toVertex = vertex(toOffset)
        const materialColor = (material as LineBasicMaterial).color
        const fromIndex = index ? index.getX(fromOffset) : fromOffset
        const toIndex = index ? index.getX(toOffset) : toOffset
        const fromColor = color
          ? new Color(color.getX(fromIndex), color.getY(fromIndex), color.getZ(fromIndex)).multiply(
              materialColor,
            )
          : materialColor
        const toColor = color
          ? new Color(color.getX(toIndex), color.getY(toIndex), color.getZ(toIndex)).multiply(
              materialColor,
            )
          : materialColor
        const colorAt = (world: Vector4) => {
          const base = fromColor.clone().lerp(toColor, segmentRatio(world, fromVertex, toVertex))
          return foggedColorAtWorld(
            base,
            (material as LineBasicMaterial).fog ? scene.fog : null,
            world,
            camera.matrixWorldInverse,
          )
        }
        const pieces = dashedMaterial
          ? dashedSegments(
              fromVertex,
              toVertex,
              distance(fromOffset),
              distance(toOffset),
              dashedMaterial,
            )
          : ([[fromVertex, toVertex]] as const)
        if (!pieces) {
          primitives.splice(primitiveStart)
          diagnostic(diagnostics, options, {
            code: 'UNSUPPORTED_GEOMETRY',
            message: 'Dashed line expansion exceeds the portable 10,000-interval limit.',
            object,
          })
          return
        }
        for (const piece of pieces) {
          const materialClippedSegments = clippedMaterialSegments(
            piece[0],
            piece[1],
            (material.clippingPlanes ?? []) as readonly Plane[],
            material.clipIntersection ?? false,
          )
          for (const materialClipped of materialClippedSegments) {
            const materialFromClip = materialClipped[0].clone().applyMatrix4(viewProjection)
            const materialToClip = materialClipped[1].clone().applyMatrix4(viewProjection)
            const clipped = clippedSegment(materialFromClip, materialToClip)
            if (!clipped) continue
            const from = projectedPoint(clipped[0], options.width, options.height)
            const to = projectedPoint(clipped[1], options.width, options.height)
            if (!from || !to || (from.x === to.x && from.y === to.y)) continue
            let projectedStroke: CanvasStroke = stroke
            if (color || ((material as LineBasicMaterial).fog && scene.fog)) {
              const clippedFromWorld = materialClipped[0]
                .clone()
                .lerp(
                  materialClipped[1],
                  segmentRatio(clipped[0], materialFromClip, materialToClip),
                )
              const clippedToWorld = materialClipped[0]
                .clone()
                .lerp(
                  materialClipped[1],
                  segmentRatio(clipped[1], materialFromClip, materialToClip),
                )
              const clippedFromColor = colorAt(clippedFromWorld)
              const clippedToColor = colorAt(clippedToWorld)
              projectedStroke = {
                kind: 'linear',
                from: { x: from.x, y: from.y },
                to: { x: to.x, y: to.y },
                stops: [
                  { offset: 0, color: `#${clippedFromColor.getHexString()}` },
                  { offset: 1, color: `#${clippedToColor.getHexString()}` },
                ],
              }
            }
            primitives.push({
              depth: (from.z + to.z) / 2,
              groupOrder,
              object,
              order: order++,
              renderOrder: object.renderOrder,
              transparent: material.transparent ?? false,
              node: {
                kind: 'line',
                props: {
                  x1: from.x,
                  y1: from.y,
                  x2: to.x,
                  y2: to.y,
                  stroke: projectedStroke,
                  strokeWidth,
                  ...projectedOpacityProps(material as LineBasicMaterial),
                },
              },
            })
          }
        }
      }
      return
    }
    if (candidate.isPoints === true) {
      const points = object as Points
      if (Array.isArray(points.material)) {
        diagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_MATERIAL',
          message: 'Material arrays and geometry groups are not projected yet.',
          object,
        })
        return
      }
      if (points.material.visible === false) return
      const material = effectiveMaterial(
        points.material,
        scene.overrideMaterial,
      ) as Partial<PointsMaterial>
      if (material.isPointsMaterial !== true) {
        diagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_MATERIAL',
          message: 'The portable point subset currently accepts PointsMaterial only.',
          object,
        })
        return
      }
      const reason = pointsMaterialReason(material as PointsMaterial)
      if (reason) {
        diagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_MATERIAL',
          message: reason,
          object,
        })
        return
      }
      if (!passesUniformAlphaTest(material as PointsMaterial)) return
      const position = points.geometry.getAttribute('position')
      if (!position || position.itemSize < 3) {
        diagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_GEOMETRY',
          message: 'BufferGeometry needs a position attribute with three components.',
          object,
        })
        return
      }
      const index = points.geometry.getIndex()
      const available = index?.count ?? position.count
      const start = Math.max(0, Math.floor(points.geometry.drawRange.start))
      const requested = points.geometry.drawRange.count
      const end = Math.min(available, Number.isFinite(requested) ? start + requested : available)
      const pointMaterial = material as PointsMaterial
      const pointMap = pointMaterial.map
      if (pointMap && pointMaterial.fog && scene.fog) {
        diagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_MATERIAL',
          message: 'texture and point fog modulation is not projected yet',
          object,
        })
        return
      }
      if (pointMap && points.geometry.getAttribute('uv')) {
        diagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_GEOMETRY',
          message:
            'Points geometry UVs sample one texel per point; the portable backend supports point-sprite map coordinates only.',
          object,
        })
        return
      }
      if (pointMap?.matrixAutoUpdate) pointMap.updateMatrix()
      const pointTexture = pointMap
        ? [
            portablePointTexturePoint(pointMap, 0, 0),
            portablePointTexturePoint(pointMap, 1, 0),
            portablePointTexturePoint(pointMap, 1, 1),
            portablePointTexturePoint(pointMap, 0, 1),
          ]
        : undefined
      if (pointTexture?.some((coordinate) => coordinate === undefined)) {
        diagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_MATERIAL',
          message:
            'point texture coordinates must remain finite and inside 0..1 after the texture transform',
          object,
        })
        return
      }
      const color = pointMaterial.vertexColors ? points.geometry.getAttribute('color') : undefined
      if (color && color.itemSize !== 3) {
        diagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_GEOMETRY',
          message:
            'Portable point colour attributes must be RGB; per-vertex alpha is not projected.',
          object,
        })
        return
      }
      const morph = positionMorphState(points.geometry, points.morphTargetInfluences)
      const fillColor = new Color()
      const materialPlanes = (pointMaterial.clippingPlanes ?? []) as readonly Plane[]
      for (let offset = start; offset < end; offset += 1) {
        const vertexIndex = index ? index.getX(offset) : offset
        const world = localPosition(position, vertexIndex, morph).applyMatrix4(points.matrixWorld)
        const insideMaterialPlanes = pointMaterial.clipIntersection
          ? materialPlanes.length === 0 ||
            materialPlanes.some((plane) => planeDistance(plane, world) >= 0)
          : materialPlanes.every((plane) => planeDistance(plane, world) >= 0)
        if (!insideMaterialPlanes) {
          continue
        }
        const view = world.clone().applyMatrix4(camera.matrixWorldInverse)
        const clip = view.clone().applyMatrix4(camera.projectionMatrix)
        if (!clipPlanes.every((distance) => distance(clip) >= 0)) continue
        const projected = projectedPoint(clip, options.width, options.height)
        if (!projected) continue
        const diameter =
          (camera as Partial<PerspectiveCamera>).isPerspectiveCamera === true &&
          pointMaterial.sizeAttenuation
            ? (pointMaterial.size * options.height) / 2 / -view.z
            : pointMaterial.size
        const radius = diameter / 2
        if (!(radius > 0) || !Number.isFinite(radius)) continue
        fillColor.copy(pointMaterial.color)
        if (color) {
          fillColor.r *= color.getX(vertexIndex)
          fillColor.g *= color.getY(vertexIndex)
          fillColor.b *= color.getZ(vertexIndex)
        }
        const projectedFill = foggedColorAtDepth(
          fillColor,
          pointMaterial.fog ? scene.fog : null,
          -view.z,
        )
        primitives.push({
          depth: projected.z,
          groupOrder,
          object,
          order: order++,
          renderOrder: object.renderOrder,
          transparent: pointMaterial.transparent,
          node:
            pointTexture && pointMap
              ? {
                  kind: 'triangle-mesh',
                  props: {
                    indices: [0, 1, 2, 0, 2, 3],
                    texture: {
                      source: textureSource(pointMap) as CanvasTextureSource,
                      coordinates: pointTexture.map((coordinate) => ({
                        x: (coordinate as Vector2).x,
                        y: (coordinate as Vector2).y,
                      })),
                      filter: pointMap.magFilter === NearestFilter ? 'nearest' : 'linear',
                      ...textureWrapProps(pointMap),
                    },
                    vertices: [
                      { x: projected.x - radius, y: projected.y - radius },
                      { x: projected.x + radius, y: projected.y - radius },
                      { x: projected.x + radius, y: projected.y + radius },
                      { x: projected.x - radius, y: projected.y + radius },
                    ],
                    ...projectedOpacityProps(pointMaterial),
                  },
                }
              : {
                  kind: 'circle',
                  props: {
                    cx: projected.x,
                    cy: projected.y,
                    radius,
                    fill: `#${projectedFill.getHexString()}`,
                    ...projectedOpacityProps(pointMaterial),
                  },
                },
        })
      }
      return
    }
    if (candidate.isMesh !== true) return
    const mesh = object as Mesh
    const batchedMesh = candidate.isBatchedMesh === true ? (mesh as BatchedMesh) : undefined
    const instancedMesh = (mesh as Mesh & { isInstancedMesh?: boolean }).isInstancedMesh
      ? (mesh as InstancedMesh)
      : undefined
    const skinnedMesh = (mesh as Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh
      ? (mesh as SkinnedMesh)
      : undefined
    const position = mesh.geometry.getAttribute('position')
    if (!position || position.itemSize < 3) {
      diagnostic(diagnostics, options, {
        code: 'UNSUPPORTED_GEOMETRY',
        message: 'BufferGeometry needs a position attribute with three components.',
        object,
      })
      return
    }
    const vertexColor = mesh.geometry.getAttribute('color')
    const index = mesh.geometry.getIndex()
    const available = index?.count ?? position.count
    const drawStart = Math.max(0, Math.floor(mesh.geometry.drawRange.start))
    const requested = mesh.geometry.drawRange.count
    const drawEnd = Math.min(
      available,
      Number.isFinite(requested) ? Math.floor(drawStart + requested) : available,
    )
    type MaterialRange = { end: number; material: MeshBasicMaterial; start: number }
    const reportedMaterials = new Set<unknown>()
    const appendRange = (
      ranges: MaterialRange[],
      source: unknown,
      start: number,
      end: number,
      groupStart = start,
      groupCount = end - start,
    ) => {
      if (!source || typeof source !== 'object') return
      const material = source as Partial<MeshBasicMaterial>
      if (material.isMeshBasicMaterial !== true) {
        if (!reportedMaterials.has(source)) {
          reportedMaterials.add(source)
          diagnostic(diagnostics, options, {
            code: 'UNSUPPORTED_MATERIAL',
            message: 'The portable subset currently accepts MeshBasicMaterial only.',
            object,
          })
        }
        return
      }
      const reason = materialReason(material as MeshBasicMaterial)
      if (reason) {
        if (!reportedMaterials.has(source)) {
          reportedMaterials.add(source)
          diagnostic(diagnostics, options, {
            code: 'UNSUPPORTED_MATERIAL',
            message: reason,
            object,
          })
        }
        return
      }
      const map = material.map
      if (map) {
        const mapReason = textureReason(map, true)
        if (mapReason) {
          if (!reportedMaterials.has(source)) {
            reportedMaterials.add(source)
            diagnostic(diagnostics, options, {
              code: 'UNSUPPORTED_MATERIAL',
              message: mapReason,
              object,
            })
          }
          return
        }
        if (material.fog && scene.fog) {
          if (!reportedMaterials.has(source)) {
            reportedMaterials.add(source)
            diagnostic(diagnostics, options, {
              code: 'UNSUPPORTED_MATERIAL',
              message: 'texture and fog modulation is not projected yet',
              object,
            })
          }
          return
        }
        const textureCoordinate = mesh.geometry.getAttribute(textureAttributeName(map))
        if (textureCoordinate?.itemSize !== 2 || textureCoordinate.count < position.count) {
          if (!reportedMaterials.has(source)) {
            reportedMaterials.add(source)
            diagnostic(diagnostics, options, {
              code: 'UNSUPPORTED_GEOMETRY',
              message: `MeshBasicMaterial.map needs one two-component ${textureAttributeName(map)} value per vertex.`,
              object,
            })
          }
          return
        }
        if (map.matrixAutoUpdate) map.updateMatrix()
        for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex += 1) {
          if (portableTextureCoordinate(map, textureCoordinate, vertexIndex)) continue
          if (!reportedMaterials.has(source)) {
            reportedMaterials.add(source)
            diagnostic(diagnostics, options, {
              code: 'UNSUPPORTED_GEOMETRY',
              message:
                'texture coordinates must remain finite and inside 0..1 after the texture transform',
              object,
            })
          }
          return
        }
      }
      if (!passesUniformAlphaTest(material as MeshBasicMaterial)) return
      if (
        material.vertexColors &&
        (vertexColor?.itemSize !== 3 || vertexColor.count < position.count)
      ) {
        if (!reportedMaterials.has(source)) {
          reportedMaterials.add(source)
          diagnostic(diagnostics, options, {
            code: 'UNSUPPORTED_GEOMETRY',
            message:
              'MeshBasicMaterial.vertexColors needs one RGB value per vertex; per-vertex alpha is not projected.',
            object,
          })
        }
        return
      }
      const groupEnd = Number.isFinite(groupCount) ? Math.floor(groupStart + groupCount) : available
      const rangeStart = Math.max(start, 0, Math.floor(groupStart))
      const rangeEnd = Math.min(end, available, groupEnd)
      if (rangeEnd <= rangeStart) return
      ranges.push({ start: rangeStart, end: rangeEnd, material: material as MeshBasicMaterial })
    }
    const rangesFor = (start: number, end: number): MaterialRange[] => {
      const ranges: MaterialRange[] = []
      if (Array.isArray(mesh.material)) {
        for (const group of mesh.geometry.groups) {
          const original = mesh.material[group.materialIndex ?? 0]
          if (!original || original.visible === false) continue
          appendRange(
            ranges,
            effectiveMaterial(original, scene.overrideMaterial),
            start,
            end,
            group.start,
            group.count,
          )
        }
      } else {
        if (mesh.material.visible !== false) {
          appendRange(ranges, effectiveMaterial(mesh.material, scene.overrideMaterial), start, end)
        }
      }
      return ranges
    }

    interface MeshProjectionInstance {
      color?: Color
      morph?: PositionMorphState
      ranges: MaterialRange[]
      worldMatrix: Matrix4
    }
    const projectionInstances: MeshProjectionInstance[] = []
    if (batchedMesh) {
      if (Array.isArray(mesh.material)) {
        diagnostic(diagnostics, options, {
          code: 'UNSUPPORTED_MATERIAL',
          message: 'BatchedMesh material arrays cannot be matched to source geometry groups.',
          object,
        })
        return
      }
      const instanceMatrix = new Matrix4()
      let colorsAvailable: boolean | undefined
      let found = 0
      for (
        let instance = 0;
        instance < batchedMesh.maxInstanceCount && found < batchedMesh.instanceCount;
        instance += 1
      ) {
        let visible: boolean
        try {
          visible = batchedMesh.getVisibleAt(instance)
        } catch {
          continue
        }
        found += 1
        if (!visible) continue
        const geometryId = batchedMesh.getGeometryIdAt(instance)
        const range = batchedMesh.getGeometryRangeAt(geometryId)
        if (!range) continue
        const rangeStart = Math.max(0, Math.floor(range.start))
        const rangeEnd = Math.min(available, Math.floor(range.start + range.count))
        const ranges = rangesFor(rangeStart, rangeEnd)
        if (ranges.length === 0) continue
        batchedMesh.getMatrixAt(instance, instanceMatrix)
        let color: Color | undefined
        if (colorsAvailable !== false) {
          try {
            const instanceColor = new Color()
            batchedMesh.getColorAt(instance, instanceColor)
            colorsAvailable = true
            color = instanceColor
          } catch {
            // Three does not allocate the optional colour texture until setColorAt is used.
            colorsAvailable = false
          }
        }
        projectionInstances.push({
          color,
          ranges,
          worldMatrix: new Matrix4().multiplyMatrices(mesh.matrixWorld, instanceMatrix),
        })
      }
    } else if (instancedMesh) {
      const ranges = rangesFor(drawStart, drawEnd)
      if (ranges.length === 0) return
      const instanceMatrix = new Matrix4()
      const morphTarget = instancedMesh.morphTexture ? new Mesh(mesh.geometry) : undefined
      for (let instance = 0; instance < instancedMesh.count; instance += 1) {
        instancedMesh.getMatrixAt(instance, instanceMatrix)
        let color: Color | undefined
        if (instancedMesh.instanceColor) {
          color = new Color()
          instancedMesh.getColorAt(instance, color)
        }
        let morph: PositionMorphState | undefined
        if (morphTarget?.morphTargetInfluences) {
          instancedMesh.getMorphAt(instance, morphTarget)
          morph = positionMorphState(mesh.geometry, [...morphTarget.morphTargetInfluences])
        }
        projectionInstances.push({
          color,
          morph,
          ranges,
          worldMatrix: new Matrix4().multiplyMatrices(mesh.matrixWorld, instanceMatrix),
        })
      }
    } else {
      const ranges = rangesFor(drawStart, drawEnd)
      if (ranges.length === 0) return
      projectionInstances.push({
        morph: skinnedMesh
          ? undefined
          : positionMorphState(mesh.geometry, mesh.morphTargetInfluences),
        ranges,
        worldMatrix: mesh.matrixWorld,
      })
    }
    let wireframeIndices: number[] | undefined
    const fillColor = new Color()
    const skinnedPosition = new Vector3()
    for (const { color, morph, ranges, worldMatrix } of projectionInstances) {
      const mirrored = worldMatrix.determinant() < 0
      const vertexAt = (vertexIndex: number) => {
        if (skinnedMesh) {
          skinnedMesh.getVertexPosition(vertexIndex, skinnedPosition)
          return new Vector4(
            skinnedPosition.x,
            skinnedPosition.y,
            skinnedPosition.z,
            1,
          ).applyMatrix4(worldMatrix)
        }
        return localPosition(position, vertexIndex, morph).applyMatrix4(worldMatrix)
      }
      const vertex = (offset: number) => {
        const vertexIndex = index ? index.getX(offset) : offset
        return vertexAt(vertexIndex)
      }
      for (const range of ranges) {
        const map = range.material.map
        if (map?.matrixAutoUpdate) map.updateMatrix()
        const textureCoordinate = map
          ? mesh.geometry.getAttribute(textureAttributeName(map))
          : undefined
        if (map && color && color.getHex() !== 0xffffff) {
          if (!reportedMaterials.has(range.material)) {
            reportedMaterials.add(range.material)
            diagnostic(diagnostics, options, {
              code: 'UNSUPPORTED_MATERIAL',
              message: 'texture and instance-colour modulation is not projected yet',
              object,
            })
          }
          continue
        }
        fillColor.copy(range.material.color)
        if (color) fillColor.multiply(color)
        const fill = `#${fillColor.getHexString()}`
        const rangeFog = range.material.fog ? scene.fog : null
        if (range.material.wireframe) {
          const strokeWidth = Math.max(0, range.material.wireframeLinewidth)
          if (strokeWidth === 0) continue
          if (!wireframeIndices) {
            wireframeIndices = []
            for (let offset = 0; offset + 2 < available; offset += 3) {
              const a = index ? index.getX(offset) : offset
              const b = index ? index.getX(offset + 1) : offset + 1
              const c = index ? index.getX(offset + 2) : offset + 2
              wireframeIndices.push(a, b, b, c, c, a)
            }
          }
          const wireStart = range.start * 2
          const wireEnd = Math.min(wireframeIndices.length, range.end * 2)
          for (let offset = wireStart; offset + 1 < wireEnd; offset += 2) {
            const fromIndex = wireframeIndices[offset]
            const toIndex = wireframeIndices[offset + 1]
            if (fromIndex === undefined || toIndex === undefined) continue
            const wireFrom = vertexAt(fromIndex)
            const wireTo = vertexAt(toIndex)
            const fromColor = range.material.vertexColors
              ? new Color(
                  vertexColor?.getX(fromIndex) ?? 0,
                  vertexColor?.getY(fromIndex) ?? 0,
                  vertexColor?.getZ(fromIndex) ?? 0,
                ).multiply(fillColor)
              : fillColor
            const toColor = range.material.vertexColors
              ? new Color(
                  vertexColor?.getX(toIndex) ?? 0,
                  vertexColor?.getY(toIndex) ?? 0,
                  vertexColor?.getZ(toIndex) ?? 0,
                ).multiply(fillColor)
              : fillColor
            const colorAt = (world: Vector4) => {
              const base = fromColor.clone().lerp(toColor, segmentRatio(world, wireFrom, wireTo))
              return foggedColorAtWorld(base, rangeFog, world, camera.matrixWorldInverse)
            }
            const materialClippedSegments = clippedMaterialSegments(
              wireFrom,
              wireTo,
              (range.material.clippingPlanes ?? []) as readonly Plane[],
              range.material.clipIntersection,
            )
            for (const materialClipped of materialClippedSegments) {
              const materialFromClip = materialClipped[0].clone().applyMatrix4(viewProjection)
              const materialToClip = materialClipped[1].clone().applyMatrix4(viewProjection)
              const clipped = clippedSegment(materialFromClip, materialToClip)
              if (!clipped) continue
              const from = projectedPoint(clipped[0], options.width, options.height)
              const to = projectedPoint(clipped[1], options.width, options.height)
              if (!from || !to || (from.x === to.x && from.y === to.y)) continue
              let projectedStroke: CanvasStroke = fill
              if (range.material.vertexColors || rangeFog) {
                const clippedFromWorld = materialClipped[0]
                  .clone()
                  .lerp(
                    materialClipped[1],
                    segmentRatio(clipped[0], materialFromClip, materialToClip),
                  )
                const clippedToWorld = materialClipped[0]
                  .clone()
                  .lerp(
                    materialClipped[1],
                    segmentRatio(clipped[1], materialFromClip, materialToClip),
                  )
                const clippedFromColor = colorAt(clippedFromWorld)
                const clippedToColor = colorAt(clippedToWorld)
                projectedStroke = {
                  kind: 'linear',
                  from: { x: from.x, y: from.y },
                  to: { x: to.x, y: to.y },
                  stops: [
                    {
                      offset: 0,
                      color: `#${clippedFromColor.getHexString()}`,
                    },
                    {
                      offset: 1,
                      color: `#${clippedToColor.getHexString()}`,
                    },
                  ],
                }
              }
              primitives.push({
                depth: (from.z + to.z) / 2,
                groupOrder,
                object,
                order: order++,
                renderOrder: object.renderOrder,
                transparent: range.material.transparent,
                node: {
                  kind: 'line',
                  props: {
                    x1: from.x,
                    y1: from.y,
                    x2: to.x,
                    y2: to.y,
                    stroke: projectedStroke,
                    strokeWidth,
                    ...projectedOpacityProps(range.material),
                  },
                },
              })
            }
          }
          continue
        }

        for (let offset = range.start; offset + 2 < range.end; offset += 3) {
          const sourceVertices = [vertex(offset), vertex(offset + 1), vertex(offset + 2)]
          const coloured = (range.material.vertexColors && vertexColor) || rangeFog
          const textured = map && textureCoordinate
          const materialPolygons = textured
            ? clippedMaterialTexturedPolygons(
                sourceVertices.map((position, indexInTriangle) => {
                  const sourceOffset = offset + indexInTriangle
                  const vertexIndex = index ? index.getX(sourceOffset) : sourceOffset
                  return {
                    position,
                    texture: portableTextureCoordinate(
                      map,
                      textureCoordinate,
                      vertexIndex,
                    ) as Vector2,
                  }
                }),
                (range.material.clippingPlanes ?? []) as readonly Plane[],
                range.material.clipIntersection,
              )
            : coloured
              ? clippedMaterialColouredPolygons(
                  sourceVertices.map((position, indexInTriangle) => {
                    const sourceOffset = offset + indexInTriangle
                    const vertexIndex = index ? index.getX(sourceOffset) : sourceOffset
                    const vertexFill = range.material.vertexColors
                      ? new Color()
                          .setRGB(
                            vertexColor?.getX(vertexIndex) ?? 0,
                            vertexColor?.getY(vertexIndex) ?? 0,
                            vertexColor?.getZ(vertexIndex) ?? 0,
                          )
                          .multiply(fillColor)
                      : fillColor
                    return {
                      color: vertexFill.clone(),
                      position,
                    }
                  }),
                  (range.material.clippingPlanes ?? []) as readonly Plane[],
                  range.material.clipIntersection,
                )
              : clippedMaterialPolygons(
                  sourceVertices,
                  (range.material.clippingPlanes ?? []) as readonly Plane[],
                  range.material.clipIntersection,
                )
          for (const materialPolygon of materialPolygons) {
            const polygon = textured
              ? clippedTexturedPolygon(
                  (materialPolygon as TexturedVertex[]).map(({ position, texture }) => ({
                    position: position.clone().applyMatrix4(viewProjection),
                    texture,
                  })),
                )
              : coloured
                ? clippedColouredPolygon(
                    (materialPolygon as ColouredVertex[]).map(({ color, position }) => {
                      const viewDepth = -position.clone().applyMatrix4(camera.matrixWorldInverse).z
                      return {
                        color,
                        position: position.clone().applyMatrix4(viewProjection),
                        viewDepth,
                      }
                    }),
                  )
                : clippedPolygon(
                    (materialPolygon as Vector4[]).map((point) =>
                      point.applyMatrix4(viewProjection),
                    ),
                  )
            if (polygon.length < 3) continue
            for (let fan = 1; fan + 1 < polygon.length; fan += 1) {
              const first = polygon[0]
              const second = polygon[fan]
              const third = polygon[fan + 1]
              if (!first || !second || !third) continue
              const clipTriangle = [first, second, third] as const
              const points = clipTriangle.map((point) =>
                projectedPoint(
                  textured || coloured
                    ? (point as TexturedVertex | ColouredVertex).position
                    : (point as Vector4),
                  options.width,
                  options.height,
                ),
              )
              if (points.some((point) => point === undefined)) continue
              const projected = points as { x: number; y: number; z: number }[]
              const area = signedArea(projected) * (mirrored ? -1 : 1)
              if (area === 0) continue
              const side = range.material.side
              if (side !== DoubleSide && (side === BackSide ? area < 0 : area > 0)) continue
              const path = `M ${printable(projected[0]?.x ?? 0)} ${printable(projected[0]?.y ?? 0)} L ${printable(projected[1]?.x ?? 0)} ${printable(projected[1]?.y ?? 0)} L ${printable(projected[2]?.x ?? 0)} ${printable(projected[2]?.y ?? 0)} Z`
              primitives.push({
                depth: projected.reduce((sum, point) => sum + point.z, 0) / 3,
                groupOrder,
                object,
                order: order++,
                renderOrder: object.renderOrder,
                transparent: range.material.transparent,
                node: textured
                  ? {
                      kind: 'triangle-mesh',
                      props: {
                        texture: {
                          source: textureSource(map) as CanvasTextureSource,
                          coordinates: clipTriangle.map((point) => {
                            const coordinate = (point as TexturedVertex).texture
                            return { x: coordinate.x, y: coordinate.y }
                          }),
                          filter: map.magFilter === NearestFilter ? 'nearest' : 'linear',
                          ...textureWrapProps(map),
                        },
                        vertices: projected.map(({ x, y }) => ({ x, y })),
                        ...projectedOpacityProps(range.material),
                      },
                    }
                  : coloured
                    ? {
                        kind: 'triangle-mesh',
                        props: {
                          colors: clipTriangle.map((point) =>
                            canvasVertexColor(
                              foggedColorAtDepth(
                                (point as ColouredVertex).color,
                                rangeFog,
                                (point as ColouredVertex).viewDepth ?? 0,
                              ),
                            ),
                          ),
                          vertices: projected.map(({ x, y }) => ({ x, y })),
                          ...projectedOpacityProps(range.material),
                        },
                      }
                    : {
                        kind: 'path',
                        props: { path, fill, ...projectedOpacityProps(range.material) },
                      },
              })
            }
          }
        }
      }
    }
  })

  primitives.sort(
    (left, right) =>
      Number(left.transparent) - Number(right.transparent) ||
      left.groupOrder - right.groupOrder ||
      left.renderOrder - right.renderOrder ||
      right.depth - left.depth ||
      left.order - right.order,
  )
  return {
    scene: [...decoration, ...primitives.map((primitive) => primitive.node)],
    objects: [...decorationObjects, ...primitives.map((primitive) => primitive.object)],
    diagnostics,
  }
}

export function projectThreeScene(
  scene: Scene,
  camera: Object3D,
  options: ThreeProjectionOptions,
): ThreeProjection {
  return projectThreeSceneInternal(scene, camera, options, true)
}
