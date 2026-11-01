# @hozo/typography

## 0.4.0

### Minor Changes

- [#1245](https://github.com/iray-tno/hozo/pull/1245) [`37a9151`](https://github.com/iray-tno/hozo/commit/37a915152634d8e25dfa9b2958661d4bc8f0a134) Thanks [@iray-tno](https://github.com/iray-tno)! - Add portable CodeLines and CodeBlock with application-supplied tokens, semantic line marks, hidden gutters, line numbers, wrapping, accessible scrolling and copy feedback. Supply Native clipboard access through CodeClipboardProvider. Pure model, Shiki connection and fence metadata helpers have independent subpaths; no highlighter or diff runtime is included.
  
  Del now renders a semantic `<del>` on Web instead of `<s>`. Strikethrough retains `<s>`; Ins adds `<ins>` with underline on Native.

### Patch Changes

- [#1396](https://github.com/iray-tno/hozo/pull/1396) [`d674538`](https://github.com/iray-tno/hozo/commit/d674538468608c9aa128494f983bf022722c4337) Thanks [@iray-tno](https://github.com/iray-tno)! - A Native `CodeBlock` or `CodeLines` no longer redraws the lines an update left alone: a line passed again as the same object keeps its row. Changing one line of a 1000-line block re-rendered every mounted line before.

- [#1489](https://github.com/iray-tno/hozo/pull/1489) [`7ad0aaa`](https://github.com/iray-tno/hozo/commit/7ad0aaa1ea5db43cb04d4cb4f471e738265f4f1e) Thanks [@iray-tno](https://github.com/iray-tno)! - A Native code line now nests one `Text` per run of tokens that draw the same, rather than one per token, and none when the whole line draws one way. Whitespace joins its neighbour whatever its colour. On Shiki's output for real source this is about a quarter fewer nested `Text`s. The text, the accessibility label and what is drawn are unchanged.

- [#1384](https://github.com/iray-tno/hozo/pull/1384) [`1b54676`](https://github.com/iray-tno/hozo/commit/1b54676fbc476f848d2e834a9443fde0bf888ce9) Thanks [@iray-tno](https://github.com/iray-tno)! - A windowed `CodeBlock` now windows on the Web too: only the lines near the visible ones are mounted, the rest are held as space, and an unwrapped block keeps its scrolling width with a hidden copy of the widest line. The lines stay one `<pre><code>`.

- [#1411](https://github.com/iray-tno/hozo/pull/1411) [`301e475`](https://github.com/iray-tno/hozo/commit/301e475d88e4628517a9b4fb2b2f0a245af62144) Thanks [@iray-tno](https://github.com/iray-tno)! - A windowed Web `CodeBlock` can be read to its last line by a screen reader: the whole text is kept as hidden plain lines with their mark prefixes, and the drawn rows are hidden from reading.

- [#1399](https://github.com/iray-tno/hozo/pull/1399) [`3fb505a`](https://github.com/iray-tno/hozo/commit/3fb505a3ce6a7793eef0037ec27d72edea0abf27) Thanks [@iray-tno](https://github.com/iray-tno)! - A Web `CodeBlock` or `CodeLines` no longer redraws the lines an update left alone, as on Native: a line passed again as the same object keeps its row.
- Updated dependencies [[`d7dd5b9`](https://github.com/iray-tno/hozo/commit/d7dd5b9d91a77c6cf647ba2de6fb321f8e558613), [`27536fc`](https://github.com/iray-tno/hozo/commit/27536fc602947b8928df7fa4d8940363fc0e3a67), [`99892e2`](https://github.com/iray-tno/hozo/commit/99892e25f536991e2966aa60769bd7155d5d8336), [`4270a72`](https://github.com/iray-tno/hozo/commit/4270a727b14605d7ff5c9831238e60cb518e3ed6), [`1c052da`](https://github.com/iray-tno/hozo/commit/1c052dad66426e8a4acd462c776f161249330c35), [`1b54676`](https://github.com/iray-tno/hozo/commit/1b54676fbc476f848d2e834a9443fde0bf888ce9), [`480e00a`](https://github.com/iray-tno/hozo/commit/480e00a0d6e165b92beb8dbf9310710fcceb7fd1), [`fac2f53`](https://github.com/iray-tno/hozo/commit/fac2f53a7636c7373cf22c4d49fcf5a137bb08ec), [`b0c6f22`](https://github.com/iray-tno/hozo/commit/b0c6f220c74d8a5c5a0c13bcf5fc9f8b97a25419), [`add3e7b`](https://github.com/iray-tno/hozo/commit/add3e7b2c5a152c770eabee7d09d723e925958e1), [`ffd5b6b`](https://github.com/iray-tno/hozo/commit/ffd5b6bbb0021d512d416fc5d8ae7441cc18c463), [`e4734c8`](https://github.com/iray-tno/hozo/commit/e4734c832c6469edc4ba88a7e09209b2b2ccd29b), [`b59995e`](https://github.com/iray-tno/hozo/commit/b59995e108e4cc9b6d093c2487cebece0d02a707), [`d5a1a1e`](https://github.com/iray-tno/hozo/commit/d5a1a1ee6a55dd50c6c2f91289a11a8665dd9d74), [`c1ca21a`](https://github.com/iray-tno/hozo/commit/c1ca21afee0e3f4dd92110570f3ff3775b01c4cf), [`5cbbb5d`](https://github.com/iray-tno/hozo/commit/5cbbb5de2ba68dd8e44c1939535a84f5325bb950), [`cf7773e`](https://github.com/iray-tno/hozo/commit/cf7773edcfd5f9d9cb42e35489ce1b15e35312bb), [`c4696a4`](https://github.com/iray-tno/hozo/commit/c4696a4660ceb546fc9e29bc18d1fe73979681e5), [`c9a3b4d`](https://github.com/iray-tno/hozo/commit/c9a3b4d61541024c66165c91a4b7e2a75c9a203c), [`416d627`](https://github.com/iray-tno/hozo/commit/416d627e8afc6a3f321c95dbe1f74b630d173d7b), [`242253d`](https://github.com/iray-tno/hozo/commit/242253da3910698e0838d74cbc9d51e1ca5995d6), [`37a9151`](https://github.com/iray-tno/hozo/commit/37a915152634d8e25dfa9b2958661d4bc8f0a134), [`e7d97e9`](https://github.com/iray-tno/hozo/commit/e7d97e981615355534d0ea20c4a70410556cbda4)]:
  - @hozo/primitives@0.4.0
  - @hozo/behaviors@0.4.0
  - @hozo/engine@0.4.0

## 0.3.0

### Minor Changes

- [#923](https://github.com/iray-tno/hozo/pull/923) [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `Preformatted` for content whose whitespace is meaningful: a real `<pre>` on Web and monospace Text preserving line breaks on Native. Put `Code` inside it for a code sample; the block and the inline code keep their separate semantics.

### Patch Changes

- Updated dependencies [[`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6)]:
  - @hozo/primitives@0.3.0
  - @hozo/engine@0.3.0

## 0.2.0

- No package-specific public API change. Release in lockstep with the compiler, engine and Text primitive owner at 0.2.0.

See the [Hozo release notes and migration steps](https://github.com/iray-tno/hozo/blob/main/CHANGELOG.md#020) for cross-package changes and measured boundaries.

### Patch Changes

- Updated Hozo dependencies:
  - @hozo/primitives@0.2.0
  - @hozo/engine@0.2.0
