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
    'Points become circles with optional perspective attenuation.',
    {
      tests: [points],
    },
  ),

  row('object', 'BatchedMesh', 'silent', 'Batch transforms and visibility are not evaluated.', {
    upstream: upstream('object', 'BatchedMesh'),
  }),
  row('object', 'Bone', 'out-of-scope', 'A Bone has no independent render primitive.', {
    upstream: upstream('object', 'Bone'),
  }),
  row('object', 'Group', 'full', 'Visibility and nested world transforms are traversed.', {
    upstream: upstream('object', 'Group'),
    tests: [project('world transforms under groups are baked into the projected path')],
  }),
  row('object', 'InstancedMesh', 'diagnostic', 'Rejected with UNSUPPORTED_MESH.', {
    upstream: upstream('object', 'InstancedMesh'),
    tests: [project('unsupported mesh variants emit diagnostics')],
  }),
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
    'silent',
    'All visible levels are traversed instead of selecting one by distance.',
    {
      upstream: upstream('object', 'LOD'),
    },
  ),
  row('object', 'Mesh', 'full', 'Triangle meshes use the supported material subset.', {
    upstream: upstream('object', 'Mesh'),
    tests: [triangle],
  }),
  row('object', 'Points', 'full', 'Point vertices project through the circle pipeline.', {
    upstream: upstream('object', 'Points'),
    tests: [points],
  }),
  row('object', 'Skeleton', 'out-of-scope', 'A Skeleton is data consumed by SkinnedMesh.', {
    upstream: upstream('object', 'Skeleton'),
  }),
  row('object', 'SkinnedMesh', 'diagnostic', 'Rejected with UNSUPPORTED_MESH.', {
    upstream: upstream('object', 'SkinnedMesh'),
    tests: [project('unsupported mesh variants emit diagnostics')],
  }),
  row('object', 'Sprite', 'silent', 'Sprites currently disappear without a diagnostic.', {
    upstream: upstream('object', 'Sprite'),
  }),

  row('camera', 'ArrayCamera', 'silent', 'Its child cameras and viewports are ignored.', {
    upstream: upstream('camera', 'ArrayCamera'),
  }),
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
    'Opaque colour and width work; advanced base material state does not.',
    {
      upstream: upstream('material', 'LineBasicMaterial'),
      tests: [
        project('LineSegments become independent Canvas lines with material colour and width'),
      ],
    },
  ),
  row('material', 'LineDashedMaterial', 'diagnostic', 'Dashed lines are rejected explicitly.', {
    upstream: upstream('material', 'LineDashedMaterial'),
    tests: [project('unsupported dashed line materials are omitted with a diagnostic')],
  }),
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
    'Opaque flat colour, sides, groups, and wireframe work.',
    {
      upstream: upstream('material', 'MeshBasicMaterial'),
      tests: [triangle, project('groups can mix solid and wireframe MeshBasicMaterial')],
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
    'Opaque untextured colour, size, and attenuation work.',
    {
      upstream: upstream('material', 'PointsMaterial'),
      tests: [points, project('textured points are omitted with a diagnostic')],
    },
  ),
  row(
    'material',
    'SpriteMaterial',
    'silent',
    'The owning Sprite disappears without a diagnostic.',
    {
      upstream: upstream('material', 'SpriteMaterial'),
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
      tests: [project('world transforms under groups are baked into the projected path')],
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
    'diagnostic',
    'Active mesh and point morph targets are rejected.',
    {
      tests: [project('active mesh and point morph targets emit diagnostics')],
    },
  ),
  row('geometry', 'line morph targets', 'silent', 'Active line morph targets are ignored.'),
  row(
    'geometry',
    'vertex colours',
    'diagnostic',
    'Interpolation is unavailable in the flat Canvas backend.',
    {
      tests: [project('unsupported MeshBasicMaterial features emit diagnostics')],
    },
  ),
  row(
    'geometry',
    'textures and UV sampling',
    'diagnostic',
    'Texture sampling requires a GPU backend.',
    {
      tests: [
        project('unsupported MeshBasicMaterial features emit diagnostics'),
        project('textured points are omitted with a diagnostic'),
      ],
    },
  ),
  row('geometry', 'transparency and blending', 'diagnostic', 'Non-opaque materials are rejected.', {
    tests: [project('unsupported MeshBasicMaterial features emit diagnostics')],
  }),
  row(
    'geometry',
    'material clipping planes',
    'diagnostic',
    'Per-material clipping planes are rejected.',
    {
      tests: [project('unsupported MeshBasicMaterial features emit diagnostics')],
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
    'silent',
    'Explicit Three.js render order is currently ignored.',
  ),
  row('scene', 'camera layers', 'silent', 'Camera and object layer masks are currently ignored.'),
  row('scene', 'Scene.overrideMaterial', 'silent', 'The override material is currently ignored.'),
  row(
    'scene',
    'Scene.background',
    'silent',
    'Scene background colour and textures are not projected.',
  ),
  row(
    'scene',
    'fog and tone mapping',
    'silent',
    'Accepted flat materials do not apply scene fog or tone mapping.',
  ),
  row(
    'scene',
    'depth and stencil material state',
    'silent',
    'depthTest, depthWrite, and stencil state are ignored.',
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
