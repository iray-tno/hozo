# Real-reader evidence

The `screen-readers` workflow runs NVDA with Chrome on Windows and VoiceOver
with Safari on macOS. A change under this directory triggers both jobs. Each
reader needs a desktop and owns its browser serially; the DOM and virtual-reader
checks in the Storybook example cannot replace this run.

After building `examples/storybook-demo/storybook-static-check` and setting up
Guidepup and its recorder as in the workflow, run a targeted capture from the
repository root:

```sh
pnpm --filter @hozo/example-screen-readers read code-and-splitter.spec.ts
```

The two scenarios record the `patterns-resizablepane--default` and
`patterns-codeblock--default` stories. Splitter captures keep warm-up speech
separate, then pair each measured key with its resulting size, value text,
focus and collapsed-subtree facts. CodeBlock captures include the figure's
reading and an actual Copy activation; the clipboard is not replaced by a mock.
The Chromium scenario grants clipboard-write permission to its local origin;
the Safari scenario uses the reader's real key activation. Neither changes the
application's clipboard connection.

The workflow uploads `screen-readers-nvda` and `screen-readers-voiceover`
artifacts, retained for 14 days. Inspect `phrases/<reader>/<scenario>.json`
alongside `recordings/<reader>/<scenario>.mp4` (NVDA) or `.mov` (VoiceOver).
Record the workflow URL and tested revision in the tracking issue. A failed
runner setup is not evidence of what a reader says.

## Approving speech

A person must review each recording and its action-by-action phrases. Check
that the separator's name and value match the action; the figure's caption,
inserted/deleted/highlighted prefixes and code are intelligible; gutter numbers
and markers are absent; and Copy completion is announced. DOM assertions alone
do not approve any of those speech claims.

After review, put the necessary phrases in
`expected/<reader>/scenarios/<scenario>.txt`, one per line in reading order.
Use `#` comments to explain the approval and link its run/revision. Do not
invent expected phrases from ARIA attributes or an agent's prediction.

Without this file, the new scenarios record `approved: false`, add an
`unapproved-speech` annotation and print `[unapproved]`. They still fail on
missing speech or incorrect DOM effects. A green capture with this annotation
means evidence is available for review; it does not complete
[#1276](https://github.com/iray-tno/hozo/issues/1276). Review uncovered defects
and repeat the real-reader run without raising traversal or timeout budgets.
