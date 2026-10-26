# CodeBlock and Splitter: captured Web speech

## Provenance and approval

Source: `1713f4016e2f88557f65070c665469089b276782`,
[screen-readers run 40262274045](https://github.com/iray-tno/hozo/actions/runs/40262274045),
merged through [#1281](https://github.com/iray-tno/hozo/pull/1281).
NVDA/Chrome and VoiceOver/Safari each passed all 40 captures. This document
inspects the captured JSON; **human recording/phrase approval is still pending**
in [#1276](https://github.com/iray-tno/hozo/issues/1276). No expected-speech
file is approved by this report.

Download `screen-readers-nvda` and `screen-readers-voiceover` from that run.
Each contains `phrases/<reader>/` and `recordings/<reader>/`. Recordings use
`.mp4` for NVDA and `.mov` for VoiceOver. Artifacts expire after 14 days;
retain reviewed evidence or rerun the captures if they expire. Review these
five matching recording/JSON names for each reader:

- `patterns-resizablepane--default`: separator name and initial value.
- `splitter-resize-collapse-restore`: five measured keyboard actions.
- `patterns-codeblock--default`: figure and line reading.
- `code-block-lines-and-copy`: reader Enter and three Copy completions.
- `code-block-browser-copy`: browser Enter and three Copy completions.

## Splitter observations

NVDA's catalogue capture includes `Resize Files, separator, 144 pixels`.
VoiceOver says `vertical splitter 144 pixels Resize Files`.

| Measured key | Value | Captured speech, both readers | Corresponding DOM observation |
| --- | --- | --- | --- |
| ArrowRight | 152 | `152 pixels` | Expanded; handle focused |
| Home | 96 | `96 pixels` | Minimum; handle focused |
| End | 240 | `240 pixels` | Maximum; handle focused |
| Enter | 0 | `0 pixels` | Pane inert, accessible region absent; handle focused |
| Enter | 240 | `240 pixels` | Pane restored and accessible; handle focused |

Two entry/warm-up keys are recorded separately and excluded from this table.
The collapse observation proves the DOM excludes the pane; it does not itself
record a screen-reader traversal of the collapsed subtree. Speech says the
size rather than an explicit “collapsed” or “expanded”; review that usability
choice before approval.

## CodeBlock observations

Both readers announce the `paths.ts` figure and its code region. The captured
line speech is:

| Line | NVDA | VoiceOver |
| --- | --- | --- |
| Removed | `deleted, Removed: old slash bin ,` | `Removed: "old/bin",` |
| Added | `inserted, Added: tools slash bin ,` | `Added: "tools/bin",` |
| Highlighted | `highlighted, Highlighted: shared slash bin ,` | `Highlighted: "shared/bin",` |

NVDA announces the semantic role as well as the translated prefix. This can
sound repetitive; it is preserved here for human review. Punctuation differs
between readers, so this report does not infer missing source characters from
NVDA's punctuation settings. Neither captured walk speaks gutter numbers or
the separate plus/minus/dot markers. The test independently observes five
hidden gutter elements and one each of `ins`, `del` and `mark`.

For **each** activation path, NVDA says `Copied` on copies 1, 2 and 3.
VoiceOver's first says `Copied` followed by its figure/web-content navigation
hint; copies 2 and 3 say `Copied`. All six completion captures per reader have
the corresponding `Copied` button state and the real clipboard connection.
The two pre-mounted empty Web status regions are not spoken as extra items
in NVDA's walk; their two `status` entries in the virtual-reader snapshot are
a DOM-semantics baseline, not actual NVDA speech.

## Review checklist

A person should compare each recording with its action JSON, assess the
intelligibility of names and line prefixes, decide whether the duplicate NVDA
mark wording and size-only collapse feedback are acceptable, and approve only
the phrases actually heard. Follow
[the reader approval procedure](../../examples/screen-readers/README.md#approving-speech)
to commit the minimal necessary phrases and link the reviewed run/revision.

Native input and AT remain unverified, as documented in
[known limitations](../../apps/landing/src/content/docs/docs/status.md).
The maintainer deferred that physical-device work on 2026-10-26; these Web
recordings do not supply it.
