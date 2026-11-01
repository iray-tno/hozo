# Tabs repeated-owner spike (RFC010)

## Unavailable-owner baseline

After the BottomSheet lifetime correction, Tabs is the next repeated-owner
probe in RFC010 phase A. Each tab owns selected/disabled and its own pointer
and focus state; one strip-wide class string does not give sibling tabs the
same facts. No Tabs contract is promoted merely by naming that owner.

The first source check found a real Web/Native discrepancy: Native supplies
`disabled` to its Pressable, while Web supplied only `aria-disabled` and skipped
the tab in roving focus. The Web button remained programmatically focusable
and did not match Tailwind's `:disabled` or compiled Hozo's
`[data-hozo-disabled]`. The click handler's guard alone is not native button
unavailability (decision 001).

The Web tab now supplies both `disabled` and the compiled selector marker,
alongside its existing ARIA state and roving tab index. Enabled siblings omit
both attributes. No new runtime helper, subscription, state machine, style
normalizer or dependency is involved. Existing selection, panel identity and
disabled arrow-skip logic remain unchanged.

The strengthened SSR regression fails before correction and passes afterwards;
the prior assertion explicitly forbidding a native disabled attribute was
incorrect for decision 001 and is replaced rather than preserved as a policy.
The focused wiring suite has 14 passing tests. The UI wrapper's duplicate
old expectation and its explanatory comments are updated to the same policy;
its existing `aria-disabled:` look remains valid and unchanged. This is DOM markup/owner-state
evidence, not browser event delivery, computed style, Native pixels, assistive
technology, performance or a completed owner audit. Real browser and Native
resolver comparisons follow as separate evidence, not implied by an SSR pass.

## Repeated live facts, before prepared caller rewriting

`tabs-owner-state.test.ts` runs the actual Native Tabs and shared Pressable
hooks against the existing RN host stand-ins. Its candidate map is generated
in one real prepared Tailwind context, not an invented rank table. Three tabs
share the same nine candidate tokens and independently own their selection,
disabled, hover, focus and press facts. The sequence is initial, hover second,
focus second, press second, select second, then a controlled selection of the
disabled third tab. The last case checks `aria-selected:disabled:p-3` without
borrowing a sibling's interaction. Existing positional host identity and
callback behavior must remain stable, including rejecting direct activation
of the disabled tab. The state changes do not rebuild the candidate map.

`owner-tabs.test.mjs` repeats that sequence using the actual Web component,
real browser pointer/focus/click delivery and two separate stylesheets:
Hozo's candidate output and independently compiled Tailwind CSS. Each phase
checks all three hosts, not just the active one. Six phases mean 18 Native
host observations and 36 Web observations (18 candidate + 18 Tailwind).
Natural button dimensions are normalized only for the deliberately large
focus/press widths/heights; the other captured values are computed styles.
An unavailable button must reject programmatic focus and click. Removing
its native/compiled unavailable hooks must visibly remove `disabled:` opacity,
even with `aria-disabled` still true: the two facts are not conflated.

Both receipts retain source commit, dirty status, the actual prepared Native
context fingerprint, passed/failure and partial observations. CI runs these
directly and uploads `owner-tabs-evidence` even on failure. The ordinary
Storybook test list includes the browser test; exact raw-source Turbo inputs
cover the helper and its compiler/Tailwind implementation dependencies.

The local Native test and oracle/bundle preparation passed. No local browser
was launched: browser results require an inspected CI receipt. Native event
handlers are invoked by the test, not an OS or screen reader. This establishes
bounded actual-owner facts in the existing component-managed route, not a
prepared Tabs caller carrier, full text/author composition, a manifest audit,
general interaction compatibility or default compiler adoption. Those remain
separate gates for extending the application seam.

The first browser CI run (`41273375045`) failed before any state progression:
the shared UA reset used `border:0`, leaving `border-style:none`, so the
expected disabled border width painted as zero. Both subjects now use a
solid-border baseline and retain the 3px expectation. Its Native companion
also failed before executing because this narrow workflow had not built
Metro's source-transform entry; that dependency is now an explicit build
target, not a heavy Metro application bundle. These are harness defects,
not product failures or flakes; the original log/partial receipt is retained.
