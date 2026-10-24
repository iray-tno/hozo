# @hozo/three

## 0.4.0

### Patch Changes

- Updated dependencies [[`c1ca21a`](https://github.com/iray-tno/hozo/commit/c1ca21afee0e3f4dd92110570f3ff3775b01c4cf), [`416d627`](https://github.com/iray-tno/hozo/commit/416d627e8afc6a3f321c95dbe1f74b630d173d7b)]:
  - @hozo/engine@0.4.0
  - @hozo/canvas@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [[`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6)]:
  - @hozo/engine@0.3.0
  - @hozo/canvas@0.3.0

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
