# RFC 009: Code blocks

Status: implemented (initial slice, reviewed Web speech and measured Android limits). Tracking: [#1189](https://github.com/iray-tno/hozo/issues/1189).

Typography owns the line/token model, CodeLines, semantic Ins/Del and pure
Shiki/fence metadata connections. Patterns owns CodeBlock's named figure,
gutter, scrolling and copy action. UI supplies frame, gutter and line-mark
theme tokens. Applications own highlighting, diffing and Native clipboard
access. No runtime highlighter, diff engine or clipboard module is bundled.

## Contract

Strings split on newlines. Token arrays retain styles while tab stops cross
token boundaries; CRLF is normalized for display. Copy preserves the supplied
text, including tabs and removed lines, without visual gutters or spoken
prefixes. An explicit copy text overrides that default.

Web lines use pre/code and ins/del/mark. Each marked line has one translated
hidden prefix; numbers and plus/minus/dot markers are separate, non-selectable
and hidden from accessibility. A caption names the figure. Copy is outside
the scroll container, so it cannot suppress the overflowing code's own Tab
stop. `hozoScrollable` installs that stop only when needed.

Native uses the canonical engine text-style partition and scheme store. Each
line is one accessible Text with nested token Text; the separate gutter hides
its descendants. CodeClipboardProvider connects an application-owned clipboard.
Without one, Copy is absent. Completed copies announce through Hozo's existing
announcement connection; changed content, changed connections and unmounting
retire pending feedback.

CodeLines and wrapped, copy-free CodeBlock can render at build time in Astro.
Default scrolling and Copy require hydration for observation and events. The
static MDX probe renders both static forms without an island; this does not
claim an unhydrated horizontal scroller installs a keyboard stop.

Token colours are application data, emitted as inline styles, with light/dark
maps following the system scheme or an explicit theme key. Applications must
choose accessible highlighter colours. Hozo owns the mark/gutter/frame theme.

`Del` changes its Web output from s to del. Strikethrough retains s. Ins and
Del remain fallback components; direct compiler Primitive support is a follow-up.
CodeBlock's class slots are component-managed and do not add an IR primitive.
The class-slot inventory does not claim new Native CSS or interaction support.

## Verification matrix

| Surface | Automated coverage | Still needed |
| --- | --- | --- |
| Web markup | Caption/name; semantic marks and one prefix; escaped tokens; hidden gutters; raw/override copy; maintainer-approved NVDA/VoiceOver event wording | Audible speech quality is outside the captured evidence |
| Chromium | Actual keyboard scrolling with/without Copy, conditional Tab stop, wrapping, both token themes and retired async copy feedback | Physical keyboard and screen-reader review |
| Native mock hosts | Grouped line labels, hidden gutter, text/box style partition, scheme selection, provider copy and button focus facts | Native layout and responder delivery |
| Shared docs story | Same demo on Web and Native; Web automated accessibility catalogue | VoiceOver/TalkBack reading granularity and device captures |

Shiki is pinned as a development-only test input. The adapter tests exercise
real single/multi-theme output, including both token.color and htmlStyle.color
default-theme shapes. Font-style bits 1/2/4 map to portable styles; bit 8 is
intentionally omitted. Fence ranges use intervals rather than allocating an
array proportional to the largest line number; unknown syntax is preserved.

The landing CodeShowcase uses wrapped, copy-free CodeBlock figures. Astro runs
Shiki with the landing palette at build time, and the Web/Native panes show
compiler output from the same source. Token contrast is checked on both code
backgrounds; the homepage retains its single Kumimono island.

Philosophy and the Canvas/SVG/Three authoring examples use the same build-time
palette and wrapped figures. Built text is compared with each source, and
browser checks run at mobile/tablet/desktop widths with JavaScript disabled.
Three's interactive proof has a separate module so its island cannot pull the
static examples or CodeBlock implementation into the browser bundle.

CompilerListing and the SVG filter studio also use CodeBlock, taking plain
strings without a browser highlighter. Compiler output wraps within its bounded
vertical region; SVG source scrolls horizontally. Overflow observers supply a
keyboard stop only when needed. Tailwind hydrates its three code panels as one
small island; StyleX and SVG reuse their existing interactive boundaries.

The landing has an opt-in MDX connection through Sätteri's mdast plugin API.
Fences marked `hozo` use the imported MdxCodeBlock renderer with build-time
tokens, literal metadata, line numbers and semantic marks. They always wrap
without Copy. Unsupported languages fall back to text; ordinary fences retain
the existing renderer. The no-script MDX probe covers nested fences and escaped
markup. This is an application connection, not a published Markdown plugin.

No virtualized renderer or physical-device frame budget is claimed. The
[bounded Android emulator measurement](../measurements/code-block-android.md)
completed all 84 windows through 1000 lines. No tested long-block count
established a smooth 60Hz envelope: the 1000-line mount/update medians were
1189.840/939.431ms and long-block scroll frame p95 was about 119ms on the
identified software-GPU emulator. Applications should keep Native snippets
small and avoid frame-rate whole-block updates. Rendering optimization is
tracked separately in [#1289](https://github.com/iray-tno/hozo/issues/1289).
The measurement includes missed budgets rather than claiming a pass. Envarly
adoption is deferred until release and is outside the current Hozo work. Real
device/reader checks and broader Markdown adoption remain follow-ups.

## Completion evidence

- [#1276](https://github.com/iray-tno/hozo/issues/1276): actual NVDA/Chrome and
  VoiceOver/Safari speech for the named figure, marked lines, hidden gutters
  and Copy completion. `examples/screen-readers/code-and-splitter.spec.ts`
  records reading and real keyboard activation. The maintainer approved the
  recorded wording on 2026-10-26; the committed expectations passed on both
  readers in [run 40274993354](https://github.com/iray-tno/hozo/actions/runs/40274993354),
  40/40 cases each. Audible pronunciation/prosody remains outside that approval.
- [#1278](https://github.com/iray-tno/hozo/issues/1278): the Android long-block
  frame-budget measurement promised by the original proposal, now recorded
  with the tested line/token counts and separate initial-render, scroll and
  update results, including the failed smooth-frame envelope.

On 2026-10-26 the maintainer deferred physical-device validation in line with
the rest of the repository. Android/iOS reading granularity, hidden gutters,
provider-backed Copy and layout remain unverified in
[#1277](https://github.com/iray-tno/hozo/issues/1277) and the public
[known limitations](../../apps/landing/src/content/docs/docs/status.md).
They no longer block this RFC's initial implementation. #1278 may use an
explicitly identified emulator; its results must not claim physical-device
performance.

The implementation and agreed completion evidence are complete, including the
honest report of cases that miss the frame budget. Direct Ins/Del IR, broader Markdown replacement
and virtualization remain separate design work.

## Native bundle cost

The census app's development bundle contains 482,994 bytes of Hozo modules,
against 482,398 on the Window Splitter parent. An initial 489,861-byte result
exposed CodeLines (4,253 bytes) and its model (2,427) being loaded by the
typography implementation entry even in text-only apps. Moving semantic text
definitions to a leaf lets Metro's existing modular imports avoid that cost.
The original 485,000-byte ceiling is unchanged, and the bundle check now rejects
the typography facade alongside the other facades.

The production benchmark's Hozo-minus-Native increment remains 1,873 raw bytes,
497 gzip bytes. These are local Metro bundle measurements, not device startup
or frame-time measurements.
