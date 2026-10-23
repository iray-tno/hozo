# RFC 007: Code blocks

Status: initial portable implementation. Tracking: [#1189](https://github.com/iray-tno/hozo/issues/1189).

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
| Web markup | Caption/name; semantic marks and one prefix; escaped tokens; hidden gutters; raw/override copy | NVDA and VoiceOver speech |
| Chromium | Actual keyboard scrolling with/without Copy, conditional Tab stop, wrapping, both token themes and retired async copy feedback | Physical keyboard and screen-reader review |
| Native mock hosts | Grouped line labels, hidden gutter, text/box style partition, scheme selection, provider copy and button focus facts | Native layout and responder delivery |
| Shared docs story | Same demo on Web and Native; Web automated accessibility catalogue | VoiceOver/TalkBack reading granularity and device captures |

Shiki is pinned as a development-only test input. The adapter tests exercise
real single/multi-theme output, including both token.color and htmlStyle.color
default-theme shapes. Font-style bits 1/2/4 map to portable styles; bit 8 is
intentionally omitted. Fence ranges use intervals rather than allocating an
array proportional to the largest line number; unknown syntax is preserved.

No virtualized renderer or long-block device frame budget is claimed. Broader
landing snippet migration, Markdown integration and Envarly adoption remain
follow-ups; this initial slice does not close the whole tracking issue.

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
