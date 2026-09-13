# @hozo/migration-audit

## 0.2.0

### Minor Changes

- [#367](https://github.com/iray-tno/hozo/pull/367) [`477ed39`](https://github.com/iray-tno/hozo/commit/477ed3900cb37d22583c8bdbd5b561ce94f6ed6c) Thanks [@iray-tno](https://github.com/iray-tno)! - Add a read-only CLI for measuring Hozo lowering against pinned or local React Native application
  corpora.

### Patch Changes

- [#378](https://github.com/iray-tno/hozo/pull/378) [`0e6f1fb`](https://github.com/iray-tno/hozo/commit/0e6f1fb0d98cc5d58b6c5e706d26646ec84f6454) Thanks [@iray-tno](https://github.com/iray-tno)! - Expose AST-derived JSX binding usage from the compiler and use it for real-app
  residue measurement, excluding comments and TypeScript type arguments without
  losing namespace JSX such as `Animated.View`.

- [#370](https://github.com/iray-tno/hozo/pull/370) [`959ec93`](https://github.com/iray-tno/hozo/commit/959ec93f578b13e4abd706f99f89e49df73a3075) Thanks [@iray-tno](https://github.com/iray-tno)! - Normalize React Native inline style arrays before they reach React DOM while keeping static class-only output runtime-free. Preserve native StyleProp semantics, convert compatible structured values, and explicitly report native-only values that Web cannot reproduce.
- Updated dependencies [[`2cf3139`](https://github.com/iray-tno/hozo/commit/2cf31399c7cb9ffe8651339e034870d88629c5cc), [`e40f5fc`](https://github.com/iray-tno/hozo/commit/e40f5fc41903a7fc1652be1b545195d63266a72e), [`78840c3`](https://github.com/iray-tno/hozo/commit/78840c302df3a25287446ee409ebc7910d58b76f), [`0e6f1fb`](https://github.com/iray-tno/hozo/commit/0e6f1fb0d98cc5d58b6c5e706d26646ec84f6454), [`e4e2d89`](https://github.com/iray-tno/hozo/commit/e4e2d898135acf7c8efae6f6a3f208ecb536804a), [`24d2948`](https://github.com/iray-tno/hozo/commit/24d294845a99d11f7944378a1f9fcb80fe108b6a), [`402abaa`](https://github.com/iray-tno/hozo/commit/402abaadb5396a2a24400b10111fa48250335d39), [`46bef84`](https://github.com/iray-tno/hozo/commit/46bef849faa30896aa9925a2c05f38c71b620292), [`959ec93`](https://github.com/iray-tno/hozo/commit/959ec93f578b13e4abd706f99f89e49df73a3075), [`370897d`](https://github.com/iray-tno/hozo/commit/370897dbe1459574c9b52b7b0c38e582f31b5649), [`a1012c2`](https://github.com/iray-tno/hozo/commit/a1012c246a4ea307203a0ae49ef8fd039b0cee21), [`f023b94`](https://github.com/iray-tno/hozo/commit/f023b94e88ca666c3f08c69c1e0fe886228f1876), [`6e3430e`](https://github.com/iray-tno/hozo/commit/6e3430e8ca814b792a847951bc05ac6f77036559)]:
  - @hozo/compiler@0.2.0
