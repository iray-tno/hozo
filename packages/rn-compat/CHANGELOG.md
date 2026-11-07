# @hozo/rn-compat

## 0.4.1

### Patch Changes

- Updated dependencies [[`e5c848d`](https://github.com/iray-tno/hozo/commit/e5c848de8f4ff732fc7fc4a2d343e34938df1800), [`6cf46e3`](https://github.com/iray-tno/hozo/commit/6cf46e30640459d327305ffce8b38d26e27b3a9b)]:
  - @hozo/primitives@0.4.1
  - @hozo/engine@0.4.1

## 0.4.0

### Minor Changes

- [#1597](https://github.com/iray-tno/hozo/pull/1597) [`b3df5b7`](https://github.com/iray-tno/hozo/commit/b3df5b73a8ec104fe407d89472e4339411de311d) Thanks [@iray-tno](https://github.com/iray-tno)! - React Native 0.87 is now the lowest supported version (`react-native: >=0.87`), and `@hozo/media`'s Expo peers move to SDK 58 (`expo-video`, `expo-audio` and `expo-asset` `>=58 <59`). Native gradients go under `backgroundImage` again: the `experimental_backgroundImage` spelling existed only for React Native 0.86, which read nothing else.

### Patch Changes

- Updated dependencies [[`d7dd5b9`](https://github.com/iray-tno/hozo/commit/d7dd5b9d91a77c6cf647ba2de6fb321f8e558613), [`27536fc`](https://github.com/iray-tno/hozo/commit/27536fc602947b8928df7fa4d8940363fc0e3a67), [`99892e2`](https://github.com/iray-tno/hozo/commit/99892e25f536991e2966aa60769bd7155d5d8336), [`1b54676`](https://github.com/iray-tno/hozo/commit/1b54676fbc476f848d2e834a9443fde0bf888ce9), [`fac2f53`](https://github.com/iray-tno/hozo/commit/fac2f53a7636c7373cf22c4d49fcf5a137bb08ec), [`b0c6f22`](https://github.com/iray-tno/hozo/commit/b0c6f220c74d8a5c5a0c13bcf5fc9f8b97a25419), [`add3e7b`](https://github.com/iray-tno/hozo/commit/add3e7b2c5a152c770eabee7d09d723e925958e1), [`ffd5b6b`](https://github.com/iray-tno/hozo/commit/ffd5b6bbb0021d512d416fc5d8ae7441cc18c463), [`b59995e`](https://github.com/iray-tno/hozo/commit/b59995e108e4cc9b6d093c2487cebece0d02a707), [`c1ca21a`](https://github.com/iray-tno/hozo/commit/c1ca21afee0e3f4dd92110570f3ff3775b01c4cf), [`cf7773e`](https://github.com/iray-tno/hozo/commit/cf7773edcfd5f9d9cb42e35489ce1b15e35312bb), [`b3df5b7`](https://github.com/iray-tno/hozo/commit/b3df5b73a8ec104fe407d89472e4339411de311d), [`c9a3b4d`](https://github.com/iray-tno/hozo/commit/c9a3b4d61541024c66165c91a4b7e2a75c9a203c), [`416d627`](https://github.com/iray-tno/hozo/commit/416d627e8afc6a3f321c95dbe1f74b630d173d7b), [`242253d`](https://github.com/iray-tno/hozo/commit/242253da3910698e0838d74cbc9d51e1ca5995d6), [`e7d97e9`](https://github.com/iray-tno/hozo/commit/e7d97e981615355534d0ea20c4a70410556cbda4)]:
  - @hozo/primitives@0.4.0
  - @hozo/engine@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [[`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6)]:
  - @hozo/primitives@0.3.0
  - @hozo/engine@0.3.0

## 0.2.0

- Use React 19 ref props in ActivityIndicator, Animated.View and Touchable wrappers while preserving author-facing ref behaviour.
- Release the compatibility layer with the matching primitive/engine versions; this does not claim that all non-JSX RN APIs or third-party RNW dependencies are replaced.

See the [Hozo release notes and migration steps](https://github.com/iray-tno/hozo/blob/main/CHANGELOG.md#020) for cross-package changes and measured boundaries.

### Patch Changes

- Updated Hozo dependencies:
  - @hozo/primitives@0.2.0
  - @hozo/engine@0.2.0
