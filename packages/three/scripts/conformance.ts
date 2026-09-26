export type ThreeConformanceStatus = 'full' | 'partial' | 'diagnostic' | 'silent' | 'out-of-scope'

export type ThreeUpstreamSurface = 'camera' | 'material' | 'object'

export interface ThreeConformanceTestReference {
  file: 'src/project.test.ts' | 'src/three-canvas.test.tsx'
  title: string
}

export interface ThreeConformanceCase {
  category: 'camera' | 'geometry' | 'interaction' | 'material' | 'object' | 'scene' | 'topology'
  detail: string
  feature: string
  status: ThreeConformanceStatus
  tests?: readonly ThreeConformanceTestReference[]
  upstream?: { name: string; surface: ThreeUpstreamSurface }
}

const project = (title: string): ThreeConformanceTestReference => ({
  file: 'src/project.test.ts',
  title,
})

const canvas = (title: string): ThreeConformanceTestReference => ({
  file: 'src/three-canvas.test.tsx',
  title,
})

const row = (
  category: ThreeConformanceCase['category'],
  feature: string,
  status: ThreeConformanceStatus,
  detail: string,
  options: Pick<ThreeConformanceCase, 'tests' | 'upstream'> = {},
): ThreeConformanceCase => ({ category, feature, status, detail, ...options })

const upstream = (surface: ThreeUpstreamSurface, name: string) => ({ name, surface })

const triangle = project('a Three.js triangle becomes a Canvas path in viewport coordinates')
const line = project('Line connects adjacent vertices and honours indexed draw ranges')
const points = project(
  'Points become Canvas circles with indexed draw ranges and perspective attenuation',
)
/**
 * A version-audited surface, not a promise that every Three.js export belongs
 * in a 2D portable renderer. The report excludes `out-of-scope` rows from its
 * denominator and keeps every known silent semantic loss visible.
 */
