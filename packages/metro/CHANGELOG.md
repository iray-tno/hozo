# @hozo/metro

## 0.3.1

### Patch Changes

- [#1013](https://github.com/iray-tno/hozo/pull/1013) [`ceab3b8`](https://github.com/iray-tno/hozo/commit/ceab3b83ff698f67254deea7e46c7cbeb0da717a) Thanks [@iray-tno](https://github.com/iray-tno)! - Imports from `@hozo/engine` are now rewritten to the modules that define each name, like the other Hozo barrels. `@hozo/primitives` and `@hozo/typography` import from it, so every Native app was loading the engine's whole entry, the Web-only DOM helpers included: 40.8 KB of the demo's dev bundle.
- Updated dependencies [[`6b0c271`](https://github.com/iray-tno/hozo/commit/6b0c271b754c3ba96bf7efe8f241f8784a3e4081), [`f56c33a`](https://github.com/iray-tno/hozo/commit/f56c33a14738c3f71b2dd0690fad5fb6ef817133), [`771b369`](https://github.com/iray-tno/hozo/commit/771b369bd74c6ca67717c67d36bfee3de8ea1654), [`e88bc55`](https://github.com/iray-tno/hozo/commit/e88bc55c736558b296ac69bef8eb57a50a69c635), [`cf7773e`](https://github.com/iray-tno/hozo/commit/cf7773edcfd5f9d9cb42e35489ce1b15e35312bb), [`e7b4592`](https://github.com/iray-tno/hozo/commit/e7b4592a8f9ea6e6a556e860a9202876c62d73c8)]:
  - @hozo/compiler@0.3.1
  - @hozo/primitives@0.3.1
  - @hozo/patterns@0.3.1
  - @hozo/engine@0.3.1
  - @hozo/svg@0.3.1
  - @hozo/tailwind@0.3.1

## 0.3.0

### Minor Changes

- [#826](https://github.com/iray-tno/hozo/pull/826) [`dcca222`](https://github.com/iray-tno/hozo/commit/dcca222b995a21d3ee4f429f5327caa26688f02a) Thanks [@iray-tno](https://github.com/iray-tno)! - `@hozo/metro` now rewrites named imports from Hozo's barrels (`@hozo/core`, `@hozo/patterns` and the rest) to the modules that define each name. Metro does not tree-shake, so a single `import { Dialog } from '@hozo/core'` used to put every pattern in the bundle. In the native demo, Hozo's share of the dev bundle fell from 591 KB to 436 KB. Names it cannot follow, and namespace imports, stay on the barrel.

### Patch Changes

- Updated dependencies [[`80f2686`](https://github.com/iray-tno/hozo/commit/80f2686ace0922e27502695d0b88c1dba2e08be0), [`cc85dce`](https://github.com/iray-tno/hozo/commit/cc85dce47dcd3df869e8659dceffee7f6b01123b), [`8e110be`](https://github.com/iray-tno/hozo/commit/8e110be92d0ea8d435ecd1f5e7dcfb236b00b368), [`adfe1fd`](https://github.com/iray-tno/hozo/commit/adfe1fd914d60effc27677efdaee6edf19feaf6b), [`496f1b7`](https://github.com/iray-tno/hozo/commit/496f1b75e06bc5f5b079870ce566754e7161c21a), [`ace032d`](https://github.com/iray-tno/hozo/commit/ace032d26b7e9e50aecf058cd222f7b362a3f225), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`6e2cff6`](https://github.com/iray-tno/hozo/commit/6e2cff6013e69b3ae276473c39a7fbe7f1e7e1b4), [`42d0e77`](https://github.com/iray-tno/hozo/commit/42d0e7772061d498b1bc2a1ae170cea93607ba10), [`8a7c8c7`](https://github.com/iray-tno/hozo/commit/8a7c8c73dc20d025a10ae5fe472bb81dc8659ce7), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`70cc763`](https://github.com/iray-tno/hozo/commit/70cc763166d3f3aa04c466c5a12e7a8a4dba0a0f), [`9a33076`](https://github.com/iray-tno/hozo/commit/9a3307689c1a37847d45bea9083cee1f63c7edba), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`f730194`](https://github.com/iray-tno/hozo/commit/f7301946a75b7fc1e67bc4c135df43497b2b7f72), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`030d179`](https://github.com/iray-tno/hozo/commit/030d1791515ef5523560c38c1788e4b23f6bfd92), [`a2e519b`](https://github.com/iray-tno/hozo/commit/a2e519b4a11b17154ea7dc62ac6d371f8d4f170a), [`18a0e93`](https://github.com/iray-tno/hozo/commit/18a0e93cac8a778ca919c23d0ccfe7a65c506ef6)]:
  - @hozo/patterns@0.3.0
  - @hozo/compiler@0.3.0
  - @hozo/primitives@0.3.0
  - @hozo/engine@0.3.0
  - @hozo/svg@0.3.0
  - @hozo/tailwind@0.3.0

## 0.2.0

- Route generated SVG filter imports to their SVG owner.
- Refuse generated runtime-import binding collisions consistently with the Web path.
- Bundle against the matching 0.2.0 Native engine/component entries; source-package discovery is shared through the compiler.

See the [Hozo release notes and migration steps](https://github.com/iray-tno/hozo/blob/main/CHANGELOG.md#020) for cross-package changes and measured boundaries.

### Patch Changes

- Updated Hozo dependencies:
  - @hozo/compiler@0.2.0
  - @hozo/primitives@0.2.0
  - @hozo/patterns@0.2.0
  - @hozo/engine@0.2.0
  - @hozo/svg@0.2.0
  - @hozo/tailwind@0.2.0
