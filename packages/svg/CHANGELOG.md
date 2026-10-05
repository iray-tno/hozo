# @hozo/svg

## 0.2.0

- Expose Filter, FeColorMatrix, FeGaussianBlur, FeBlend, FeComposite, FeDropShadow, FeFlood, FeMerge, FeMergeNode and FeOffset through author and compiler APIs.
- Adapt Android blur/shadow units for density, root viewBox scaling and kernel mapping, backed by shared browser and Native pixel probes.
- Raise the optional `react-native-svg` peer floor to >=15.9.0. Upstream filter limits and Android isotropic/capped-kernel limits remain documented in the README.

See the [Hozo release notes and migration steps](https://github.com/iray-tno/hozo/blob/main/CHANGELOG.md#020) for cross-package changes and measured boundaries.

### Patch Changes

- Updated Hozo dependencies:
  - @hozo/engine@0.2.0
