# @hozo/navigation

## 0.5.0

### Minor Changes

- [#1919](https://github.com/iray-tno/hozo/pull/1919) [`9d20975`](https://github.com/iray-tno/hozo/commit/9d20975684383ed659085fc48dad34f70294505e) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `hozo manifest` and `hozo links` to `@hozo/cli`. They run the same commands as `hozo-manifest` and `hozo-links`. Both old binaries keep working for one minor release and print a deprecation line on stderr.
  
  Both now use the `hozo` exit codes: `1` for a stale file under `--check`, and `2` for a command that could not run. A `2` ends its stderr line with a string code such as `[config-not-found]`. `hozo-links` used to exit `1` for configuration errors. `hozo-manifest` used to ignore unknown options and crash on a package it could not read.
  
  `hozo-links` now also runs when npm links it into `node_modules/.bin` as a symlink. Before, the linked binary did nothing and exited `0`.
  
  `@hozo/navigation` is an optional peer of `@hozo/cli`. Without it, `hozo links` exits `2` with `[missing-package]`.

### Patch Changes

- Updated dependencies [[`6cf46e3`](https://github.com/iray-tno/hozo/commit/6cf46e30640459d327305ffce8b38d26e27b3a9b), [`052b447`](https://github.com/iray-tno/hozo/commit/052b447351a669a12c5b8ced61bef5d07dc8a604), [`43680e3`](https://github.com/iray-tno/hozo/commit/43680e3643ba9f3f6e01f5c7aa885feb8e5c7b04), [`b4cc4f6`](https://github.com/iray-tno/hozo/commit/b4cc4f6b4941ed6f9fb63ff1f942dad781b760e5)]:
  - @hozo/engine@0.5.0
  - @hozo/core@0.5.0

## 0.4.0

### Minor Changes

- [#1597](https://github.com/iray-tno/hozo/pull/1597) [`b3df5b7`](https://github.com/iray-tno/hozo/commit/b3df5b73a8ec104fe407d89472e4339411de311d) Thanks [@iray-tno](https://github.com/iray-tno)! - React Native 0.87 is now the lowest supported version (`react-native: >=0.87`), and `@hozo/media`'s Expo peers move to SDK 58 (`expo-video`, `expo-audio` and `expo-asset` `>=58 <59`). Native gradients go under `backgroundImage` again: the `experimental_backgroundImage` spelling existed only for React Native 0.86, which read nothing else.

### Patch Changes

- Updated dependencies [[`d7dd5b9`](https://github.com/iray-tno/hozo/commit/d7dd5b9d91a77c6cf647ba2de6fb321f8e558613), [`480e00a`](https://github.com/iray-tno/hozo/commit/480e00a0d6e165b92beb8dbf9310710fcceb7fd1), [`fac2f53`](https://github.com/iray-tno/hozo/commit/fac2f53a7636c7373cf22c4d49fcf5a137bb08ec), [`add3e7b`](https://github.com/iray-tno/hozo/commit/add3e7b2c5a152c770eabee7d09d723e925958e1), [`b59995e`](https://github.com/iray-tno/hozo/commit/b59995e108e4cc9b6d093c2487cebece0d02a707), [`c1ca21a`](https://github.com/iray-tno/hozo/commit/c1ca21afee0e3f4dd92110570f3ff3775b01c4cf), [`b3df5b7`](https://github.com/iray-tno/hozo/commit/b3df5b73a8ec104fe407d89472e4339411de311d), [`c9a3b4d`](https://github.com/iray-tno/hozo/commit/c9a3b4d61541024c66165c91a4b7e2a75c9a203c), [`416d627`](https://github.com/iray-tno/hozo/commit/416d627e8afc6a3f321c95dbe1f74b630d173d7b), [`242253d`](https://github.com/iray-tno/hozo/commit/242253da3910698e0838d74cbc9d51e1ca5995d6), [`37a9151`](https://github.com/iray-tno/hozo/commit/37a915152634d8e25dfa9b2958661d4bc8f0a134), [`e7d97e9`](https://github.com/iray-tno/hozo/commit/e7d97e981615355534d0ea20c4a70410556cbda4)]:
  - @hozo/core@0.4.0
  - @hozo/engine@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [[`80f2686`](https://github.com/iray-tno/hozo/commit/80f2686ace0922e27502695d0b88c1dba2e08be0), [`8e110be`](https://github.com/iray-tno/hozo/commit/8e110be92d0ea8d435ecd1f5e7dcfb236b00b368), [`adfe1fd`](https://github.com/iray-tno/hozo/commit/adfe1fd914d60effc27677efdaee6edf19feaf6b), [`496f1b7`](https://github.com/iray-tno/hozo/commit/496f1b75e06bc5f5b079870ce566754e7161c21a), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`42d0e77`](https://github.com/iray-tno/hozo/commit/42d0e7772061d498b1bc2a1ae170cea93607ba10), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`70cc763`](https://github.com/iray-tno/hozo/commit/70cc763166d3f3aa04c466c5a12e7a8a4dba0a0f), [`9a33076`](https://github.com/iray-tno/hozo/commit/9a3307689c1a37847d45bea9083cee1f63c7edba), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`030d179`](https://github.com/iray-tno/hozo/commit/030d1791515ef5523560c38c1788e4b23f6bfd92), [`18a0e93`](https://github.com/iray-tno/hozo/commit/18a0e93cac8a778ca919c23d0ccfe7a65c506ef6)]:
  - @hozo/core@0.3.0
  - @hozo/engine@0.3.0

## 0.2.0

- No package-specific public API change. Release in lockstep with the 0.2.0 engine and primitive owners.
- Raise the `@hozo/core` typed-factory peer floor to 0.2.0 while retaining the existing `<1` upper bound.

See the [Hozo release notes and migration steps](https://github.com/iray-tno/hozo/blob/main/CHANGELOG.md#020) for cross-package changes and measured boundaries.

### Patch Changes

- Updated Hozo dependencies:
  - @hozo/core@0.2.0
  - @hozo/engine@0.2.0
