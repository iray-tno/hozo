# @hozo/next

## 0.2.0

### Minor Changes

- [#425](https://github.com/iray-tno/hozo/pull/425) [`2cf3139`](https://github.com/iray-tno/hozo/commit/2cf31399c7cb9ffe8651339e034870d88629c5cc) Thanks [@iray-tno](https://github.com/iray-tno)! - Add the patterns package for accessible composite components. Core now re-exports one canonical
  implementation, behaviors is headless, and generated Dialog imports resolve to the owning package.

- [#424](https://github.com/iray-tno/hozo/pull/424) [`78840c3`](https://github.com/iray-tno/hozo/commit/78840c302df3a25287446ee409ebc7910d58b76f) Thanks [@iray-tno](https://github.com/iray-tno)! - Add the canonical primitives package and move ScrollView, FlatList, RefreshControl, and private
  windowing into it. Generated Web and Native code now import collection primitives from their owner,
  and the core fallback uses the same windowed FlatList as compiled output.

- [#383](https://github.com/iray-tno/hozo/pull/383) [`402abaa`](https://github.com/iray-tno/hozo/commit/402abaadb5396a2a24400b10111fa48250335d39) Thanks [@iray-tno](https://github.com/iray-tno)! - Add an opt-in `rnwFree` project setting that fails Web builds when emitted JSX
  still uses a binding imported directly from React Native. The check is based on
  parser binding metadata, so aliases and namespace JSX are exact while comments
  and type-only mentions are ignored.

### Patch Changes

- [#370](https://github.com/iray-tno/hozo/pull/370) [`959ec93`](https://github.com/iray-tno/hozo/commit/959ec93f578b13e4abd706f99f89e49df73a3075) Thanks [@iray-tno](https://github.com/iray-tno)! - Normalize React Native inline style arrays before they reach React DOM while keeping static class-only output runtime-free. Preserve native StyleProp semantics, convert compatible structured values, and explicitly report native-only values that Web cannot reproduce.
- Updated dependencies [[`2cf3139`](https://github.com/iray-tno/hozo/commit/2cf31399c7cb9ffe8651339e034870d88629c5cc), [`e40f5fc`](https://github.com/iray-tno/hozo/commit/e40f5fc41903a7fc1652be1b545195d63266a72e), [`78840c3`](https://github.com/iray-tno/hozo/commit/78840c302df3a25287446ee409ebc7910d58b76f), [`0e6f1fb`](https://github.com/iray-tno/hozo/commit/0e6f1fb0d98cc5d58b6c5e706d26646ec84f6454), [`e4e2d89`](https://github.com/iray-tno/hozo/commit/e4e2d898135acf7c8efae6f6a3f208ecb536804a), [`0600975`](https://github.com/iray-tno/hozo/commit/06009758fee5bcebdd2ae10e49ad475db965fc25), [`24d2948`](https://github.com/iray-tno/hozo/commit/24d294845a99d11f7944378a1f9fcb80fe108b6a), [`fd03b2d`](https://github.com/iray-tno/hozo/commit/fd03b2d6b70573a14e4b0562cbbdc561e9998fb7), [`402abaa`](https://github.com/iray-tno/hozo/commit/402abaadb5396a2a24400b10111fa48250335d39), [`46bef84`](https://github.com/iray-tno/hozo/commit/46bef849faa30896aa9925a2c05f38c71b620292), [`7e43220`](https://github.com/iray-tno/hozo/commit/7e43220dee17dcc567db0584a704dde4809bf5a6), [`5c6eb21`](https://github.com/iray-tno/hozo/commit/5c6eb218e65e71e1216b8b9f69c800faf8800b40), [`959ec93`](https://github.com/iray-tno/hozo/commit/959ec93f578b13e4abd706f99f89e49df73a3075), [`370897d`](https://github.com/iray-tno/hozo/commit/370897dbe1459574c9b52b7b0c38e582f31b5649), [`a1012c2`](https://github.com/iray-tno/hozo/commit/a1012c246a4ea307203a0ae49ef8fd039b0cee21), [`f023b94`](https://github.com/iray-tno/hozo/commit/f023b94e88ca666c3f08c69c1e0fe886228f1876), [`6e3430e`](https://github.com/iray-tno/hozo/commit/6e3430e8ca814b792a847951bc05ac6f77036559)]:
  - @hozo/patterns@0.2.0
  - @hozo/compiler@0.2.0
  - @hozo/runtime@0.2.0
  - @hozo/primitives@0.2.0
  - @hozo/tailwind@0.2.0
