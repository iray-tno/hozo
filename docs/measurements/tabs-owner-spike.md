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
