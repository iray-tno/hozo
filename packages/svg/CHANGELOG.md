# @hozo/svg

## 0.3.0

### Minor Changes

- [#819](https://github.com/iray-tno/hozo/pull/819) [`a2e519b`](https://github.com/iray-tno/hozo/commit/a2e519b4a11b17154ea7dc62ac6d371f8d4f170a) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `Icon`, which draws an icon from the `IconNode` data `lucide` exports: an inline `<svg>` on the Web and `react-native-svg` on Native. No icon set is bundled; the application imports the icons it uses. An icon is decoration (hidden from assistive technology) unless it has an `accessibilityLabel`, in which case it is one image with that name.

### Patch Changes

- Updated dependencies []:
  - @hozo/engine@0.3.0

## 0.2.0

- Expose Filter, FeColorMatrix, FeGaussianBlur, FeBlend, FeComposite, FeDropShadow, FeFlood, FeMerge, FeMergeNode and FeOffset through author and compiler APIs.
- Adapt Android blur/shadow units for density, root viewBox scaling and kernel mapping, backed by shared browser and Native pixel probes.
- Raise the optional `react-native-svg` peer floor to >=15.9.0. Upstream filter limits and Android isotropic/capped-kernel limits remain documented in the README.

See the [Hozo release notes and migration steps](https://github.com/iray-tno/hozo/blob/main/CHANGELOG.md#020) for cross-package changes and measured boundaries.

### Patch Changes

- Updated Hozo dependencies:
  - @hozo/engine@0.2.0
