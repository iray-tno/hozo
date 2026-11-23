# @hozo/storybook

## 0.5.0

### Patch Changes

- [#2039](https://github.com/iray-tno/hozo/pull/2039) [`f275261`](https://github.com/iray-tno/hozo/commit/f2752612d8b73d422b15feff4ce921689a68f997) Thanks [@iray-tno](https://github.com/iray-tno)! - `@hozo/storybook` no longer adds a second `hozo()` when Storybook's Vite config already has one. Storybook's Vite builder loads the project's `vite.config`, so a Vite project that followed both getting-started guides ran Hozo twice in Storybook, which can drop CSS (a Vite build of `examples/login-demo` with two lost the scroll-view and pointer-events base rules). The project's own `hozo()` and its options now stand.
- Updated dependencies [[`2f386b3`](https://github.com/iray-tno/hozo/commit/2f386b331c1138559f6853f5914d6e17d0906a41), [`761c10e`](https://github.com/iray-tno/hozo/commit/761c10eff8b5a557fa515caa0013a9a3e15c57d2), [`43575f1`](https://github.com/iray-tno/hozo/commit/43575f1ba514c3b6e9ee802c98ed258e7b39c8f0), [`13f3627`](https://github.com/iray-tno/hozo/commit/13f36270cf3c0b74d1deded097f934f1cab8dc7e), [`cb279ae`](https://github.com/iray-tno/hozo/commit/cb279aea998bd95c38992ccfc24abf19fd4ae238), [`8848082`](https://github.com/iray-tno/hozo/commit/88480828311188e4d014ad6db4dc21474071dbdb), [`b13d353`](https://github.com/iray-tno/hozo/commit/b13d353104667860f4a9b6c93a2bb0113c83765e), [`77966e2`](https://github.com/iray-tno/hozo/commit/77966e2cd550358692060dfa9093247582ed0933), [`305ce63`](https://github.com/iray-tno/hozo/commit/305ce6317b385fa7e8c8199cd19ca699032cf2b3), [`b3cf38b`](https://github.com/iray-tno/hozo/commit/b3cf38b30f2fe748c4f73110d01de2566826355a)]:
  - @hozo/vite@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies []:
  - @hozo/vite@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [[`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6)]:
  - @hozo/vite@0.3.0

## 0.2.0

- Correct the Vite peer range to `^8.0.0` in line with the Vite integration.
- Release with the compiler’s source-package discovery and motion/theme support. React Native Storybook lives in the repository showcase application; this package remains the Web Storybook integration.

See the [Hozo release notes and migration steps](https://github.com/iray-tno/hozo/blob/main/CHANGELOG.md#020) for cross-package changes and measured boundaries.

### Patch Changes

- Updated Hozo dependencies:
  - @hozo/vite@0.2.0
