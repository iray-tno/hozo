// Clipping, projection, dashing, morphing, and skinning math for portable
// Three.js-to-Canvas scene projection.

import {
  type BufferAttribute,
  type BufferGeometry,
  type Color,
  type InterleavedBufferAttribute,
  type LineDashedMaterial,
  type Matrix3,
  type Matrix4,
  type Plane,
  type SkinnedMesh,
  type Vector2,
  Vector3,
  Vector4,
} from 'three'

export type PositionAttribute = BufferAttribute | InterleavedBufferAttribute

export interface ColouredVertex {
  alpha?: number
  color: Color
  position: Vector4
  viewDepth?: number
}

export interface TexturedVertex {
  position: Vector4
  texture: Vector2
}

export interface MorphState {
  attributes: readonly PositionAttribute[]
  baseInfluence: number
  influences: readonly number[]
}

export interface SkinNormalScratch {
  blended: Matrix4
  bone: Matrix4
  direction: Matrix3
}

export const clipPlanes = [
  (point: Vector4) => point.w + point.x,
  (point: Vector4) => point.w - point.x,
  (point: Vector4) => point.w + point.y,
  (point: Vector4) => point.w - point.y,
  (point: Vector4) => point.w + point.z,
  (point: Vector4) => point.w - point.z,
] as const

interface VertexOps<V> {
  position(vertex: V): Vector4
  clone(vertex: V): V
  interpolate(from: V, to: V, ratio: number): V
}

const vector4Ops: VertexOps<Vector4> = {
  position: (point) => point,
  clone: (point) => point.clone(),
  interpolate: (from, to, ratio) => from.clone().lerp(to, ratio),
}

const colouredVertexOps: VertexOps<ColouredVertex> = {
  position: (vertex) => vertex.position,
  clone: ({ alpha, color, position, viewDepth }) => ({
    alpha,
    color: color.clone(),
    position: position.clone(),
    viewDepth,
  }),
  interpolate: (from, to, ratio) => ({
    alpha:
      from.alpha === undefined && to.alpha === undefined
        ? undefined
        : (from.alpha ?? 1) + ((to.alpha ?? 1) - (from.alpha ?? 1)) * ratio,
    color: from.color.clone().lerp(to.color, ratio),
    position: from.position.clone().lerp(to.position, ratio),
    viewDepth:
      from.viewDepth === undefined || to.viewDepth === undefined
        ? undefined
        : from.viewDepth + (to.viewDepth - from.viewDepth) * ratio,
  }),
}

const texturedVertexOps: VertexOps<TexturedVertex> = {
  position: (vertex) => vertex.position,
  clone: (vertex) => ({ position: vertex.position.clone(), texture: vertex.texture.clone() }),
  interpolate: (from, to, ratio) => ({
    position: from.position.clone().lerp(to.position, ratio),
    texture: from.texture.clone().lerp(to.texture, ratio),
  }),
}

function clipPolygonAgainstHalfSpace<V>(
  source: readonly V[],
  ops: VertexOps<V>,
  signedDistance: (point: Vector4) => number,
  keepInside: boolean,
): V[] {
  if (source.length === 0) return []
  const clipped: V[] = []
  let previous = source.at(-1) as V
  let previousDistance = signedDistance(ops.position(previous))
  for (const current of source) {
    const currentDistance = signedDistance(ops.position(current))
    const previousInside = keepInside ? previousDistance >= 0 : previousDistance < 0
    const currentInside = keepInside ? currentDistance >= 0 : currentDistance < 0
    if (previousInside !== currentInside) {
      const denominator = previousDistance - currentDistance
      if (denominator !== 0) {
        clipped.push(ops.interpolate(previous, current, previousDistance / denominator))
      }
    }
    if (currentInside) clipped.push(ops.clone(current))
    previous = current
    previousDistance = currentDistance
  }
  return clipped
}

function clipPolygonToFrustum<V>(source: readonly V[], ops: VertexOps<V>): V[] {
  let polygon = source.map(ops.clone)
  for (const distance of clipPlanes) {
    if (polygon.length === 0) return polygon
    polygon = clipPolygonAgainstHalfSpace(polygon, ops, distance, true)
  }
  return polygon
}

function clipPolygonToMaterialPlanes<V>(
  source: readonly V[],
  ops: VertexOps<V>,
  planes: readonly Plane[],
  clipIntersection: boolean,
): readonly V[][] {
  if (planes.length === 0) return [source.map(ops.clone)]
  if (!clipIntersection) {
    let polygon = source.map(ops.clone)
    for (const plane of planes) {
      polygon = clipPolygonAgainstHalfSpace(
        polygon,
        ops,
        (point) => planeDistance(plane, point),
        true,
      )
    }
    return polygon.length >= 3 ? [polygon] : []
  }

  let remaining = source.map(ops.clone)
  const retained: V[][] = []
  for (const plane of planes) {
    const distance = (point: Vector4) => planeDistance(plane, point)
    const inside = clipPolygonAgainstHalfSpace(remaining, ops, distance, true)
    if (inside.length >= 3) retained.push(inside)
    remaining = clipPolygonAgainstHalfSpace(remaining, ops, distance, false)
    if (remaining.length < 3) break
  }
  return retained
}

export function clippedPolygon(triangle: readonly Vector4[]): Vector4[] {
  return clipPolygonToFrustum(triangle, vector4Ops)
}

export function clippedColouredPolygon(triangle: readonly ColouredVertex[]): ColouredVertex[] {
  return clipPolygonToFrustum(triangle, colouredVertexOps)
}

