# Three.js real-scene coverage

Generated against Three.js r180. The machine-readable form is [scene-conformance.json](./scene-conformance.json).

This report executes representative, version-pinned scenes instead of treating an API inventory as an application success rate. A fixture is verified when its observed output and diagnostics match its pinned expectation. Renderer families are reported separately: **not-run is unknown, not success**.

## Summary

- Portable: **4 useful**, **2 safely diagnostic**, **0 failed** across 6 fixtures.
- Classic WebGL: **6 not run**.
- Modern WebGPU-family: **6 not run**.
- Native host: **6 not run**.

The checked-in report remains deterministic and therefore leaves driver-backed families as not-run. The separate `test:gpu` artifact executes these exact fixtures in Classic WebGL, Modern forced-WebGL 2, and native WebGPU when available on main, weekly, and on demand; its result is environment evidence rather than a value copied into this file.

Both glTF/PBR fixtures intentionally demonstrate the current portable boundary: their assets load through Three.js's GLTFLoader, then MeshStandardMaterial is rejected with an explicit diagnostic instead of producing misleading flat output. The product-viewer fixture adds a node hierarchy, UVs, a punctual light, and an animation pose. Its small texture is attached from raw pixels after loading so Web and Native exercise GPU upload without claiming that host-specific image-file decoding works.

## Fixtures

| Fixture | Source/version | Exercises | Portable | Classic WebGL | Modern WebGPU-family | Native host | Observation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| flat diagram / labelled interaction | src/conformance-scenes.ts#flatDiagram (corpus-v1 / Three.js r180) | orthographic camera, flat meshes, line segments, named interaction targets | useful | not-run — classic-webgl result is emitted by its environment workflow and is not baked into this deterministic report | not-run — modern-webgpu result is emitted by its environment workflow and is not baked into this deterministic report | not-run — native-host result is emitted by its environment workflow and is not baked into this deterministic report | 4 nodes; 3 named objects; diagnostics: none |
| wireframe or CAD-like scene | src/conformance-scenes.ts#wireframeCad (corpus-v1 / Three.js r180) | box geometry, world rotation, wireframe material, depth ordering | useful | not-run — classic-webgl result is emitted by its environment workflow and is not baked into this deterministic report | not-run — modern-webgpu result is emitted by its environment workflow and is not baked into this deterministic report | not-run — native-host result is emitted by its environment workflow and is not baked into this deterministic report | 36 nodes; 1 named objects; diagnostics: none |
| points / sprite scene | src/conformance-scenes.ts#pointsAndSprite (corpus-v1 / Three.js r180) | points, fixed screen-space point size, sprite billboard, named targets | useful | not-run — classic-webgl result is emitted by its environment workflow and is not baked into this deterministic report | not-run — modern-webgpu result is emitted by its environment workflow and is not baked into this deterministic report | not-run — native-host result is emitted by its environment workflow and is not baked into this deterministic report | 4 nodes; 2 named objects; diagnostics: none |
| instancing plus morph with a portable material | src/conformance-scenes.ts#instancingAndMorph (corpus-v1 / Three.js r180) | instanced mesh, instance transforms, relative morph targets, MeshBasicMaterial | useful | not-run — classic-webgl result is emitted by its environment workflow and is not baked into this deterministic report | not-run — modern-webgpu result is emitted by its environment workflow and is not baked into this deterministic report | not-run — native-host result is emitted by its environment workflow and is not baked into this deterministic report | 2 nodes; 1 named objects; diagnostics: none |
| animated textured glTF product viewer | src/conformance-scenes.ts#productViewer (corpus-v1 / Three.js r180) | glTF 2.0 node hierarchy, PBR materials, UV-mapped raw texture, punctual light, animation pose | diagnostic | not-run — classic-webgl result is emitted by its environment workflow and is not baked into this deterministic report | not-run — modern-webgpu result is emitted by its environment workflow and is not baked into this deterministic report | not-run — native-host result is emitted by its environment workflow and is not baked into this deterministic report | 0 nodes; 0 named objects; diagnostics: UNSUPPORTED_MATERIAL, UNSUPPORTED_MATERIAL |
| ordinary glTF/PBR scene | fixtures/minimal-pbr.gltf (glTF 2.0 / Three.js r180) | glTF 2.0 loader, asset graph, MeshStandardMaterial, PBR factors | diagnostic | not-run — classic-webgl result is emitted by its environment workflow and is not baked into this deterministic report | not-run — modern-webgpu result is emitted by its environment workflow and is not baked into this deterministic report | not-run — native-host result is emitted by its environment workflow and is not baked into this deterministic report | 0 nodes; 0 named objects; diagnostics: UNSUPPORTED_MATERIAL |

## Interpretation

This corpus establishes the portable runner and six scenario contracts. It does not yet claim GPU or Native-host scene compatibility. Environment workflows run these same fixtures; their results should drive implementation work rather than a larger row percentage.
