// Material, texture, fog, colour, and camera validation helpers for portable
// Three.js-to-Canvas scene projection.

import type { CanvasMeshTexture, CanvasTextureSource, CanvasTextureWrap } from '@hozo/canvas'
import {
  type BufferAttribute,
  ClampToEdgeWrapping,
  Color,
  type InterleavedBufferAttribute,
  LessEqualDepth,
  type LineBasicMaterial,
  type LineDashedMaterial,
  type Material,
  type Matrix4,
  type MeshBasicMaterial,
  type MeshNormalMaterial,
  MirroredRepeatWrapping,
  NearestFilter,
  NormalBlending,
  type Object3D,
  type OrthographicCamera,
  type PerspectiveCamera,
  type PointsMaterial,
  RepeatWrapping,
  type Scene,
  type SpriteMaterial,
  SRGBColorSpace,
  type Texture,
  UVMapping,
  Vector2,
  type Vector3,
  type Vector4,
} from 'three'

export type SupportedCamera = PerspectiveCamera | OrthographicCamera
export type SupportedFog = NonNullable<Scene['fog']>

export function isColorBackground(background: Scene['background']): background is Color {
  return background !== null && (background as Color).isColor === true
}

export function isTextureBackground(background: Scene['background']): background is Texture {
  return background !== null && (background as Texture).isTexture === true
}

