# @hozo/navigation

## 0.5.0

### Minor Changes

- [#1919](https://github.com/iray-tno/hozo/pull/1919) [`9d20975`](https://github.com/iray-tno/hozo/commit/9d20975684383ed659085fc48dad34f70294505e) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `hozo manifest` and `hozo links` to `@hozo/cli`. They run the same commands as `hozo-manifest` and `hozo-links`. Both old binaries keep working for one minor release and print a deprecation line on stderr.
  
  Both now use the `hozo` exit codes: `1` for a stale file under `--check`, and `2` for a command that could not run. A `2` ends its stderr line with a string code such as `[config-not-found]`. `hozo-links` used to exit `1` for configuration errors. `hozo-manifest` used to ignore unknown options and crash on a package it could not read.
  
  `hozo-links` now also runs when npm links it into `node_modules/.bin` as a symlink. Before, the linked binary did nothing and exited `0`.
  
  `@hozo/navigation` is an optional peer of `@hozo/cli`. Without it, `hozo links` exits `2` with `[missing-package]`.

### Patch Changes

- Updated dependencies [[`cb4b456`](https://github.com/iray-tno/hozo/commit/cb4b4564ddb95d7ecb6f729433bf5c956788b53e), [`ba5beaf`](https://github.com/iray-tno/hozo/commit/ba5beaf2fbaff50a5b6bb1595ee156cae9dd5a1c), [`55a4dff`](https://github.com/iray-tno/hozo/commit/55a4dff1b332a0a275c0c40d2b7516a90e9a720d), [`0001fc4`](https://github.com/iray-tno/hozo/commit/0001fc442e38955770974fb5377002e4deb4b95f), [`ed04074`](https://github.com/iray-tno/hozo/commit/ed04074de82890b87590afb537a0bea99b2751a7), [`6cf46e3`](https://github.com/iray-tno/hozo/commit/6cf46e30640459d327305ffce8b38d26e27b3a9b), [`052b447`](https://github.com/iray-tno/hozo/commit/052b447351a669a12c5b8ced61bef5d07dc8a604), [`43680e3`](https://github.com/iray-tno/hozo/commit/43680e3643ba9f3f6e01f5c7aa885feb8e5c7b04), [`35cc5c3`](https://github.com/iray-tno/hozo/commit/35cc5c31ce90497de9a6f345e884af2d20a6bc60), [`5c823ee`](https://github.com/iray-tno/hozo/commit/5c823ee87f1996f7011290af68702ef7f19e5388), [`70643e9`](https://github.com/iray-tno/hozo/commit/70643e959d229a75fcdbd1316f9a972efb4a2622), [`3a3a8d5`](https://github.com/iray-tno/hozo/commit/3a3a8d52d64d0d580d9afaa298977c5c33f295f2), [`b4cc4f6`](https://github.com/iray-tno/hozo/commit/b4cc4f6b4941ed6f9fb63ff1f942dad781b760e5), [`b3cd864`](https://github.com/iray-tno/hozo/commit/b3cd864b49f275244b24f31227ec1f592b6f2e89), [`45eda5b`](https://github.com/iray-tno/hozo/commit/45eda5b451bdf1449c7c16172c03b2a9e743aaa6), [`cca1211`](https://github.com/iray-tno/hozo/commit/cca1211b176ec411112275399fc582a92a50efbe), [`4f62450`](https://github.com/iray-tno/hozo/commit/4f624503a4fb9f4af6f699f7d2deb55b69a72c36), [`ddd7c73`](https://github.com/iray-tno/hozo/commit/ddd7c73d09768ad8fbcf55c40859729b7271ea1a), [`2d28017`](https://github.com/iray-tno/hozo/commit/2d2801735d14c61193610e74bc6178f15b79d07e), [`cabc969`](https://github.com/iray-tno/hozo/commit/cabc9695ae805afa2c690aebcad5657f76f95eac), [`3f1754a`](https://github.com/iray-tno/hozo/commit/3f1754a523e62dc44ccc3da7294e9510e5203302), [`b3cf38b`](https://github.com/iray-tno/hozo/commit/b3cf38b30f2fe748c4f73110d01de2566826355a)]:
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