export const THREE_CONFORMANCE_CASES: readonly ThreeConformanceCase[] = [
  row('topology', 'triangles', 'full', 'Indexed and non-indexed triangles become clipped paths.', {
    tests: [triangle, project('indexed geometry emits each triangle')],
  }),
  row('topology', 'line strip', 'full', 'Adjacent vertices become connected Canvas lines.', {
    tests: [line],
  }),
  row('topology', 'line loop', 'full', 'The final vertex is connected back to the first.', {
    tests: [project('LineLoop closes its final vertex back to its first')],
  }),
  row('topology', 'line segments', 'full', 'Each vertex pair becomes an independent line.', {
    tests: [project('LineSegments become independent Canvas lines with material colour and width')],
  }),
  row(
    'topology',
    'points',
    'full',
    'Points become circles or textured point-sprite quads with optional perspective attenuation.',
    {
      tests: [points],
    },
  ),

  row(
    'object',
    'BatchedMesh',
    'full',
    'Sparse instance IDs, geometry ranges, visibility, transforms, and colours are projected.',
    {
      upstream: upstream('object', 'BatchedMesh'),
      tests: [project('BatchedMesh projects sparse visible instances with transforms and colours')],
    },
  ),
  row('object', 'Bone', 'out-of-scope', 'A Bone has no independent render primitive.', {
    upstream: upstream('object', 'Bone'),
  }),
  row('object', 'Group', 'full', 'Visibility and nested world transforms are traversed.', {
    upstream: upstream('object', 'Group'),
    tests: [project('world transforms under groups are baked into the projected path')],
  }),
  row(
    'object',
    'InstancedMesh',
    'full',
    'Instance transforms, colours, and morph weights project independently.',
    {
      upstream: upstream('object', 'InstancedMesh'),
      tests: [
        project('InstancedMesh applies each instance transform and preserves object identity'),
        project('InstancedMesh applies per-instance colours and morph weights'),
      ],
    },
  ),
  row('object', 'Line', 'full', 'Line strips project through the portable line pipeline.', {
    upstream: upstream('object', 'Line'),
    tests: [line],
  }),
  row('object', 'LineLoop', 'full', 'Closed line strips project through the line pipeline.', {
    upstream: upstream('object', 'LineLoop'),
    tests: [project('LineLoop closes its final vertex back to its first')],
  }),
  row(
    'object',
    'LineSegments',
    'full',
    'Independent line pairs project through the line pipeline.',
    {
      upstream: upstream('object', 'LineSegments'),
      tests: [
        project('LineSegments become independent Canvas lines with material colour and width'),
      ],
    },
  ),
  row(
    'object',
    'LOD',
    'full',
    'The camera-distance level is selected automatically, or manual visibility is preserved.',
    {
      upstream: upstream('object', 'LOD'),
      tests: [project('LOD selects the camera-distance level and honours manual visibility')],
    },
  ),
  row('object', 'Mesh', 'full', 'Triangle meshes use the supported material subset.', {
    upstream: upstream('object', 'Mesh'),
    tests: [triangle],
  }),
  row('object', 'Points', 'full', 'Point vertices project through the portable point pipeline.', {
    upstream: upstream('object', 'Points'),
    tests: [points],
  }),
  row('object', 'Skeleton', 'out-of-scope', 'A Skeleton is data consumed by SkinnedMesh.', {
    upstream: upstream('object', 'Skeleton'),
  }),
  row('object', 'SkinnedMesh', 'full', 'Public CPU morph and bone transforms are evaluated.', {
    upstream: upstream('object', 'SkinnedMesh'),
    tests: [project('SkinnedMesh evaluates morph targets before public CPU bone transforms')],
  }),
  row(
    'object',
    'Sprite',
    'full',
    'Camera-facing quads preserve centre, rotation, scale, and size attenuation.',
    {
      upstream: upstream('object', 'Sprite'),
      tests: [
        project('Sprite projects its billboard centre, rotation, and perspective attenuation'),
      ],
    },
  ),

  row(
    'camera',
    'ArrayCamera',
    'full',
    'Each child camera projects into its bottom-left viewport in declared order.',
    {
      upstream: upstream('camera', 'ArrayCamera'),
      tests: [
        project('ArrayCamera projects each sub-camera into its bottom-left viewport'),
        project('ArrayCamera diagnoses sub-cameras without a viewport'),
      ],
    },
  ),
  row('camera', 'Camera', 'diagnostic', 'A base camera has no usable projection and is rejected.', {
    upstream: upstream('camera', 'Camera'),
    tests: [project('unsupported inputs are omitted with actionable diagnostics')],
  }),
  row('camera', 'CubeCamera', 'out-of-scope', 'Environment capture needs a GPU renderer.', {
    upstream: upstream('camera', 'CubeCamera'),
  }),
  row('camera', 'OrthographicCamera', 'full', 'Its public projection matrix is honoured.', {
    upstream: upstream('camera', 'OrthographicCamera'),
    tests: [project('world transforms under groups are baked into the projected path')],
  }),
  row('camera', 'PerspectiveCamera', 'full', 'Its public projection matrix is honoured.', {
    upstream: upstream('camera', 'PerspectiveCamera'),
    tests: [triangle],
  }),
  row(
    'camera',
    'StereoCamera',
    'out-of-scope',
    'StereoCamera is a two-camera helper, not a direct render camera.',
    {
      upstream: upstream('camera', 'StereoCamera'),
    },
  ),

  row(
    'material',
    'LineBasicMaterial',
    'partial',
    'Colour, width, RGB vertex gradients, fog, and normal alpha transparency work; advanced base material state does not.',
    {
      upstream: upstream('material', 'LineBasicMaterial'),
      tests: [
        project('LineSegments become independent Canvas lines with material colour and width'),
        project('LineBasicMaterial projects clipped RGB vertex colours as a portable gradient'),
        project('normal transparent materials project opacity across portable primitives'),
      ],
    },
  ),
  row(
    'material',
    'LineDashedMaterial',
    'partial',
    'Finite dash and gap intervals split into portable solid segments before projection.',
    {
      upstream: upstream('material', 'LineDashedMaterial'),
      tests: [
        project('LineDashedMaterial projects line-distance dash and gap intervals'),
        project('invalid or excessive dashed line intervals emit diagnostics'),
      ],
    },
  ),
  row(
    'material',
    'Material',
    'out-of-scope',
    'The abstract material base has no renderable appearance.',
    {
      upstream: upstream('material', 'Material'),
    },
  ),
  row(
    'material',
    'MeshBasicMaterial',
    'partial',
    'Flat and RGB vertex colours, a constrained affine colour map, fog, normal alpha transparency, sides, groups, and wireframe work.',
    {
      upstream: upstream('material', 'MeshBasicMaterial'),
      tests: [
        triangle,
        project('MeshBasicMaterial map and UVs become a portable textured triangle'),
        project('groups can mix solid and wireframe MeshBasicMaterial'),
        project('normal transparent materials project opacity across portable primitives'),
      ],
    },
  ),
  ...[
    'MeshDepthMaterial',
    'MeshDistanceMaterial',
    'MeshLambertMaterial',
    'MeshMatcapMaterial',
    'MeshNormalMaterial',
    'MeshPhongMaterial',
    'MeshPhysicalMaterial',
    'MeshStandardMaterial',
    'MeshToonMaterial',
    'RawShaderMaterial',
    'ShaderMaterial',
    'ShadowMaterial',
  ].map((name) =>
    row(
      'material',
      name,
      'diagnostic',
      'Rejected because correct output needs a GPU material pipeline.',
      {
        upstream: upstream('material', name),
        tests: [project('unsupported mesh material classes emit diagnostics')],
      },
    ),
  ),
  row(
    'material',
    'PointsMaterial',
    'partial',
    'Colour, normal alpha transparency, per-point RGB, fog, size, attenuation, and the constrained point-sprite colour-map subset work.',
    {
      upstream: upstream('material', 'PointsMaterial'),
      tests: [
        points,
        project('PointsMaterial multiplies per-point RGB colours'),
        project('normal transparent materials project opacity across portable primitives'),
        project('PointsMaterial map becomes a portable point-sprite texture'),
      ],
    },
  ),
  row(
    'material',
    'SpriteMaterial',
    'partial',
    'Solid colour, fog, normal alpha transparency, and the constrained affine colour-map subset work.',
    {
      upstream: upstream('material', 'SpriteMaterial'),
      tests: [
        project('Sprite projects its billboard centre, rotation, and perspective attenuation'),
        project('SpriteMaterial map preserves billboard UVs through clipping'),
        project('normal transparent materials project opacity across portable primitives'),
        project('unsupported SpriteMaterial features are omitted with diagnostics'),
      ],
    },
  ),

  row('geometry', 'non-indexed BufferGeometry', 'full', 'Position triples render directly.', {
    tests: [triangle],
  }),
  row(
    'geometry',
    'indexed BufferGeometry',
    'full',
    'Index buffers drive triangle, line, and point lookup.',
    {
      tests: [project('indexed geometry emits each triangle')],
    },
  ),
  row('geometry', 'drawRange', 'full', 'Ranges intersect topology and material groups.', {
    tests: [project('material groups intersect the geometry draw range')],
  }),
  row('geometry', 'geometry groups', 'full', 'Material arrays preserve group ranges and colours.', {
    tests: [project('material arrays preserve BufferGeometry group colours')],
  }),
  row(
    'geometry',
    'world transforms',
    'full',
    'Nested object matrices are applied before projection.',
    {
      tests: [
        project('world transforms under groups are baked into the projected path'),
        project('mirrored mesh transforms preserve Three.js front-face semantics'),
      ],
    },
  ),
  row(
    'geometry',
    'homogeneous frustum clipping',
    'full',
    'Triangles and lines clip against all six planes.',
    {
      tests: [
        project('the homogeneous clip volume cuts a near-plane crossing instead of exploding it'),
        project('a line crossing the near plane is clipped to finite viewport coordinates'),
      ],
    },
  ),
  row(
    'geometry',
    'front, back, and double side',
    'full',
    'Face winding and material side are honoured.',
    {
      tests: [project('face side is respected after the viewport y-axis is flipped')],
    },
  ),
  row(
    'geometry',
    'mesh and point morph targets',
    'full',
    'Absolute and relative position morphs are evaluated before projection.',
    {
      tests: [
        project('absolute and relative mesh morph targets deform projected triangles'),
        project('point morph targets move projected points'),
      ],
    },
  ),
  row('geometry', 'line morph targets', 'full', 'Position morphs deform line vertices.', {
    tests: [project('line morph targets deform projected segments')],
  }),
  row(
    'geometry',
    'vertex colours',
    'partial',
    'Mesh, line, and point RGB attributes work through portable interpolation, including clipped vertices. Mesh interpolation is screen-space rather than perspective-correct; RGBA attributes and vertex-coloured wireframes remain diagnosed.',
    {
      tests: [
        project('mesh vertex colours become a portable interpolated triangle'),
        project('mesh clipping interpolates vertex colours at generated edges'),
        project('PointsMaterial multiplies per-point RGB colours'),
        project('LineBasicMaterial projects clipped RGB vertex colours as a portable gradient'),
        project('RGBA vertex attributes diagnose instead of silently dropping alpha'),
      ],
    },
  ),
  row(
    'geometry',
    'textures and UV sampling',
    'partial',
    'Clamped sRGB mesh, sprite, and point-sprite colour maps use affine Canvas sampling; repeat seams, modulation, mipmaps, and other texture roles stay diagnostic.',
    {
      tests: [
        project('MeshBasicMaterial map and UVs become a portable textured triangle'),
        project('mesh clipping interpolates texture coordinates at generated edges'),
        project('SpriteMaterial map preserves billboard UVs through clipping'),
        project('unsupported MeshBasicMaterial features emit diagnostics'),
        project('PointsMaterial map becomes a portable point-sprite texture'),
      ],
    },
  ),
  row(
    'geometry',
    'transparency and blending',
    'partial',
    'Normal alpha transparency maps to Canvas opacity after opaque primitives, and uniform alphaTest discards whole primitives. Per-fragment alpha hash, MSAA alpha-to-coverage, dithering, and custom blending are diagnosed.',
    {
      tests: [
        project('normal transparent materials project opacity across portable primitives'),
        project('uniform alphaTest omits every supported primitive only below its threshold'),
        project('transparent primitives paint after opaque primitives'),
        project(
          'non-default depth, stencil, write, offset, blending, and sampling state emit diagnostics',
        ),
      ],
    },
  ),
  row(
    'geometry',
    'material clipping planes',
    'full',
    'World-space intersection and union clipping cut meshes, lines, and billboards, and discard points.',
    {
      tests: [
        project('material clipping planes cut meshes and lines and discard points in world space'),
        project('clipIntersection retains the disjoint union of material half-spaces'),
        project('Sprite clipping planes cut billboards and preserve disjoint union regions'),
      ],
    },
  ),

  row(
    'scene',
    'object and material visibility',
    'full',
    'Invisible objects and draw calls remain absent.',
    {
      tests: [project('an invisible material emits neither geometry nor a diagnostic')],
    },
  ),
  row(
    'scene',
    'depth ordering',
    'partial',
    'Primitives use painter ordering, not a per-pixel depth buffer.',
    {
      tests: [project('far triangles are painted before near triangles')],
    },
  ),
  row(
    'scene',
    'Object3D.renderOrder',
    'full',
    'Explicit object render order groups override the portable painter depth order.',
    {
      tests: [
        project('renderOrder overrides painter depth while preserving stable object order'),
        project('Group renderOrder applies to its projected descendants'),
      ],
    },
  ),
  row(
    'scene',
    'camera layers',
    'full',
    'Camera and object layer masks filter renderable objects without pruning descendants.',
    {
      tests: [project('camera layers filter objects without hiding matching descendants')],
    },
  ),
  row(
    'scene',
    'Scene.overrideMaterial',
    'partial',
    'Supported overrides replace eligible render-list materials while preserving visibility and allowOverride.',
    {
      tests: [project('Scene.overrideMaterial preserves render-list visibility and allowOverride')],
    },
  ),
  row(
    'scene',
    'Scene.background',
    'partial',
    'Solid colours and constrained 2D colour textures become non-interactive viewport decoration; environment sampling, blur, and intensity modulation are diagnosed.',
    {
      tests: [
        project('solid scene backgrounds become non-interactive Canvas rectangles'),
        project('a 2D texture background becomes a viewport-sized portable mesh'),
        canvas('ThreeCanvas paints scene backgrounds without creating an object control'),
        project('environment backgrounds are diagnosed while portable geometry remains visible'),
      ],
    },
  ),
  row(
    'scene',
    'scene fog',
    'partial',
    'Fog and FogExp2 blend meshes, wireframes, lines, points, and sprites. Point and constant-depth output is exact; varying-depth gradients approximate the fragment shader at portable vertices and endpoints.',
    {
      tests: [
        project('linear fog blends mesh vertices and honours material fog opt-out'),
        project('fog is evaluated at vertices created by homogeneous clipping'),
        project('fog follows lines, points, sprites, and exponential density'),
        project('invalid fog ranges are diagnosed instead of producing non-finite colours'),
      ],
    },
  ),
  row(
    'scene',
    'renderer tone mapping',
    'out-of-scope',
    'The portable Canvas contract fixes NoToneMapping and has no renderer tone-mapping option.',
  ),
  row(
    'scene',
    'depth and stencil material state',
    'diagnostic',
    'Non-default depth, stencil, colour-write, polygon-offset, and blending state is rejected.',
    {
      tests: [
        project(
          'non-default depth, stencil, write, offset, blending, and sampling state emit diagnostics',
        ),
      ],
    },
  ),

  row(
    'interaction',
    'demand invalidation',
    'full',
    'Revision and imperative invalidation re-project mutations.',
    {
      tests: [
        canvas('ThreeCanvas draws a projected Three scene and invalidates imperative mutations'),
      ],
    },
  ),
  row(
    'interaction',
    'continuous frame loop',
    'full',
    'onFrame runs before each projection and cancels on unmount.',
    {
      tests: [canvas('the continuous loop updates before projecting and stops on unmount')],
    },
  ),
  row(
    'interaction',
    'object raycast activation',
    'full',
    'Canvas activation carries the source object and intersection.',
    {
      tests: [canvas('projected triangles raycast as one named Three object')],
    },
  ),
  row(
    'interaction',
    'object semantic controls',
    'full',
    'Many projected shapes share one labelled control per object.',
    {
      tests: [canvas('projected triangles raycast as one named Three object')],
    },
  ),
] as const

export interface ThreeConformanceSummary {
  diagnostic: number
  exact: number
  inScope: number
  outOfScope: number
  partial: number
  safe: number
  silent: number
  usable: number
}

export function summarizeThreeConformance(
  cases: readonly ThreeConformanceCase[] = THREE_CONFORMANCE_CASES,
): ThreeConformanceSummary {
  const count = (status: ThreeConformanceStatus) =>
    cases.filter((entry) => entry.status === status).length
  const exact = count('full')
  const partial = count('partial')
  const diagnostic = count('diagnostic')
  const silent = count('silent')
  const outOfScope = count('out-of-scope')
  return {
    exact,
    partial,
    diagnostic,
    silent,
    outOfScope,
    inScope: cases.length - outOfScope,
    usable: exact + partial,
    safe: exact + partial + diagnostic,
  }
}
