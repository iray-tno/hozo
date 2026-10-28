# One disabled owner fact

This repairs [#1359](https://github.com/iray-tno/hozo/issues/1359), found by
the positive-ARIA differential for #1230. It does not yet admit `aria-disabled`
to common Tailwind ordering; that graduation is a separate dependent layer.

## Contract and implementation

Hozo's existing unavailable policy is
`Boolean(disabled || accessibilityState?.disabled === true)`. An explicit false
flag cannot enable a state-disabled control. Behavior, announcement, static
styles and generated class state must agree on this fact without dropping
`selected`, `checked`, `busy` or other authored state keys.

The IR now owns this fact. A typed state-member predicate is distinct from an
authored expression with the same source span, including its generated Web
guard class. Native metadata uses one small pure `nativeDisabledProps` leaf
when normalization is required. Its generated export follows the normal ABI
generator; no runtime React Native import or provider is introduced. Metadata
evaluates each authored flag/state expression once. This is not a new promise
of single evaluation across every generated style/prop expression.

Ordinary compiled controls without state have no new helper import/call;
literal partial state without a disabled key also avoids it unless an explicit
flag requires merging. The helper returns the original props on the enabled
and already-normalized fast paths, preserves a disabled state object's identity,
and never mutates authored input. Native fallback/enhanced Pressable and Link
share the same helper. Disabled links stop authored callbacks, prefetch and
navigation before those operations run.

Web emits one `aria-disabled` value instead of competing state/flag attributes.
Actual form controls retain real HTML `disabled`, now using the same effective
fact; ARIA reflection does not replace platform behavior. Opaque optional state
objects are null-safe. ADR 001 records the existing OR policy explicitly.

## Verification and cost

CPU 1/Idle, serial builds and test concurrency 1. All final Rust changes were
followed by a fresh debug addon before JS verification.

- Workspace Rust: **1,079 passed, one intentional ignored**; fmt and all-target
  Clippy with warnings denied passed. The Web regression distinguishes a raw
  authored condition from the compiler-owned member fact at the same span.
- Compiler: **360 passed, one existing skip**. New matrix: **432 observations**
  across Pressable/Button/Link, handlers, flag/state/both sources, static/dynamic
  classes and optional/false/true/mixed state values. Props and generated/static
  Native styles agree. Metadata evaluation/cold-path guards cover all three.
- Tailwind **153**, Metro **93**, Vite **62**, Next **21**, primitives **85** and
  real-browser composition **36** tests passed. Native host/receipt/cache tests
  **145** passed, including **18 mounts** through actual fallback/enhanced/link
  implementations and a state-disabled link activation attempt.
- Primitives production/test and core production typechecks passed. Generated
  ABI checks report **57 leaves / 79 names**; metadata, receipt freshness,
  generated docs, lint and diff checks passed. Source probes include the actual
  helper and Native guards in Turbo inputs, verified in a dry run.
- Isolated esbuild-minified helper: **201 bytes / 159 gzip bytes**, no runtime
  imports. This excludes module-loader and whole-app/Metro costs; no whole-app
  size or speed result is claimed.

Earlier failures are retained under
`artifacts/tailwind-order/namespace-invariance/disabled-*`: intentional emitted
prop/fact expectation updates, incorrect probe warnings/fixture roles, an
unsound generic helper return type, a broad SSR assertion that also matched CSS,
and a stale core generated-entry build used by Vite. The helper return type and
SSR assertion were corrected, generated entries rebuilt, and affected suites
passed. These are not classified as flakes or hidden by retries.

No new conformance percentage, fresh full app/device/AT result, full root JS
suite or completed six-group migration is claimed. The generated Native source
receipt is freshness evidence, not a device run. Those heavier integration
checks belong to CI.

## CI follow-up: stale native-button expectation

CI runs `40634948574` and `40639815504`, plus the dependent layer's
`40635688033` and `40639814998`, each failed the same Storybook assertion:
`disabled-link.test.mjs` required an ordinary disabled button to omit
`aria-disabled`. The actual host retained `disabled=""` and intentionally
reflected `aria-disabled="true"`. The old assertion was not updated along with
the shared owner-fact contract. The failure was reproduced locally and was
not classified as flaky. Rebased source trees were identical, so rebasing or
rerunning alone could not fix it. Both original PRs' Android/iOS jobs passed.

The repair changes tests only: compiled/fallback SSR hosts must retain native
disabled and the matching ARIA/data fact for true, false and absent input.
Real-browser tests additionally require native `:disabled`, suppressed
programmatic click/Enter activation and Tab exclusion, with enabled controls
still clickable and reachable. The fallback assertion is scoped to the actual
button rather than its base stylesheet. The focused suite has **nine passed,
zero skipped**. This does not replace the original runtime correction or
weaken native disabled behavior.

With a fresh addon at the lower layer, the exact Node phase extracted from
Storybook's CI test entry passed **268 tests, zero failures or skips** (up from
265 because the old single assertion becomes four compiled/fallback SSR and
browser tests). This includes all its existing browser and Native-host probes;
it is not a fresh Storybook production build or device/AT run.

## CI follow-up: explicit enabled-state transcripts

The repaired Node phase passed in CI `40642591896` and `40642591429`, as did
the real Storybook build and all **204 light/dark accessibility cases**. Both
then failed the virtual-reader golden comparison for two stories. Native
Button's explicit `disabled={false}` now reflects `aria-disabled="false"`, so
the virtual reader includes "not disabled" for Play/Pause/Restart video and
Add one. The source supplies a false unavailable flag in these initial states;
the emitted metadata is intentional, not a lost label, role or activation.

Only these **four phrases in two golden files** are updated. The other reading
order and text are unchanged. Downloaded `_utterances-result.json` evidence
from both failed runs contains all **102 stories**, finished without reader
errors. Replaying the unchanged catalogue comparator reproduces exactly those
two failures before the update; afterwards all **102 transcripts in each run**
match the reviewed goldens. There is no local Storybook rebuild, fabricated
transcript, reader-rule change or blanket snapshot approval. The same captured
evidence is not a fresh post-change browser run, and this virtual reader is
not NVDA, VoiceOver or TalkBack. Full post-change Storybook gates remain CI work.
