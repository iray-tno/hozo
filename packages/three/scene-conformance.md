# Three.js real-scene coverage

Generated against Three.js r180. The machine-readable form is [scene-conformance.json](./scene-conformance.json).

This report executes representative, version-pinned scenes instead of treating an API inventory as an application success rate. A fixture is verified when its observed output and diagnostics match its pinned expectation. Renderer families are reported separately: **not-run is unknown, not success**.

## Summary

- Portable: **4 useful**, **1 safely diagnostic**, **0 failed** across 5 fixtures.
- Classic WebGL: **5 not run**.
- Modern WebGPU-family: **5 not run**.
- Native host: **5 not run**.

The checked-in report remains deterministic and therefore leaves driver-backed families as not-run. The separate `test:gpu` artifact executes these exact fixtures in Classic WebGL, Modern forced-WebGL 2, and native WebGPU when available on main, weekly, and on demand; its result is environment evidence rather than a value copied into this file.

The ordinary glTF/PBR fixture intentionally demonstrates the current portable boundary: the asset is loaded through Three.js's GLTFLoader, then its MeshStandardMaterial is rejected with an explicit diagnostic instead of producing misleading flat output.

## Fixtures

| Fixture | Source/version | Exercises | Portable | Classic WebGL | Modern WebGPU-family | Native host | Observation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| flat diagram / labelled interaction | scripts/scene-fixtures.ts#flatDiagram (corpus-v1 / Three.js r180) | orthographic camera, flat meshes, line segments, named interaction targets | useful | not-run — classic-webgl corpus execution is not wired into CI yet | not-run — modern-webgpu corpus execution is not wired into CI yet | not-run — native-host corpus execution is not wired into CI yet | 4 nodes; 3 named objects; diagnostics: none |
| wireframe or CAD-like scene | scripts/scene-fixtures.ts#wireframeCad (corpus-v1 / Three.js r180) | box geometry, world rotation, wireframe material, depth ordering | useful | not-run — classic-webgl corpus execution is not wired into CI yet | not-run — modern-webgpu corpus execution is not wired into CI yet | not-run — native-host corpus execution is not wired into CI yet | 36 nodes; 1 named objects; diagnostics: none |
| points / sprite scene | scripts/scene-fixtures.ts#pointsAndSprite (corpus-v1 / Three.js r180) | points, fixed screen-space point size, sprite billboard, named targets | useful | not-run — classic-webgl corpus execution is not wired into CI yet | not-run — modern-webgpu corpus execution is not wired into CI yet | not-run — native-host corpus execution is not wired into CI yet | 4 nodes; 2 named objects; diagnostics: none |
| instancing plus morph with a portable material | scripts/scene-fixtures.ts#instancingAndMorph (corpus-v1 / Three.js r180) | instanced mesh, instance transforms, relative morph targets, MeshBasicMaterial | useful | not-run — classic-webgl corpus execution is not wired into CI yet | not-run — modern-webgpu corpus execution is not wired into CI yet | not-run — native-host corpus execution is not wired into CI yet | 2 nodes; 1 named objects; diagnostics: none |
| ordinary glTF/PBR scene | fixtures/minimal-pbr.gltf (glTF 2.0 / Three.js r180) | glTF 2.0 loader, asset graph, MeshStandardMaterial, PBR factors | diagnostic | not-run — classic-webgl corpus execution is not wired into CI yet | not-run — modern-webgpu corpus execution is not wired into CI yet | not-run — native-host corpus execution is not wired into CI yet | 0 nodes; 0 named objects; diagnostics: UNSUPPORTED_MATERIAL |

## Interpretation

This first corpus establishes the portable runner and five scenario contracts. It does not yet claim GPU or Native-host scene compatibility. Subsequent work should run these exact fixtures in each renderer family, then use named corpus failures—not a larger row percentage—to choose implementation work.
