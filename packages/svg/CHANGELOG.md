# @hozo/svg

## 0.4.0

### Patch Changes

- Updated dependencies [[`fac2f53`](https://github.com/iray-tno/hozo/commit/fac2f53a7636c7373cf22c4d49fcf5a137bb08ec), [`add3e7b`](https://github.com/iray-tno/hozo/commit/add3e7b2c5a152c770eabee7d09d723e925958e1), [`b59995e`](https://github.com/iray-tno/hozo/commit/b59995e108e4cc9b6d093c2487cebece0d02a707), [`c1ca21a`](https://github.com/iray-tno/hozo/commit/c1ca21afee0e3f4dd92110570f3ff3775b01c4cf), [`c9a3b4d`](https://github.com/iray-tno/hozo/commit/c9a3b4d61541024c66165c91a4b7e2a75c9a203c), [`416d627`](https://github.com/iray-tno/hozo/commit/416d627e8afc6a3f321c95dbe1f74b630d173d7b)]:
  - @hozo/engine@0.4.0

## 0.3.0

### Minor Changes

- [#819](https://github.com/iray-tno/hozo/pull/819) [`a2e519b`](https://github.com/iray-tno/hozo/commit/a2e519b4a11b17154ea7dc62ac6d371f8d4f170a) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `Icon`, which draws an icon from the `IconNode` data `lucide` exports: an inline `<svg>` on the Web and `react-native-svg` on Native. No icon set is bundled; the application imports the icons it uses. An icon is decoration (hidden from assistive technology) unless it has an `accessibilityLabel`, in which case it is one image with that name.

### Patch Changes

- [#923](https://github.com/iray-tno/hozo/pull/923) [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6) Thanks [@iray-tno](https://github.com/iray-tno)! - Uncompiled View, Text and Image forward refs to their platform hosts. Container measurement preserves the host instead of replacing it, and Web View layout defaults agree between compiled output and fallback components.
  
  An uncompiled Svg now uses its accessibility label as its name, as the compiled path already did. Web controls, including generated Canvas controls and form/pattern actions, show the shared clickable cursor without giving disabled controls an active pointer.
- Updated dependencies [[`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6)]:
  - @hozo/engine@0.3.0

## 0.2.0

- Expose Filter, FeColorMatrix, FeGaussianBlur, FeBlend, FeComposite, FeDropShadow, FeFlood, FeMerge, FeMergeNode and FeOffset through author and compiler APIs.
- Adapt Android blur/shadow units for density, root viewBox scaling and kernel mapping, backed by shared browser and Native pixel probes.
- Raise the optional `react-native-svg` peer floor to >=15.9.0. Upstream filter limits and Android isotropic/capped-kernel limits remain documented in the README.

See the [Hozo release notes and migration steps](https://github.com/iray-tno/hozo/blob/main/CHANGELOG.md#020) for cross-package changes and measured boundaries.

### Patch Changes

- Updated Hozo dependencies:
  - @hozo/engine@0.2.0
