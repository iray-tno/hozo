# @hozo/three

## 0.5.0

### Patch Changes

- Updated dependencies [[`6cf46e3`](https://github.com/iray-tno/hozo/commit/6cf46e30640459d327305ffce8b38d26e27b3a9b), [`052b447`](https://github.com/iray-tno/hozo/commit/052b447351a669a12c5b8ced61bef5d07dc8a604), [`43680e3`](https://github.com/iray-tno/hozo/commit/43680e3643ba9f3f6e01f5c7aa885feb8e5c7b04)]:
  - @hozo/engine@0.5.0
  - @hozo/canvas@0.5.0

## 0.4.0

### Minor Changes

- [#1597](https://github.com/iray-tno/hozo/pull/1597) [`b3df5b7`](https://github.com/iray-tno/hozo/commit/b3df5b73a8ec104fe407d89472e4339411de311d) Thanks [@iray-tno](https://github.com/iray-tno)! - React Native 0.87 is now the lowest supported version (`react-native: >=0.87`), and `@hozo/media`'s Expo peers move to SDK 58 (`expo-video`, `expo-audio` and `expo-asset` `>=58 <59`). Native gradients go under `backgroundImage` again: the `experimental_backgroundImage` spelling existed only for React Native 0.86, which read nothing else.

### Patch Changes

- Updated dependencies [[`fac2f53`](https://github.com/iray-tno/hozo/commit/fac2f53a7636c7373cf22c4d49fcf5a137bb08ec), [`add3e7b`](https://github.com/iray-tno/hozo/commit/add3e7b2c5a152c770eabee7d09d723e925958e1), [`b59995e`](https://github.com/iray-tno/hozo/commit/b59995e108e4cc9b6d093c2487cebece0d02a707), [`c1ca21a`](https://github.com/iray-tno/hozo/commit/c1ca21afee0e3f4dd92110570f3ff3775b01c4cf), [`b3df5b7`](https://github.com/iray-tno/hozo/commit/b3df5b73a8ec104fe407d89472e4339411de311d), [`c9a3b4d`](https://github.com/iray-tno/hozo/commit/c9a3b4d61541024c66165c91a4b7e2a75c9a203c), [`416d627`](https://github.com/iray-tno/hozo/commit/416d627e8afc6a3f321c95dbe1f74b630d173d7b)]:
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
