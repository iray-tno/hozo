# @hozo/three

## 0.2.0

- Introduce portable Three scene projection and responsive `ThreeCanvas`, with demand/continuous frames, picking and named semantic object controls.
- Support mesh/line/point/sprite topology, grouped materials, clipping, instancing/batching, morphs, skinning, fog, normal materials and constrained colour textures. Unsupported GPU semantics produce diagnostics.
- Add separate Web `webgl`, `webgpu` and `r3f` renderer entries, plus the explicit experimental Expo-prebuild `r3f-native` host. Optional GPU dependencies do not become requirements of the portable root.
- Publish distinct portable capability, upstream surface and version-pinned real-scene reports. Affine interpolation, bounded gradients and Native GPU/device limitations remain explicit in the README.

See the [Hozo release notes and migration steps](https://github.com/iray-tno/hozo/blob/main/CHANGELOG.md#020) for cross-package changes and measured boundaries.

### Patch Changes

- Updated Hozo dependencies:
  - @hozo/canvas@0.2.0
  - @hozo/engine@0.2.0
