# @hozo/vite

## 0.4.0

### Patch Changes

- Updated dependencies [[`08dd756`](https://github.com/iray-tno/hozo/commit/08dd756fb0ec9cead28d3f7243412bdd6194525b), [`d7dd5b9`](https://github.com/iray-tno/hozo/commit/d7dd5b9d91a77c6cf647ba2de6fb321f8e558613), [`27536fc`](https://github.com/iray-tno/hozo/commit/27536fc602947b8928df7fa4d8940363fc0e3a67), [`99892e2`](https://github.com/iray-tno/hozo/commit/99892e25f536991e2966aa60769bd7155d5d8336), [`3e5d88d`](https://github.com/iray-tno/hozo/commit/3e5d88d106e8292c4a01762f445fd97402fce83b), [`480e00a`](https://github.com/iray-tno/hozo/commit/480e00a0d6e165b92beb8dbf9310710fcceb7fd1), [`ffd5b6b`](https://github.com/iray-tno/hozo/commit/ffd5b6bbb0021d512d416fc5d8ae7441cc18c463), [`cad9081`](https://github.com/iray-tno/hozo/commit/cad908183b81180e2fd8bb7ef31a1bb2f12f8e95), [`6b0c271`](https://github.com/iray-tno/hozo/commit/6b0c271b754c3ba96bf7efe8f241f8784a3e4081), [`f56c33a`](https://github.com/iray-tno/hozo/commit/f56c33a14738c3f71b2dd0690fad5fb6ef817133), [`dec0ba9`](https://github.com/iray-tno/hozo/commit/dec0ba98522749a6c5013f4148c58395a8e5a7f4), [`771b369`](https://github.com/iray-tno/hozo/commit/771b369bd74c6ca67717c67d36bfee3de8ea1654), [`f3da373`](https://github.com/iray-tno/hozo/commit/f3da3738010f3a0f09e1449d8985905993201980), [`4186a98`](https://github.com/iray-tno/hozo/commit/4186a98cfaaec9e23537bf2cc55f391e6b897368), [`60a76ad`](https://github.com/iray-tno/hozo/commit/60a76ad8affe8df7488cff17a85c4836e6c56736), [`9d242c4`](https://github.com/iray-tno/hozo/commit/9d242c474776e81a505b45ef14b80840df51f20f), [`c1ca21a`](https://github.com/iray-tno/hozo/commit/c1ca21afee0e3f4dd92110570f3ff3775b01c4cf), [`b0e68ac`](https://github.com/iray-tno/hozo/commit/b0e68ac2b9afbe7ef3fbece6838392f7bfb82125), [`e88bc55`](https://github.com/iray-tno/hozo/commit/e88bc55c736558b296ac69bef8eb57a50a69c635), [`cf7773e`](https://github.com/iray-tno/hozo/commit/cf7773edcfd5f9d9cb42e35489ce1b15e35312bb), [`0413a61`](https://github.com/iray-tno/hozo/commit/0413a61d029b3dd5dcdb48ef7f4d268fcb0a3089), [`e7b4592`](https://github.com/iray-tno/hozo/commit/e7b4592a8f9ea6e6a556e860a9202876c62d73c8), [`416d627`](https://github.com/iray-tno/hozo/commit/416d627e8afc6a3f321c95dbe1f74b630d173d7b), [`242253d`](https://github.com/iray-tno/hozo/commit/242253da3910698e0838d74cbc9d51e1ca5995d6), [`37a9151`](https://github.com/iray-tno/hozo/commit/37a915152634d8e25dfa9b2958661d4bc8f0a134), [`98c1e65`](https://github.com/iray-tno/hozo/commit/98c1e65e578b885bd8184dd2eee1617b6d01cfbc), [`bc65476`](https://github.com/iray-tno/hozo/commit/bc654769284e1429e00028d8b6176cbdafab59c8), [`e7d97e9`](https://github.com/iray-tno/hozo/commit/e7d97e981615355534d0ea20c4a70410556cbda4)]:
  - @hozo/compiler@0.4.0
  - @hozo/primitives@0.4.0
  - @hozo/patterns@0.4.0
  - @hozo/engine@0.4.0
  - @hozo/tailwind@0.4.0
  - @hozo/rn-compat@0.4.0

## 0.3.0

### Patch Changes

- [#923](https://github.com/iray-tno/hozo/pull/923) [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6) Thanks [@iray-tno](https://github.com/iray-tno)! - Compile project-defined Tailwind animations and their keyframes for both backends, including keyframes needed by dynamic class candidates. StyleX conditions inside property values now reach the shared condition model.
  
  Extend Native negated conditions across supported environment, breakpoint, pixel-width, container, prop, sibling and interaction predicates. Link states use the existing interaction owner, descendant focus-visible follows that owner, and independent transform resets and runtime-state transform families compose without losing their other transform entries. Unsupported predicates are still diagnosed, not assumed false.
  
  Respect project radius tokens and built-in radius overrides, discover runtime candidates in quoted class arrays, and preserve separate Native style keys for ternary branches. Caller classes override a component's resting look while explicit state classes retain their precedence. On Web, fallback candidate rules stay below authored Tailwind utilities, and conditional class selection reaches elements that remain components.
  
  Native line-breaking utilities that cannot be represented now warn instead of failing the build. This does not implement Android/CJK line-break controls that React Native does not expose.
- Updated dependencies [[`80f2686`](https://github.com/iray-tno/hozo/commit/80f2686ace0922e27502695d0b88c1dba2e08be0), [`cc85dce`](https://github.com/iray-tno/hozo/commit/cc85dce47dcd3df869e8659dceffee7f6b01123b), [`8e110be`](https://github.com/iray-tno/hozo/commit/8e110be92d0ea8d435ecd1f5e7dcfb236b00b368), [`adfe1fd`](https://github.com/iray-tno/hozo/commit/adfe1fd914d60effc27677efdaee6edf19feaf6b), [`496f1b7`](https://github.com/iray-tno/hozo/commit/496f1b75e06bc5f5b079870ce566754e7161c21a), [`ace032d`](https://github.com/iray-tno/hozo/commit/ace032d26b7e9e50aecf058cd222f7b362a3f225), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`6e2cff6`](https://github.com/iray-tno/hozo/commit/6e2cff6013e69b3ae276473c39a7fbe7f1e7e1b4), [`42d0e77`](https://github.com/iray-tno/hozo/commit/42d0e7772061d498b1bc2a1ae170cea93607ba10), [`8a7c8c7`](https://github.com/iray-tno/hozo/commit/8a7c8c73dc20d025a10ae5fe472bb81dc8659ce7), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`70cc763`](https://github.com/iray-tno/hozo/commit/70cc763166d3f3aa04c466c5a12e7a8a4dba0a0f), [`9a33076`](https://github.com/iray-tno/hozo/commit/9a3307689c1a37847d45bea9083cee1f63c7edba), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`f730194`](https://github.com/iray-tno/hozo/commit/f7301946a75b7fc1e67bc4c135df43497b2b7f72), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`030d179`](https://github.com/iray-tno/hozo/commit/030d1791515ef5523560c38c1788e4b23f6bfd92), [`18a0e93`](https://github.com/iray-tno/hozo/commit/18a0e93cac8a778ca919c23d0ccfe7a65c506ef6)]:
  - @hozo/patterns@0.3.0
  - @hozo/compiler@0.3.0
  - @hozo/primitives@0.3.0
  - @hozo/engine@0.3.0
  - @hozo/tailwind@0.3.0
  - @hozo/rn-compat@0.3.0

## 0.2.0

- Admit discovered dependency source to the transform path so source-distributed UI is compiled on initial builds and updates.
- Correct the Vite peer range to `^8.0.0`; the previously advertised >=5 support is no longer claimed.

See the [Hozo release notes and migration steps](https://github.com/iray-tno/hozo/blob/main/CHANGELOG.md#020) for cross-package changes and measured boundaries.

### Patch Changes

- Updated Hozo dependencies:
  - @hozo/compiler@0.2.0
  - @hozo/primitives@0.2.0
  - @hozo/patterns@0.2.0
  - @hozo/engine@0.2.0
  - @hozo/rn-compat@0.2.0
  - @hozo/tailwind@0.2.0
