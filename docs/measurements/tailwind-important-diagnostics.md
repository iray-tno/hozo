# Important syntax is recognized without pretending it is lowered

Stacked on #1314 in RFC007/#1230. This repairs the **silent/misclassified
failure** found by the candidate-plan comparison; it is not full `!important`
support or the shared winner switch.

## What changes

The scanner now retains recognized important candidates with their original
spelling, normalized value facts and an explicit `important` flag. Suffix
`p-2!` and legacy base-prefix `!p-2`/`hover:!p-2` are identified separately
from punctuation inside arbitrary values. A misplaced `!hover:p-2` is not
rewritten into a valid variant. Unknown custom names do not become warnings
merely because they end in `!`.

Static expansion does **not** emit normalized normal declarations for an
important token. Both Web and Native report
`TAILWIND_IMPORTANT_NOT_LOWERED` on a lowered owner's known root/secondary
class inputs, including statically visible branches. Existing literal facts
and owner nodes are reused, not a new AST parse or expression evaluation.
Foreign component contracts are left alone. Native's carried-class warning
does not duplicate the common warning for the same input.

The actual Native candidate generator puts these names in `unsupported`, not
styles/state groups. Its resolver warns once when one is actually requested;
normal utilities in the same map still resolve. The build-time sidecar marks
the entry `refused` with `important-not-lowered`, rather than publishing a
drawable object/ordinal merely because upstream has an important descriptor.
Native class reports/verdicts identify the missing behavior for audit.

Web candidate generation likewise emits no falsely normal declaration.
Static Web still preserves the authored class, so externally authored CSS can
match it, but Hozo's warning is explicit: its own output does not implement
that utility. This is not a new Web-only implementation or a workaround that
silently strips `!` on Native.

Candidate snapshot/scan-receipt version moves **5 -> 6** because discovered
names changed. Equal mtimes cannot revive an older missed candidate; old
snapshots are discarded and old exported receipts rejected. The independent
StyleX module-summary cache version remains unchanged.

## Verification scope

Windows, CPU 1, Idle priority, explicit serial execution. Final workspace
Rust: **1,053 passed** (two new parser tests); fmt, all-target Clippy with
warnings denied and fresh addon/compiler/Tailwind builds passed. Compiler:
**353 passed, 1 existing Windows privilege skip** (five new regressions).
Tailwind: **118 passed** (one new independent upstream refusal test).
Host smoke: **61**, Vite: **57**, Native fixture: **5**, source-cache guards:
**11**, prior targeted browser oracle: **1 test / 8 comparisons**, all passed.
Lint: **1,708 files**; docs: **76 primitives**, layout and **24 footers** passed.

- Parser controls cover outer suffix/legacy prefix markers, invalid repeated
  or misplaced markers, punctuation inside arbitrary values, lowered root and
  secondary inputs, duplicate known branches and foreign component ownership.
- Compiler regressions check identical diagnostic codes on Web/Native,
  non-ASCII source offsets, one warning per input/class, real emitted fallback
  resolution/warn-once behavior, ordinary-value preservation, Native audit
  findings and old-cache rejection at unchanged mtimes.
- Independent upstream Tailwind preparation recognizes six important forms
  and rejects the misplaced-prefix control; actual generated candidate plans
  still refuse them. **Upstream facts are not Hozo support.**
- Text fixture source receipts now include the common diagnostic helper and
  its scan/literal/Native diagnostic dependencies (26 -> 30 sources); affected Turbo inputs and
  guards cover them. Regeneration must not change component bodies/text ABI.

The initial Rust compile required converting the warning reason to an owned
string. A later test expectation accidentally changed the separate StyleX
cache version; the failing `5 !== 6` observation was investigated and that
unrelated edit reverted. These are implementation/test mistakes, not flaky
failures or product improvements. Evidence and the retained failure summary
are under `artifacts/tailwind-order/important-diagnostics`.
Clippy also requested simplifying the duplicate-warning boolean; a named
already-reported fact keeps it readable. After the final receipt dependency
was added, the fixture equality guard correctly rejected the old generated
receipt; normal regeneration and the repeated fixture/cache checks passed.

## Still required

Important declarations need correctly preserved precedence across ordinary
and state-conditioned writes, input boundaries and static/fallback routes.
Those must use the common priority plan, not a new important-only sorter or
a suffix-stripping shortcut. Until that output integration is complete,
important syntax stays explicitly unsupported. This layer adds no support
percentage and does not close #1230 or its original owner-state mismatch.

Ordinary no-marker paths do not allocate normalization strings or traverse
owner trees for the new diagnostic. That is a structural fast-path property,
not a measured zero-overhead claim. No full local root JS/pack/app/Metro/GPU
build, fresh Native pixels/AT, new performance/heap/bundle or conformance gain
is claimed; broad integration remains CI's job.