export function clippedTexturedPolygon(triangle: readonly TexturedVertex[]): TexturedVertex[] {
  return clipPolygonToFrustum(triangle, texturedVertexOps)
}

export function clippedMaterialPolygons(
  source: readonly Vector4[],
  planes: readonly Plane[],
  clipIntersection: boolean,
): readonly Vector4[][] {
  return clipPolygonToMaterialPlanes(source, vector4Ops, planes, clipIntersection)
}

export function clippedMaterialColouredPolygons(
  source: readonly ColouredVertex[],
  planes: readonly Plane[],
  clipIntersection: boolean,
): readonly ColouredVertex[][] {
  return clipPolygonToMaterialPlanes(source, colouredVertexOps, planes, clipIntersection)
}

export function clippedMaterialTexturedPolygons(
  source: readonly TexturedVertex[],
  planes: readonly Plane[],
  clipIntersection: boolean,
): readonly TexturedVertex[][] {
  return clipPolygonToMaterialPlanes(source, texturedVertexOps, planes, clipIntersection)
}

export function clippedSegment(
  from: Vector4,
  to: Vector4,
): readonly [Vector4, Vector4] | undefined {
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

export function planeDistance(plane: Plane, point: Vector4): number {
  return (
    plane.normal.x * point.x + plane.normal.y * point.y + plane.normal.z * point.z + plane.constant
  )
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

export function clippedMaterialSegments(
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

export function segmentRatio(point: Vector4, from: Vector4, to: Vector4): number {
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

export function dashedSegments(
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

export function printable(value: number): string {
  const rounded = Math.abs(value) < 0.0000005 ? 0 : Number(value.toFixed(6))
  return String(rounded)
}

export function projectedPoint(point: Vector4, width: number, height: number) {
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

export function signedArea(points: readonly { x: number; y: number }[]): number {
  const [a, b, c] = points
  if (!a || !b || !c) return 0
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function morphStateFor(
  attributes: readonly PositionAttribute[] | undefined,
  morphTargetsRelative: boolean,
  influences: readonly number[] | undefined,
): MorphState | undefined {
  if (!influences || !attributes || attributes.length === 0) return undefined
  return {
    attributes,
    baseInfluence: morphTargetsRelative
      ? 1
      : 1 - influences.reduce((sum, influence) => sum + influence, 0),
    influences,
  }
}

export function positionMorphState(
  geometry: BufferGeometry,
  influences: readonly number[] | undefined,
): MorphState | undefined {
  return morphStateFor(geometry.morphAttributes.position, geometry.morphTargetsRelative, influences)
}

export function normalMorphState(
  geometry: BufferGeometry,
  influences: readonly number[] | undefined,
): MorphState | undefined {
  return morphStateFor(geometry.morphAttributes.normal, geometry.morphTargetsRelative, influences)
}

function blendMorphedVec3(
  attribute: PositionAttribute,
  vertexIndex: number,
  morph: MorphState | undefined,
): readonly [number, number, number] {
  const baseX = attribute.getX(vertexIndex)
  const baseY = attribute.getY(vertexIndex)
  const baseZ = attribute.getZ(vertexIndex)
  if (!morph) return [baseX, baseY, baseZ]

  let x = baseX * morph.baseInfluence
  let y = baseY * morph.baseInfluence
  let z = baseZ * morph.baseInfluence
  for (let index = 0; index < morph.attributes.length; index += 1) {
    const influence = morph.influences[index] ?? 0
    const target = morph.attributes[index]
    if (influence === 0 || !target) continue
    x += target.getX(vertexIndex) * influence
    y += target.getY(vertexIndex) * influence
    z += target.getZ(vertexIndex) * influence
  }
  return [x, y, z]
}

export function localPosition(
  position: PositionAttribute,
  vertexIndex: number,
  morph: MorphState | undefined,
): Vector4 {
  const [x, y, z] = blendMorphedVec3(position, vertexIndex, morph)
  return new Vector4(x, y, z, 1)
}

export function localNormal(
  normal: PositionAttribute,
  vertexIndex: number,
  morph: MorphState | undefined,
): Vector3 {
  const [x, y, z] = blendMorphedVec3(normal, vertexIndex, morph)
  return new Vector3(x, y, z)
}

export function skinnedNormal(
  mesh: SkinnedMesh,
  vertexIndex: number,
  normal: Vector3,
  scratch: SkinNormalScratch,
): Vector3 {
  const skinIndex = mesh.geometry.getAttribute('skinIndex')
  const skinWeight = mesh.geometry.getAttribute('skinWeight')
  scratch.blended.elements.fill(0)
  for (let index = 0; index < 4; index += 1) {
    const weight = skinWeight.getComponent(vertexIndex, index)
    if (weight === 0) continue
    const boneIndex = skinIndex.getComponent(vertexIndex, index)
    const bone = mesh.skeleton.bones[boneIndex]
    const inverse = mesh.skeleton.boneInverses[boneIndex]
    if (!bone || !inverse) continue
    scratch.bone.multiplyMatrices(bone.matrixWorld, inverse)
    for (let element = 0; element < 16; element += 1) {
      scratch.blended.elements[element] =
        (scratch.blended.elements[element] ?? 0) + (scratch.bone.elements[element] ?? 0) * weight
    }
  }
  scratch.blended.multiply(mesh.bindMatrix).premultiply(mesh.bindMatrixInverse)
  return normal.applyMatrix3(scratch.direction.setFromMatrix4(scratch.blended))
}