export function fogReason(fog: SupportedFog): string | undefined {
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

export function foggedColorAtDepth(
  color: Color,
  fog: SupportedFog | null,
  viewDepth: number,
): Color {
  return fog ? color.clone().lerp(fog.color, fogFactor(fog, viewDepth)) : color.clone()
}

export function foggedColorAtWorld(
  color: Color,
  fog: SupportedFog | null,
  world: Vector4,
  viewMatrix: Matrix4,
): Color {
  if (!fog) return color.clone()
  return foggedColorAtDepth(color, fog, -world.clone().applyMatrix4(viewMatrix).z)
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

export function passesUniformAlphaTest(material: Material): boolean {
  return material.alphaTest <= 0 || material.opacity >= material.alphaTest
}

export function materialReason(material: MeshBasicMaterial): string | undefined {
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
    if (![material.color.r, material.color.g, material.color.b].every(Number.isFinite))
      return 'texture material colour must be finite'
    if (material.alphaTest > 0) return 'textured alphaTest needs per-pixel sampling'
  }
  return undefined
}

export function normalMaterialReason(material: MeshNormalMaterial): string | undefined {
  const baseReason = baseMaterialReason(material)
  if (baseReason) return baseReason
  if (!Number.isFinite(material.opacity)) return 'material opacity must be finite'
  if (material.bumpMap || material.normalMap || material.displacementMap) {
    return 'MeshNormalMaterial texture perturbation needs per-fragment sampling'
  }
  return undefined
}

export function lineMaterialReason(material: LineBasicMaterial): string | undefined {
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

export function pointsMaterialReason(material: PointsMaterial): string | undefined {
  const baseReason = baseMaterialReason(material)
  if (baseReason) return baseReason
  if (!Number.isFinite(material.opacity)) return 'point opacity must be finite'
  if (material.alphaMap) return 'PointsMaterial alphaMap needs per-pixel sampling'
  if (material.map) {
    const mapReason = textureReason(material.map)
    if (mapReason) return mapReason
    if (material.vertexColors) return 'texture and per-point colour modulation is not projected yet'
    if (![material.color.r, material.color.g, material.color.b].every(Number.isFinite))
      return 'texture point colour must be finite'
    if (material.alphaTest > 0) return 'textured alphaTest needs per-pixel sampling'
  }
  return undefined
}

export function spriteMaterialReason(material: SpriteMaterial): string | undefined {
  const baseReason = baseMaterialReason(material)
  if (baseReason) return baseReason
  if (!Number.isFinite(material.opacity)) return 'sprite opacity must be finite'
  if (material.alphaMap) return 'SpriteMaterial alphaMap needs per-pixel sampling'
  if (material.map) {
    const mapReason = textureReason(material.map)
    if (mapReason) return mapReason
    if (![material.color.r, material.color.g, material.color.b].every(Number.isFinite))
      return 'texture sprite colour must be finite'
    if (material.alphaTest > 0) return 'textured alphaTest needs per-pixel sampling'
  }
  return undefined
}

export function textureSource(texture: Texture): CanvasTextureSource | undefined {
  const source = texture.source.data as unknown
  if (typeof source === 'string' || typeof source === 'number') return source
  if (!source || typeof source !== 'object') return undefined
  const candidate = source as { default?: unknown; src?: unknown; uri?: unknown }
  if (typeof candidate.uri === 'string') return { uri: candidate.uri }
  if (typeof candidate.src === 'string' && candidate.src.length > 0) return candidate.src
  if (typeof candidate.default === 'string') return { default: candidate.default }
  return undefined
}

function textureWrapAxis(wrap: number): CanvasTextureWrap | undefined {
  if (wrap === ClampToEdgeWrapping) return 'clamp'
  if (wrap === RepeatWrapping) return 'repeat'
  if (wrap === MirroredRepeatWrapping) return 'mirror'
  return undefined
}

function textureWrap(
  texture: Texture,
): readonly [CanvasTextureWrap, CanvasTextureWrap] | undefined {
  const wrapX = textureWrapAxis(texture.wrapS)
  const wrapY = textureWrapAxis(texture.wrapT)
  return wrapX && wrapY ? [wrapX, wrapY] : undefined
}

export function textureReason(texture: Texture, usesGeometryChannel = false): string | undefined {
  if (texture.mapping !== UVMapping) return 'portable colour textures need UVMapping'
  if (
    usesGeometryChannel &&
    (!Number.isInteger(texture.channel) || texture.channel < 0 || texture.channel > 3)
  ) {
    return 'texture channel must select uv, uv1, uv2, or uv3'
  }
  if (!textureWrap(texture)) {
    return 'texture wrapping must clamp, repeat, or mirror'
  }
  if (texture.colorSpace !== SRGBColorSpace) {
    return 'colour textures need SRGBColorSpace for portable Canvas sampling'
  }
  if (texture.premultiplyAlpha) return 'premultiplied texture alpha is not projected'
  if (!textureSource(texture)) return 'texture source needs a URL, URI, or Native asset ID'
  return undefined
}

export function textureWrapProps(
  texture: Texture,
): Pick<CanvasMeshTexture, 'wrap' | 'wrapX' | 'wrapY'> {
  const [wrapX, wrapY] = textureWrap(texture) ?? ['clamp', 'clamp']
  if (wrapX === wrapY) return wrapX === 'clamp' ? {} : { wrap: wrapX }
  return { wrapX, wrapY }
}

export function textureTintProps(color: Color): Pick<CanvasMeshTexture, 'tint'> {
  return color.r === 1 && color.g === 1 && color.b === 1
    ? {}
    : { tint: { r: color.r, g: color.g, b: color.b } }
}

export function canvasTextureProps(
  map: Texture,
  coordinates: { x: number; y: number }[],
  tint?: Color,
): CanvasMeshTexture {
  return {
    source: textureSource(map) as CanvasTextureSource,
    coordinates,
    filter: map.magFilter === NearestFilter ? 'nearest' : 'linear',
    ...textureWrapProps(map),
    ...(tint ? textureTintProps(tint) : {}),
  }
}

export function textureAttributeName(texture: Texture): `uv${string}` {
  return texture.channel === 0 ? 'uv' : `uv${texture.channel}`
}

function transformedTexturePoint(
  texture: Texture,
  x: number,
  y: number,
  invertY: boolean,
): Vector2 | undefined {
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
  if (invertY) coordinate.y = 1 - coordinate.y
  return coordinate
}

export function portableTexturePoint(texture: Texture, x: number, y: number): Vector2 | undefined {
  return transformedTexturePoint(texture, x, y, texture.flipY)
}

export function portablePointTexturePoint(
  texture: Texture,
  x: number,
  y: number,
): Vector2 | undefined {
  // Three's point shader already turns gl_PointCoord into top-left image space.
  // Only an upload that opts out of Three's usual flip needs reversing here.
  return transformedTexturePoint(texture, x, y, !texture.flipY)
}

export function portableTextureCoordinate(
  texture: Texture,
  attribute: BufferAttribute | InterleavedBufferAttribute,
  vertexIndex: number,
): Vector2 | undefined {
  return portableTexturePoint(texture, attribute.getX(vertexIndex), attribute.getY(vertexIndex))
}

export function canvasVertexColor(color: Color, alpha?: number) {
  const value = { r: 0, g: 0, b: 0 }
  color.getRGB(value, SRGBColorSpace)
  return alpha === undefined ? value : { ...value, a: alpha }
}

export function packedNormalColor(normal: Vector3, flipped = false): Color {
  const direction = normal.clone().normalize()
  if (flipped) direction.negate()
  return new Color().setRGB(
    direction.x * 0.5 + 0.5,
    direction.y * 0.5 + 0.5,
    direction.z * 0.5 + 0.5,
  )
}

export function flipPackedNormalColor(color: Color): Color {
  return new Color().setRGB(1 - color.r, 1 - color.g, 1 - color.b)
}

export function canvasColorCss(color: Color, alpha?: number): string {
  if (alpha === undefined || alpha >= 1) return `#${color.getHexString()}`
  const { r, g, b } = canvasVertexColor(color)
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${Math.max(0, Math.min(1, alpha))})`
}

export function portableVertexAlpha(
  attribute: BufferAttribute | InterleavedBufferAttribute,
  index: number,
): number | undefined {
  const alpha = attribute.getW(index)
  return Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : undefined
}

export function hasPortableVertexAlphas(
  attribute: BufferAttribute | InterleavedBufferAttribute,
  count = attribute.count,
): boolean {
  for (let index = 0; index < count; index += 1) {
    if (portableVertexAlpha(attribute, index) === undefined) return false
  }
  return true
}

function projectedOpacity(material: Material): number | undefined {
  if (!material.transparent) return undefined
  const opacity = Math.max(0, Math.min(1, material.opacity))
  return opacity === 1 ? undefined : opacity
}

export function projectedOpacityProps(material: Material): { opacity?: number } {
  const opacity = projectedOpacity(material)
  return opacity === undefined ? {} : { opacity }
}

export function effectiveMaterial(original: Material, override: Material | null): Material {
  return override && original.allowOverride ? override : original
}

export function isSupportedCamera(object: Object3D): object is SupportedCamera {
  const candidate = object as Partial<PerspectiveCamera & OrthographicCamera>
  return candidate.isPerspectiveCamera === true || candidate.isOrthographicCamera === true
}

export function inheritedGroupOrder(object: Object3D, camera: SupportedCamera): number {
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
