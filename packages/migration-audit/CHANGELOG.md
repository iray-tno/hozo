# @hozo/migration-audit

## 0.4.0

### Patch Changes

- [#1055](https://github.com/iray-tno/hozo/pull/1055) [`08dd756`](https://github.com/iray-tno/hozo/commit/08dd756fb0ec9cead28d3f7243412bdd6194525b) Thanks [@iray-tno](https://github.com/iray-tno)! - `hozo-migration-audit --fix` prints, as a diff, the `react-native` imports the Web build moves to `@hozo/rn-compat`, written into source; `--write` applies them. `@hozo/compiler/analysis` exports the pass it uses, `reactNativeImportFix`.

- [#1060](https://github.com/iray-tno/hozo/pull/1060) [`7785037`](https://github.com/iray-tno/hozo/commit/7785037b83cf3e0b7031efd6081b2a1f697f3698) Thanks [@iray-tno](https://github.com/iray-tno)! - Next steps now ends with an optional step pointing at `--fix` when the Web build moved React Native imports to `@hozo/rn-compat`, so the codemod is found from the report rather than only from the README.

- [#1052](https://github.com/iray-tno/hozo/pull/1052) [`4673a5a`](https://github.com/iray-tno/hozo/commit/4673a5aa0ab1178a7804e3803a14e5086d01e10e) Thanks [@iray-tno](https://github.com/iray-tno)! - The Markdown report opens with a Next steps section: what to fix first, in the order one step unblocks the next, read off the findings the report already holds.

- [#1071](https://github.com/iray-tno/hozo/pull/1071) [`e764108`](https://github.com/iray-tno/hozo/commit/e76410840b00860e31b0dad1c41bb06b82ecb421) Thanks [@iray-tno](https://github.com/iray-tno)! - `--fix --write` now also refuses a file Git does not track, including an ignored one selected by `--include`. Before this it checked only `git status`, which does not list ignored files, so such a file could be overwritten with no copy left anywhere. The README states what the audit may write as a contract and no longer calls the tool read-only.

- [#1227](https://github.com/iray-tno/hozo/pull/1227) [`abd83e2`](https://github.com/iray-tno/hozo/commit/abd83e221bb474864c81365c6ae398ca1e810823) Thanks [@iray-tno](https://github.com/iray-tno)! - The audit lists each class React Native cannot draw in a class prop the compiler does not lower, such as one handed to a pattern. Each one is a `CLASS_NOT_DRAWN_ON_NATIVE` finding, with its reason, its file and line, and the attribute it is in.
- Updated dependencies [[`08dd756`](https://github.com/iray-tno/hozo/commit/08dd756fb0ec9cead28d3f7243412bdd6194525b), [`d7dd5b9`](https://github.com/iray-tno/hozo/commit/d7dd5b9d91a77c6cf647ba2de6fb321f8e558613), [`3e5d88d`](https://github.com/iray-tno/hozo/commit/3e5d88d106e8292c4a01762f445fd97402fce83b), [`cad9081`](https://github.com/iray-tno/hozo/commit/cad908183b81180e2fd8bb7ef31a1bb2f12f8e95), [`6b0c271`](https://github.com/iray-tno/hozo/commit/6b0c271b754c3ba96bf7efe8f241f8784a3e4081), [`f56c33a`](https://github.com/iray-tno/hozo/commit/f56c33a14738c3f71b2dd0690fad5fb6ef817133), [`dec0ba9`](https://github.com/iray-tno/hozo/commit/dec0ba98522749a6c5013f4148c58395a8e5a7f4), [`771b369`](https://github.com/iray-tno/hozo/commit/771b369bd74c6ca67717c67d36bfee3de8ea1654), [`f3da373`](https://github.com/iray-tno/hozo/commit/f3da3738010f3a0f09e1449d8985905993201980), [`4186a98`](https://github.com/iray-tno/hozo/commit/4186a98cfaaec9e23537bf2cc55f391e6b897368), [`e4965d5`](https://github.com/iray-tno/hozo/commit/e4965d5cfb6e21d1dd41b3bdda3cdb0d09c27cd3), [`60a76ad`](https://github.com/iray-tno/hozo/commit/60a76ad8affe8df7488cff17a85c4836e6c56736), [`549e29e`](https://github.com/iray-tno/hozo/commit/549e29e29ec3bcec55262c092bf3dd4a9adcbc1f), [`4b50482`](https://github.com/iray-tno/hozo/commit/4b50482e7ce1085970cda578e17fe4deeffa7234), [`905c572`](https://github.com/iray-tno/hozo/commit/905c57243c8d23548a5a2ae518e908643ccafe56), [`9d242c4`](https://github.com/iray-tno/hozo/commit/9d242c474776e81a505b45ef14b80840df51f20f), [`c1ca21a`](https://github.com/iray-tno/hozo/commit/c1ca21afee0e3f4dd92110570f3ff3775b01c4cf), [`adcbaf3`](https://github.com/iray-tno/hozo/commit/adcbaf331ad5fa911dafcaf57f2ea5708b3ab482), [`93a606c`](https://github.com/iray-tno/hozo/commit/93a606c73bb13cf4d8fb909e173744c3df71d056), [`b0e68ac`](https://github.com/iray-tno/hozo/commit/b0e68ac2b9afbe7ef3fbece6838392f7bfb82125), [`e88bc55`](https://github.com/iray-tno/hozo/commit/e88bc55c736558b296ac69bef8eb57a50a69c635), [`cf7773e`](https://github.com/iray-tno/hozo/commit/cf7773edcfd5f9d9cb42e35489ce1b15e35312bb), [`0413a61`](https://github.com/iray-tno/hozo/commit/0413a61d029b3dd5dcdb48ef7f4d268fcb0a3089), [`c9a3b4d`](https://github.com/iray-tno/hozo/commit/c9a3b4d61541024c66165c91a4b7e2a75c9a203c), [`e7b4592`](https://github.com/iray-tno/hozo/commit/e7b4592a8f9ea6e6a556e860a9202876c62d73c8), [`dd08c90`](https://github.com/iray-tno/hozo/commit/dd08c90fc9b3fd8208102775e42ddab710ac4f15), [`5d2da52`](https://github.com/iray-tno/hozo/commit/5d2da52d31e3b7eaa265b1685548413a4d401990), [`242253d`](https://github.com/iray-tno/hozo/commit/242253da3910698e0838d74cbc9d51e1ca5995d6), [`e7d97e9`](https://github.com/iray-tno/hozo/commit/e7d97e981615355534d0ea20c4a70410556cbda4)]:
  - @hozo/compiler@0.4.0
  - @hozo/tailwind@0.4.0

## 0.3.0

### Minor Changes

- [#923](https://github.com/iray-tno/hozo/pull/923) [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6) Thanks [@iray-tno](https://github.com/iray-tno)! - Add the compiler-owned `@hozo/compiler/analysis` entry and project-aware migration analysis. The audit records canonical lowering diagnostics, authored locations or explicit unmapped locations, source/binding provenance, React Native import/tag/reference/value rewrite journals, project facts and stage timings rather than reconstructing compiler decisions from output alone.
  
  The CLI discovers nonempty `src/` and `app/` layouts, falls back to the checkout root, accepts repeated source/include/exclude selections and inventories JS/TS separately from imported context modules. Interactive stdout is Markdown; piped stdout remains JSON, with explicit format/output overrides. Bluesky-specific ALF checks remain in the corpus measurement path, not the generic report.
  
  Static theme, preflight assumptions, platform-scoped StyleX imports, installed/local tsconfig presets and supplied font-registration facts can inform analysis. Executable CSS configuration and remote stylesheets are reported as not assessed, never executed; missing and invalid context is not treated as successful absence. Baseline comparison distinguishes compatible comparisons from unassessed context and can fail CI on current errors or new error findings.
  
  **Report consumers must migrate to JSON schema 3.** Older baselines cannot supply a schema-3 semantic comparison. A clean compiler audit still does not prove production dependency removal, runtime behavior, Native Metro preparation or device font availability. See the migration-audit README for the supported facts and comparison boundaries.

### Patch Changes

- Updated dependencies [[`80f2686`](https://github.com/iray-tno/hozo/commit/80f2686ace0922e27502695d0b88c1dba2e08be0), [`cc85dce`](https://github.com/iray-tno/hozo/commit/cc85dce47dcd3df869e8659dceffee7f6b01123b), [`8e110be`](https://github.com/iray-tno/hozo/commit/8e110be92d0ea8d435ecd1f5e7dcfb236b00b368), [`adfe1fd`](https://github.com/iray-tno/hozo/commit/adfe1fd914d60effc27677efdaee6edf19feaf6b), [`496f1b7`](https://github.com/iray-tno/hozo/commit/496f1b75e06bc5f5b079870ce566754e7161c21a), [`6e2cff6`](https://github.com/iray-tno/hozo/commit/6e2cff6013e69b3ae276473c39a7fbe7f1e7e1b4), [`42d0e77`](https://github.com/iray-tno/hozo/commit/42d0e7772061d498b1bc2a1ae170cea93607ba10), [`8a7c8c7`](https://github.com/iray-tno/hozo/commit/8a7c8c73dc20d025a10ae5fe472bb81dc8659ce7), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`70cc763`](https://github.com/iray-tno/hozo/commit/70cc763166d3f3aa04c466c5a12e7a8a4dba0a0f), [`9a33076`](https://github.com/iray-tno/hozo/commit/9a3307689c1a37847d45bea9083cee1f63c7edba), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`f730194`](https://github.com/iray-tno/hozo/commit/f7301946a75b7fc1e67bc4c135df43497b2b7f72), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`030d179`](https://github.com/iray-tno/hozo/commit/030d1791515ef5523560c38c1788e4b23f6bfd92), [`18a0e93`](https://github.com/iray-tno/hozo/commit/18a0e93cac8a778ca919c23d0ccfe7a65c506ef6)]:
  - @hozo/compiler@0.3.0
  - @hozo/tailwind@0.3.0

## 0.2.0

- Distinguish component recognition from successfully lowered files, and report styling-surface observations without claiming a migration conclusion.
- Release with the stricter 0.2.0 compiler. Audit output is evidence for migration planning, not proof that an entire application is RNW-free.

See the [Hozo release notes and migration steps](https://github.com/iray-tno/hozo/blob/main/CHANGELOG.md#020) for cross-package changes and measured boundaries.

### Patch Changes

- Updated Hozo dependencies:
  - @hozo/compiler@0.2.0
