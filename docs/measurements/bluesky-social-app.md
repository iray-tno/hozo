# Real-app measurement: Bluesky social-app

This is a read-only compiler measurement, not a claim that the application can be migrated without changes. The audited checkout is not modified.

## Corpus

| | |
|---|---|
| Repository | https://github.com/bluesky-social/social-app |
| Commit | `007c893de107c2ecbf2188d618196075f19c8f5a` |
| Source | `src/**/*.{tsx,jsx,ts,js,mts,mjs}` |
| Authored files / TSX subset / context modules | 1,660 / 1,049 / 0 |
| Source bytes | 7,216,111 |
| Shared / Web / Native | 1550 / 89 / 21 |

## Findings

1. **The corpus parses cleanly:** 0 parse or compile failures across 1,660 JS/TS files (extension-aware syntax parsing, not TypeScript validation).
2. **The DOM style-array invariant holds:** Web lowering emitted no React Native style arrays into DOM style props.
3. **The direct RN JSX boundary is closed:** Web lowering retains no JSX bindings imported from React Native. Non-JSX React Native APIs and third-party native libraries remain separate migration boundaries.
4. **Styling surface:** 9 of 1660 files use `className` and 651 use `style`.

The separate [production dependency-graph measurement](./bluesky-rnw-free-build.md) remains a historical build experiment over the same pinned corpus. This static audit does not rerun that production build or certify runtime behavior.

This Slice 3 snapshot expands the authored scope from 1,050 TSX files to **1,660 JS/TS files** (1,049 TSX + 611 TS). The shared compiler walk excludes `src/screens/Messages/components/vendor/KeyboardStickyView.tsx`; the earlier dedicated audit walker included it. Three declaration-only files are listed as excluded source inventory in JSON. Generated/dependency directory contents are not enumerated. The authored fingerprint changes because the measured scope changes, not because the pinned checkout changed.

Semantic counts remain **1,193 Web / 1,149 Native components in 573 lowered files**, with zero observed direct RN JSX residue, invalid DOM style arrays or eligible shared-backend count mismatches. The extension-aware follow-up removes the one failed probe at `src/components/Dialog/sheet-wrapper.ts:11:39`: its valid generic async arrow now parses as `.ts`, rather than TSX. All **1,660 files** complete the selected analyses with **0 parse/compile failures**. Warnings move **219 → 218**, solely by removing `PARSER_PROBE_REJECTED`; the 135 `RN_COMPAT_NOT_INSTALLED` setup warnings remain. This restores the direct JSX boundary verdict for the selected scope, not a claim that all RN APIs or a production app work without RNW. No transform extension gate was expanded, and invalid TSX is not retried as TS.

Conventional CSS remains absent; builtin tokens and auto preflight=true are explicit compiler assumptions, not evidence about Bluesky's production reset. Root tsconfig is read and hashed, but its package-based `extends` is unsupported by the local-only static alias loader; aliases are not guessed. No StyleX definitions/consumers are observed in this corpus, so its prepared graphs are empty and it loads no context modules. Cross-file/alias/reexport/platform behavior is demonstrated by dedicated fixtures, not by Bluesky. Shared/native probes select Android by default; iOS/Android-suffixed files retain their own platform.

The Slice 4 source census remains an independent compiler-owned observation. All 1,660 files complete it: 1,300 direct RN import bindings include 406 explicit type imports, one value import used only as a type, and zero unused value imports. There are 5,442 authored runtime reference occurrences, 720 type references and two direct runtime reexport edges. Reference counts include opening/closing JSX tags, not component/call counts; member reads, component values and exports remain separate in JSON. Aliases and lexical shadowing are resolved rather than matched by spelling. CommonJS, dynamic import, TS import-equals and indirect wrapper/data-flow usage remain outside this ESM inventory; zero dynamic-member references here is not proof those other forms are absent.

The next Slice 4 increment records **actual Web import-specifier decisions** from the shared lowerer, not a second audit replacement table or a post-lowering usage guess. All **1,639 Web-selected files** complete the journal, with zero partial/failed/unmapped cases: **213 imports moved to Hozo, 668 retained RN import declarations, 406 explicit type-only imports and two unassessed forwarding edges**. Native-only files are not in this Web denominator. A retained declaration is not a remaining runtime-use count: JSX lowering can already have removed its uses and left the import for bundler elision. Semantic-reference rewrite dispositions and member compatibility are still unassessed, so Slice 4 is not complete. Existing component, residue and diagnostic counts are unchanged, including 135 missing-compat-package warnings; an import move does not certify package resolution, dependency removal or runtime behavior.

The serial import-journal observation on two logical CPU cores took **25.87s**: 0.28s discovery, 0.09s Git provenance, 15.91s authored snapshot reads, 3.91s project preparation, 0.93s bindings, 0.99s RN usage analysis, **2.77s Web lowering with the journal** and 0.82s Web residue parsing. The previous source-census observation took 8.89s with 0.21s reads; other observations took 7.89–44.60s with 0.06–35.05s reads. These whole-audit observations are **not a controlled performance comparison**. Node 25.9.0, Tailwind 4.3.3 and JSONC parser 3.3.1 were used with a freshly rebuilt development binding. Full input hashes, eligibility, unresolved facts and stage observations remain reproducible in JSON.

A separate warm-source comparison uses the same loaded addon/compiler and the same 1,639 Web inputs, no observer, default theme and no filesystem/project-preparation time. After warming both paths, three alternating-order rounds took **1.499 / 1.512 / 1.495s** for main's regex import path and **1.779 / 1.756 / 1.762s** for structural rewriting; both produced 608 transformed modules in each round. Median overhead is **0.263s (17.6%)** across the corpus. Ordinary builds skip the structural parse when this stage has no possible owned-name candidate; escaped strings/names disable that shortcut. Analysis deliberately pays for retained decisions too. This is a local two-core compiler comparison, not a bundler, build-time or device-performance claim. The syntax-safe rewrite has a measured cost; it is not presented as a free analysis feature.

Slice 1's corrections are retained: previously omitted setup warnings stay visible, and rewritten Hozo Pressable imports are not mislabeled as direct React Native residue. This slice adds analysis scope/context, not new component compatibility.

The next Slice 4 increment joins **actual backend JSX tag emissions** to authored RN symbols.
All **1,639 Web-selected files** complete this journal, with zero partial/failed/unmapped
cases: **5,056 replaced names and 38 preserved names**, including opening/closing occurrences.
All 5,094 observed Web RN JSX references have an exact emission join in this corpus.
Preserved spelling does not mean a retained RN dependency: the separate import journal may
have moved the binding. The remaining **1,043 Web references** are explicitly not assessed by
the tag journal: **284 runtime member reads, 39 runtime value references and 720 type
references**. Props, handlers and factories are not classified from their containing root.
At that increment, non-JSX reference/member compatibility remained the next Slice 4 task; this was not completion
of the whole RN migration boundary. Component, source inventory, import-decision and diagnostic
counts are unchanged. The pinned checkout remains clean and the authored source fingerprint
is unchanged (`db5373982baac27062021d8503f795cdb38a78d7cc2e0a2dccfe7eab805f36d8`).

This serial observation took **9.74s**, including 0.25s discovery, 0.06s snapshot reads,
3.83s project preparation, 0.97s binding inventory, 1.02s RN usage, **2.49s Web lowering
with both journals** and 0.85s Web residue parsing. As above, whole-audit observations
are not controlled comparisons. The fresh development binding SHA-256 is
`f0579bffc028bda9dc80e88db05066b072cc140e68ee66879b153da54219b991`.

A separate paired warm-source observation isolates the opt-in backend tag journal on the
same addon/compiler, two logical cores and **1,034 Web-selected TSX inputs**. Three
alternating-order rounds took **0.670 / 0.657 / 0.668s** without tracing and
**0.666 / 0.663 / 0.670s** with tracing. Both produced 1,193 components each round;
the traced path emitted 5,094 tag records, while the ordinary path allocated no journal.
These small differences are within this local observation's noise, not a speedup claim.
This comparison excludes import journaling, authored-source joins, project preparation,
filesystem work, bundlers and runtime/device performance.

The next Slice 4 increment follows non-JSX runtime references through **all actual module
splices**, retaining only unchanged-source provenance and joining the actual import journal.
All **1,639 Web-selected files** complete the value journal with zero partial/failed/unmapped
cases. Of **323 non-JSX runtime references**, **187 survive with an import moved to Hozo,
121 survive RN-backed, and 15 remain unassessed** inside generated/replaced expressions.
The **720 type references** are excluded separately, not classified as runtime migration work.
No post-lowering spelling census or containing-root inference is used.

The generic member/access inventory is a review queue, not an adapter-compatibility matrix.
It makes retained `Alert.alert` (28), `LayoutAnimation.configureNext` (23),
`LayoutAnimation.Presets.easeInEaseOut` (22), `AppState.addEventListener` (7) and
`Linking.openURL` (6) visible. Counts are authored reference occurrences, not call counts.
Moved `StyleSheet.create` (47), `Platform.OS` (32) and `Keyboard.dismiss` (24) still need
member-contract/runtime evidence; import movement alone does not certify them. The 15 unknowns
must not be added to retained RN counts. Generated expression provenance, member compatibility,
third-party dependencies, production removal and runtime remain open; Slice 4 is not complete.
Component/import/tag/source/diagnostic counts remain unchanged, as do the clean pinned checkout
and authored fingerprint.

This serial observation took **28.97s**, including 0.29s discovery, 18.77s snapshot reads,
4.11s preparation, 0.98s bindings, 1.06s source usage, **2.60s Web lowering with journals**
and 0.87s residue parsing. Filesystem read variation dominates; this is not a controlled
performance comparison with previous observations. The freshly rebuilt development binding is
`0867a53a54e86f5f915ce309b3b323dc8391e954a5c798844219d65d7e4d90af`.

The next Slice 4 increment adds **backend-proven copied expressions**: actual verbatim
prop/child fragments and DOM style/spread normalizer values, composed through nested replacements,
class namespacing and later module splices. All **1,639 Web-selected files** complete the value
journal with zero partial/failed/unmapped cases. The same **323 non-JSX runtime references** now
split into **195 Hozo-backed, 126 RN-backed and two unassessed**. Of the 15 previous unknowns,
13 acquire copy evidence (eight Hozo-backed, five RN-backed); the other 308 assessed references
retain unchanged-module evidence. This is increased audit visibility, not new compatibility.
The remaining unknowns are `LayoutAnimation.configureNext` and
`LayoutAnimation.Presets.easeInEaseOut` in `src/components/moderation/PostHider.tsx`, inside a
synthesized canonical handler with no emission provenance. Unknown does not mean retained.
Source/component/import/tag/diagnostic counts, pinned checkout cleanliness and authored fingerprint
are unchanged. Member compatibility, third-party dependencies, production removal and runtime
remain unassessed; generated-expression scope is explicitly `copied-runs-only`.

This serial observation took **10.24s**, including 0.29s discovery, 0.06s snapshot reads,
3.99s preparation, 0.99s bindings, 1.05s source usage, **2.68s Web lowering with journals**
and 0.87s residue parsing. This is not a controlled whole-audit performance comparison. The freshly
rebuilt development binding SHA-256 is
`95c3d881a594a394ceef62c4d3549b2a127863040222d5db2dc71778994f862a`.

A separate paired warm-source observation on the same addon/compiler, two logical cores and
**1,034 Web-selected TSX inputs** took **0.660 / 0.655 / 0.661s** without tracing and
**0.698 / 0.697 / 0.695s** with tag plus copied-expression tracing. Both produced 1,193 components
each round, with 5,094 tag records on the traced path. Median tracing overhead was **37ms (5.6%)**.
Ordinary compilation allocates neither journal. This local opt-in emission-tracing observation
excludes import journaling, authored-source joins, project preparation, filesystem work, bundlers
and runtime/device performance; it does not measure before/after changes to ordinary compilation.
An untimed parity pass over the same inputs confirms identical JSX/CSS/imports/diagnostics with
tracing on or off, 7,024 exact source-copy fragments and no ordinary copy journal. Both source and
emitted UTF-16 slices are checked directly for every fragment.

The next Slice 4 increment records **actually emitted canonical handler values**: renamed
onPress/responder props, the function argument to `hozoInteractive(...)`, and the authored
handler in the sibling arm of a disabled link's conditional. None of these places the authored
function body inside a new lexical binder. Generated callback syntax and disabled guards are
not inferred as copies; a handler omitted by a target-prop collision receives no record.

All **1,639 Web-selected files** complete the value journal with zero partial/failed/unmapped
cases. The same **323 non-JSX runtime references** now split into **195 Hozo-backed,
128 RN-backed and zero unassessed**. The last two unknowns, PostHider's
`LayoutAnimation.configureNext` and `LayoutAnimation.Presets.easeInEaseOut`, are confirmed
RN-backed through the copied helper argument. The proof split is **308 unchanged-module /
15 backend-copied** references, with **720 type references** excluded separately. This closes
unassessed references in this pinned Web source inventory, not the RN migration boundary:
member contracts, third-party APIs, production dependency removal and runtime remain unassessed.
Other canonical expressions without copy records can still be unknown in other applications;
generated-expression scope remains `copied-runs-only`. Component/import/tag/source/diagnostic
counts, the clean checkout and authored fingerprint are unchanged.

This serial two-core observation took **16.50s**, including 0.29s discovery, 5.88s snapshot reads,
4.14s preparation, 1.04s bindings, 1.10s source usage, **2.80s Web lowering with journals** and
0.92s residue parsing. Filesystem variation makes this unsuitable as a controlled whole-audit
comparison. The freshly rebuilt development binding SHA-256 is
`7497bfe0ef766db4d09ab47208b5cb69f27558d2268cde02af7dd516df206339`.

A separate paired warm-source observation on the same addon/compiler and **1,034 TSX inputs**
took **0.710 / 0.707 / 0.697s** ordinarily and **0.743 / 0.745 / 0.740s** with tag+copy tracing.
Median opt-in tracing overhead was **36ms (5.0%)**, not a before/after ordinary-build comparison.
Both paths produce 1,193 components, with 5,094 traced tag records. An untimed parity pass confirms
identical JSX/CSS/imports/diagnostics, **7,128** matching authored/emitted copy fragments and no
ordinary copy journal. Preparation, filesystem, import journals, authored-source joins,
bundlers and device/runtime performance are outside this paired observation.

## Authored surface

The next Slice 4 increment attaches **compiler-owned reviewed Web member subsets and residual
API guidance**, without changing import or source-copy decisions. The catalogue reviews 18
Platform/StyleSheet/Keyboard/Dimensions members and gives next actions for 10 retained RN members.
Only direct named-import static members with an assessed final origin can match; no missing
entry is inferred unsupported. In the same pinned source inventory, **154 references** acquire
a declared adapter subset, **105** acquire retained-RN guidance and **64 remain unreviewed**.
These three categories partition the same 323 references; they are not compatibility scores.
The 64 unreviewed member uses are distinct from the zero unknown final-origin decisions.

The clean commit/fingerprint, 1,639 completed Web value journals, 195 moved / 128 retained /
zero unknown origins, 308 module / 15 copied proofs, 720 excluded types, component/tag/import
counts and 218 warnings are unchanged. No production RNW-free or device test was rerun.
This serial two-core audit took **24.10s**, including **13.09s snapshot reads**, 4.01s preparation,
1.06s binding analysis, 1.14s source usage, **3.09s Web lowering** and 0.94s residue checks.
Filesystem variation prevents a controlled whole-audit performance comparison with earlier runs.
The final-render repeat reports the same counts and binding in **10.15s** (snapshot reads 0.05s,
preparation 3.81s, Web lowering 2.55s), demonstrating why the total alone is not a compiler-speed
regression measurement. Markdown now links the reviewed implementation and tests on Hozo main.
The fresh development binding SHA-256 is
`bee7dd7a4e1776f24f705c0f067ea4d58a2b3f6c0172ab2decfb50e915774145`.

`memberCompatibility` stays `not-assessed`: these are declaration-subset reviews, not validation
of calls, writes, data flow, installed adapter versions or Native/runtime behavior. For example,
Keyboard notifications do not fire and Platform.Version is a placeholder. Per-reference JSON
and grouped Markdown retain limitations, next actions and implementation/test paths. Evidence
links use Hozo main, not the audited application or a frozen installed-tool revision.

The first Slice 5 increment adds **optional JSON baseline comparison**, without changing the
audited source or compiler decisions. A serial rerun over the same clean pin retains all
1,660 authored files, the same authored fingerprint, **218 warnings**, 1,193 Web / 1,149 Native
components, and the same 323 non-JSX references and 154 / 105 / 64 member-review partition.
Source/import/tag/value/diagnostic summaries are asserted equal to the previous raw JSON.
No production dependency graph or device test is rerun.

The comparison is deliberately **partial**, not a zero-regression certification: the existing
unsupported package-based tsconfig extends leaves alias context unassessed. It reports no
added/removed/source-changed/target-changed files, but does not promote either observation's
218 warnings to new/resolved/continued verdicts (**436 retained unassessed records**).
The **1,639 Web-selected boundaries** remain unassessed for comparison; 21 Native-only files
are separately not applicable. This is a limitation of strict context comparability, not newly
broken source or additional diagnostics. Line movement, changed severity, duplicates, moves,
failed probes, CSS/config changes and actual RN boundary categories have dedicated fixtures;
this corpus does not substitute for those fixtures.

Comparison of the already-read reports took **52.5ms**, excluding JSON reads/parsing and Markdown
rendering. The fresh serial two-core audit took **29.63s**, including **19.80s snapshot reads**,
3.87s preparation, 0.93s binding analysis, 1.00s source usage, **2.52s Web lowering** and 0.85s
residue checks. Filesystem variation again prevents a controlled whole-audit speed comparison.
The rebuilt development binding SHA-256 is
`fc0171e9fe932b1418d8040f6d173ef7db99718ee4829ebd0a5c6378db724e00`.
Different recorded tool identities are provenance, not a causal explanation for count changes.

The next Slice 5 increment supplies **explicit CI failure policies** without changing compiler
decisions. Another clean, pinned rerun again retains the same 1,660 files, authored fingerprint,
218 warnings and source/import/tag/value/member-review summaries (asserted equal to the prior
JSON). Evaluating those uncapped records with `none` or `error` returns exit **0** for this
warning-only observation. `new-errors` returns **blocked / exit 1**, with `newErrors: null`,
because the unchanged unsupported tsconfig extends still makes comparison partial. It does
**not** convert 436 unassessed before/after findings or 1,639 unassessed Web boundaries into a
zero-regression verdict. No build graph, dependency-removal or device claim is added.

Comparison over already-read reports took **49.3ms**; separate policy evaluations took
**1.01 / 0.81 / 0.29ms** for none/error/new-errors, excluding JSON I/O and rendering. These
single local observations are not a controlled performance benchmark. The serial two-core
audit took **27.87s**, including **17.92s snapshot reads**, 3.98s project preparation, 0.95s
bindings, 1.01s source usage, 2.56s Web lowering and 0.83s residue checks. The freshly rebuilt
development binding SHA-256 is
`56d3fe72555b4f2b8ad5c5b6adfa4d98c2c4124a57fc439c3ea2de2261e6f61f`.
The CLI writes failed/blocked policy reports before exiting; dedicated fixtures cover real
new Native errors, continued errors, warning escalation, ambiguous subjects, source syntax
rejection, changed scope/schema and malformed inputs. This corpus's zero current errors does
not exercise those cases or make partial project context complete.

The next increment resolves **installed static package tsconfig presets** in the shared compiler,
without installing dependencies or executing project configuration. A fresh serial, two-core rerun
of the same clean pin retains all authored/lowering/diagnostic/RN binding and member-review summaries
(asserted equal to the prior JSON): **1,660 files**, **218 warnings**, zero compile errors or direct
RN JSX residue. This checkout has **no installed `@react-native/typescript-config`**, so its alias
fact changes from unsupported package extends to **unresolved missing package**, not resolved
context. Only the root `tsconfig.json` enters configuration inputs; no preset bytes were invented.
Installed-preset fixtures independently prove inherited aliases, Web/iOS/Android StyleX lowering,
read-only operation and manifest/config hash invalidation.

The new `checkout-static-json-extends-v1` resolution policy makes the previous-policy baseline
**not comparable**. A same-report self-comparison under the new policy remains **partial**:
436 before/after finding records and 1,639 Web boundaries are unassessed; 21 Native-only files are
not applicable. This is not an independent second-run comparison or a zero-regression verdict.
`none` and `error` return exit 0; `new-errors` stays **blocked / exit 1**, with `newErrors: null`.
The audit took **11.15s**, including **0.063s snapshot reads**, 4.87s preparation, 1.00s bindings,
1.07s source usage, **2.67s Web lowering** and 0.88s residue checks. Filesystem/cache variation
prevents attributing the whole-audit timing change to this resolver. The rebuilt development binding
SHA-256 is `109cbcc44162c5aaa13203dc5d798c197b031ba616ab29bff8e9afcfdd28182a`.
No production build, dependency removal or device verification was rerun for this increment.

| Signal | Files or bindings |
|---|---:|
| filesImportingReactNative | 636 |
| filesWithDirectReactNativeJsx | 573 |
| directReactNativeJsxBindings | 696 |
| filesWithAliasedDirectReactNativeJsx | 13 |
| aliasedDirectReactNativeJsxBindings | 15 |
| filesWithForeignPrimitiveNames | 540 |
| filesWithClassName | 9 |
| filesWithBareFlexClassName | 0 |
| filesWithStyleProp | 651 |
| filesWithStyleSheetCreate | 47 |

Only direct imports from `react-native` are counted as direct React Native JSX. Application-specific components remain foreign by design; treating every component named `Text` or `Button` as a React Native primitive would create false transformations.

## Corpus-specific signals

These are heuristics supplied by the corpus runner, not general migration guarantees.

| Signal | Files |
|---|---:|
| filesUsingAlfAtoms | 434 |


## Lowering outcome

| Outcome | Count |
|---|---:|
| filesLowered | 573 |
| filesLoweredForWeb | 567 |
| filesLoweredForNative | 543 |
| webComponents | 1193 |
| nativeComponents | 1149 |
| directReactNativeJsxPassedThroughOnWeb | 0 |
| filesWithDirectReactNativeJsxResidueOnWeb | 0 |
| directReactNativeJsxBindingsResidueOnWeb | 0 |
| sharedBackendShapeMismatches | 0 |
| parseOrCompileFailures | 0 |

## Authored React Native usage

| Observed ESM signal | Count |
|---|---:|
| filesAssessed | 1660 |
| filesNotAssessed | 0 |
| importBindings | 1300 |
| explicitTypeImports | 406 |
| importsUsedOnlyAsTypes | 1 |
| unusedValueImports | 0 |
| runtimeReferences | 5442 |
| typeReferences | 720 |
| dynamicMemberReferences | 0 |
| runtimeReexports | 2 |
| typeReexports | 0 |
| sideEffectImports | 0 |

This inventory resolves direct ESM import symbols, aliases and lexical shadowing. Type references,
unused imports, component values, member reads, reexports and side-effect edges stay distinct.
JSON retains every authored binding/reference with UTF-16 spans. CommonJS, dynamic imports,
TS import-equals and indirect wrapper/data-flow usage are not inventoried. These are source facts;
no member compatibility or dependency-removal claim follows from them.

## Web React Native import decisions

| Actual import outcome | Count |
|---|---:|
| filesCompleted | 1639 |
| filesPartial | 0 |
| filesFailed | 0 |
| filesNotAssessed | 0 |
| rewrittenBindings | 213 |
| retainedBindings | 668 |
| typeOnlyBindings | 406 |
| notAssessedEdges | 2 |
| unmappedDecisions | 0 |

The shared Web lowerer journals actual import-specifier edits; JSON joins outcomes to authored
binding indices. Retained imports are not remaining runtime-use counts: JSX can already have been
lowered while its import remains for the bundler to elide. Type-only is not proof of type erasure.
Forwarding/side-effect edges and semantic reference dispositions are not assessed here. No member
compatibility, package-resolution, production dependency-removal or runtime guarantee follows from
an import move. Native remains a compiler probe, not an import rewrite verdict.

## Web React Native JSX tag decisions

| Actual tag outcome | Count |
|---|---:|
| filesCompleted | 1639 |
| filesPartial | 0 |
| filesFailed | 0 |
| filesNotAssessed | 0 |
| replacedJsxTags | 5056 |
| preservedJsxTags | 38 |
| removedJsxTags | 0 |
| notAssessedReferences | 1043 |
| unmappedTags | 0 |

The Web renderer journals emitted opening/closing names, joined to authored binding/reference
indices through unchanged source runs across actual import/Canvas edits. Counts are tag occurrences,
not component counts. Preserved tags describe emitted spelling, not a retained React Native
dependency: their import may have moved separately. Non-JSX expressions, types and tags without
an exact emission join remain not assessed; unknown does not mean retained or unsupported.
Member compatibility, Native rewriting, production dependency removal and runtime are not assessed.
Partial/failed journals remain in JSON but do not enter successful tag headline counts.

## Web React Native non-JSX value decisions

| Actual source-run reference outcome | Count |
|---|---:|
| filesCompleted | 1639 |
| filesPartial | 0 |
| filesFailed | 0 |
| filesNotAssessed | 0 |
| rewrittenReferences | 195 |
| retainedReferences | 128 |
| notAssessedReferences | 0 |
| typeReferencesExcluded | 720 |
| unchangedModuleReferences | 308 |
| backendCopiedReferences | 15 |
| reviewedAdapterReferences | 154 |
| retainedGuidanceReferences | 105 |
| unreviewedMemberReferences | 64 |

References are tracked through actual module splices and verified backend copies that reach
final output, then joined to actual import-origin decisions. JSON retains authored binding/reference
indices, final emitted UTF-16 spans, and all grouped member/access rows. Actual carried prop/child
fragments and DOM style/spread normalizer values acquire copy evidence; class namespacing preserves
only unaffected fragments and discarded void children are excluded. Canonical onPress/responder
handler values preserve scope in event-name changes, interactive call arguments and the sibling
disabled-link arm. Synthesized callback syntax and unrecorded canonical expressions remain unknown
even when their spelling appears in output. Failed/partial journals do not enter these completed-file totals.

The retained-value review queue includes the following most frequent rows (not the complete
inventory; reproduce to obtain all rows and per-file evidence):

| Authored import/member | RN-backed references | Distinct files |
|---|---:|---:|
| Alert.alert | 28 | 5 |
| LayoutAnimation.configureNext | 27 | 17 |
| LayoutAnimation.Presets.easeInEaseOut | 23 | 13 |
| AppState.addEventListener | 7 | 7 |
| AppState.currentState | 6 | 4 |
| Linking.openURL | 7 | 5 |
| Image.resolveAssetSource | 5 | 3 |

Rows describe origin, not unsupported APIs. Review moved values against adapter member contracts
separately. Dynamic/namespace accesses need manual review; unknown generated expressions are not
evidence of retained RN use. Up to 12 sample files per row do not limit reference/distinct-file
counts or complete per-file JSON. Native rewriting, member compatibility, dependency removal,
production builds and runtime are unassessed by this journal.

### Reviewed Web member subsets and next actions

Selected examples from the complete compiler-owned inventory (the reproduced JSON/Markdown
contains all rows, including unreviewed ones):

| Authored member | References | Review | Declared limit / next action |
|---|---:|---|---|
| StyleSheet.create | 47 | reviewed-adapter-subset | Named object styles; no numeric style-ID registry. |
| Platform.OS | 32 | reviewed-adapter-subset | Web reports web; Native OS behavior is separate. |
| Keyboard.dismiss | 26 | reviewed-adapter-subset | Browser focus blur, not a guaranteed software-keyboard close. |
| Keyboard.isVisible | 7 | reviewed-adapter-subset | Always false on Web; does not prove a keyboard is absent. |
| Platform.Version | 5 | reviewed-adapter-subset | Placeholder 0.0.0, not the browser or OS version. |
| Keyboard.addListener | 3 | reviewed-adapter-subset | Removable no-op subscription; notifications never fire. |
| LayoutAnimation.configureNext | 27 | retained-guidance | Review each platform's layout-animation requirements; no replacement is applied. |
| Alert.alert | 28 | retained-guidance | Review buttons, cancellation and focus before a dialog alternative; no automatic window.alert swap. |

The catalogue lives in [compiler member reviews](../../packages/compiler/src/analysis-rn-contracts.ts),
with [origin/unknown boundary tests](../../packages/compiler/src/rn-contract.test.ts).
Adapter reviews reference their own implementation/tests, for example
[Keyboard](../../packages/rn-compat/src/keyboard.ts) and
[its tests](../../packages/rn-compat/src/keyboard.test.ts). Evidence paths name Hozo's reviewed
source, not resolved files in this app. Slice 5 baseline/CI policies remain separate work.

Platform suffixes are respected: Web-only files run through Web lowering, iOS/Android/Native files through Native lowering, and shared files through both.

Web uses the shared module lowering path in memory. Native is a compiler-only component/Canvas probe, not full Metro preparation. Neither certifies production builds or runtime behavior. Non-TSX Web modules only use the existing runtime-import rewrite path; Native compiler results for these extensions are probes, not Metro eligibility. Each target records integrationEligibility in JSON.

Cross-file StyleX uses in-memory, platform-separated graphs and static relative/tsconfig paths resolution. Shared/native probes use android; explicit iOS/Android suffixes use their own platform. Package/custom bundler resolution remains unassessed when no static answer exists. Resolution records and input hashes are retained in JSON. Context-only modules do not enter authored counts. Fonts and production entry-point reachability remain unassessed; no app configuration is executed.

## Project context

| Fact | Status | Value or reason |
|---|---|---|
| css | absent | "No conventional CSS entry found." |
| theme | defaulted | "builtin" |
| preflight | defaulted | true |
| fonts | unresolved | "Static font registration is not supplied; CSS font faces alone do not prove Native availability." |
| aliases | unsupported | "Only local relative tsconfig extends is assessed" |
| stylexGraph | resolved (discovered) | {"scope":"static-admitted-modules","platforms":["web","ios","android"],"modules":{"web":0,"ios":0,"android":0},"unresolvedImports":0} |

Effective compiler assumptions: theme=builtin, preflight=true. Partial context uses builtin tokens only as a probe, not an assessment of the project's theme. Auto preflight uses the compiler's Tailwind facts for selected authored files; it is not discovery of the app's actual bundler settings or reset stylesheet. CSS inputs and content hashes are retained separately in JSON.

"Lowered" counts files the compiler produced components for. It does not mean migrated, and it is not a measure of progress.

A tag is lowered only when its binding was imported from a module Hozo recognises: `@hozo/core`, the other `@hozo/*` packages, or `react-native`. A file importing none of them is carried verbatim and lowers nothing, however much `className` it contains. So a report whose authored surface shows none of those imports and whose lowering count is above zero is describing two things that cannot both be true — read the counts as suspect rather than as a result.

## Diagnostics

| | Count |
|---|---:|
| Files with errors | 0 |
| Files with warnings | 153 |
| RN_COMPAT_NOT_INSTALLED | 135 |
| ARIA_NAME_PROHIBITED | 40 |
| A11Y_INTERACTIVE_WITHOUT_ROLE | 30 |
| A11Y_INTERACTIVE_NESTING | 4 |
| A11Y_PRESS_WITHOUT_KEYBOARD | 3 |
| A11Y_MISSING_ACCESSIBLE_NAME | 2 |
| ARIA_INCOMPLETE_PATTERN | 2 |
| ROLE_HAS_NO_WEB_EQUIVALENT | 1 |
| UNSAFE_PROP_SPREAD_AFTER_STYLE | 1 |

218 complete finding records are available in JSON. Use --details to expand Markdown findings.

## Analysis provenance

| | |
|---|---|
| Audit / compiler versions | 0.2.0 / 0.2.0 |
| Theme loader / Tailwind / CSS parser | 0.2.0 / 4.3.3 / 8.5.26 |
| Loaded binding SHA-256 | 0867a53a54e86f5f915ce309b3b323dc8391e954a5c798844219d65d7e4d90af |
| Authored source SHA-256 | db5373982baac27062021d8503f795cdb38a78d7cc2e0a2dccfe7eab805f36d8 |
| Checkout dirty | false |

Binding identity, per-file outcomes, stage timings and unresolved project facts are retained in JSON. Diagnostic positions use UTF-16 code units; rewritten positions without a source map are explicitly unmapped.


## Authored React Native usage

| Observed ESM signal | Count |
|---|---:|
| filesAssessed | 1660 |
| filesNotAssessed | 0 |
| importBindings | 1300 |
| explicitTypeImports | 406 |
| importsUsedOnlyAsTypes | 1 |
| unusedValueImports | 0 |
| runtimeReferences | 5442 |
| typeReferences | 720 |
| dynamicMemberReferences | 0 |
| runtimeReexports | 2 |
| typeReexports | 0 |
| sideEffectImports | 0 |

This inventory resolves direct ESM import symbols, aliases and lexical shadowing. JSON retains
every authored binding/reference with UTF-16 spans. Actual rewrite dispositions are explicitly
not assessed yet; no member compatibility or production dependency-removal claim follows.

## Most common React Native imports

| Import | Files |
|---|---:|
| View | 553 |
| Pressable | 76 |
| StyleSheet | 53 |
| Keyboard | 25 |
| Platform | 22 |
| useWindowDimensions | 22 |
| ScrollView | 18 |
| LayoutAnimation | 17 |
| ActivityIndicator | 16 |
| Text | 13 |
| AppState | 9 |
| TextInput | 9 |
| Dimensions | 7 |
| Linking | 7 |
| Alert | 6 |

## React Native JSX left in Web output

| Import | Files or bindings |
|---|---:|
| None | 0 |

## Wrong-output boundary

| Confirmed invariant violation | Count |
|---|---:|
| Files whose lowered DOM contains `style={[...]}` | 0 |
| Invalid DOM style-array occurrences | 0 |

A lowered DOM element with style={[...]} is confirmed wrong output: React DOM requires one style object. Other suspicious samples still require source/output review.

This is a lower bound, not a complete wrong-output count. An automatic compiler run can prove this structural violation, but absence of it does not prove rendered behavior is correct. The remaining samples below are the deterministic queue for manual review and follow-up fixtures.

## Review samples

### diagnostic:RN_COMPAT_NOT_INSTALLED

- `src/Splash.tsx`
- `src/ageAssurance/components/RedirectOverlay.tsx`
- `src/ageAssurance/useBeginAgeAssurance.ts`
- `src/alf/util/dimensions.ts`
- `src/alf/util/flatten.ts`
- `src/alf/util/useColorModeTheme.ts`
- `src/analytics/index.tsx`
- `src/components/ContextMenu/index.tsx`
- `src/components/DebugFieldDisplay.tsx`
- `src/components/Dialog/index.tsx`
- `src/components/FocusScope/index.tsx`
- `src/components/Layout/Header/index.tsx`

### foreignPrimitiveNames

- `src/Splash.tsx`
- `src/Splash.web.tsx`
- `src/ageAssurance/components/DeviceSignalsNotice.tsx`
- `src/ageAssurance/components/NoAccessScreen.tsx`
- `src/ageAssurance/components/RedirectOverlay.tsx`
- `src/components/AccountList.tsx`
- `src/components/Admonition.tsx`
- `src/components/AltBadgeWithDialog.tsx`
- `src/components/AppLanguageDropdown.tsx`
- `src/components/Autocomplete/AutocompleteItemEmoji.tsx`
- `src/components/Autocomplete/AutocompleteItemSearch.tsx`
- `src/components/BetaBadge.tsx`

### loweredBy

- `src/Splash.tsx: AccessibilityInfo from react-native, Image from react-native, useColorScheme from react-native, View from react-native`
- `src/ageAssurance/components/NoAccessScreen.tsx: ScrollView from react-native, View from react-native`
- `src/ageAssurance/components/RedirectOverlay.tsx: Dimensions from react-native, View from react-native`
- `src/components/AccountList.tsx: View from react-native`
- `src/components/Admonition.tsx: View from react-native`
- `src/components/Autocomplete/AutocompleteItemSearch.tsx: View from react-native`
- `src/components/AvatarBubbles.tsx: View from react-native`
- `src/components/AvatarStack.tsx: View from react-native`
- `src/components/BetaBadge.tsx: View from react-native`
- `src/components/BotAccountAlert.tsx: View from react-native`
- `src/components/BotBadge.tsx: View from react-native`
- `src/components/Button.tsx: Pressable from react-native, View from react-native`

### diagnostic:ARIA_NAME_PROHIBITED

- `src/components/ContextMenu/Backdrop.ios.tsx`
- `src/components/ContextMenu/Backdrop.tsx`
- `src/components/ContextMenu/index.tsx`
- `src/components/Dialog/index.tsx`
- `src/components/Dialog/index.web.tsx`
- `src/components/FocusScope/index.tsx`
- `src/components/Lightbox/Lightbox.web.tsx`
- `src/components/MediaPreview.tsx`
- `src/components/Menu/index.tsx`
- `src/components/Menu/index.web.tsx`
- `src/components/Post/Embed/VideoEmbed/VideoEmbedInner/TimeIndicator.tsx`
- `src/components/Post/Embed/VideoEmbed/VideoEmbedInner/VideoEmbedInnerWeb.tsx`

### diagnostic:A11Y_INTERACTIVE_WITHOUT_ROLE

- `src/components/ContextMenu/Backdrop.ios.tsx`
- `src/components/ContextMenu/Backdrop.tsx`
- `src/components/ContextMenu/index.tsx`
- `src/components/Dialog/index.tsx`
- `src/components/Dialog/index.web.tsx`
- `src/components/Lightbox/Lightbox.web.tsx`
- `src/components/Menu/index.tsx`
- `src/components/Menu/index.web.tsx`
- `src/components/PostControls/DiscoverDebug.tsx`
- `src/components/ProgressGuide/Toast.tsx`
- `src/components/dms/MessageItem.tsx`
- `src/components/forms/DateField/index.shared.tsx`

### diagnostic:A11Y_PRESS_WITHOUT_KEYBOARD

- `src/components/Dialog/index.web.tsx`
- `src/view/com/util/EventStopper.tsx`

### diagnostic:UNSAFE_PROP_SPREAD_AFTER_STYLE

- `src/components/Menu/index.web.tsx`

### diagnostic:A11Y_INTERACTIVE_NESTING

- `src/components/contacts/components/OTPInput.tsx`
- `src/components/moderation/PostHider.tsx`

### diagnostic:ROLE_HAS_NO_WEB_EQUIVALENT

- `src/components/contacts/components/OTPInput.tsx`

### diagnostic:ARIA_INCOMPLETE_PATTERN

- `src/components/dms/ReactionsDialog.tsx`

### diagnostic:A11Y_MISSING_ACCESSIBLE_NAME

- `src/view/com/util/UserAvatar.tsx`

## Reproduce

The corpus runner fetches and verifies https://github.com/bluesky-social/social-app at commit `007c893de107c2ecbf2188d618196075f19c8f5a`. From a Hozo checkout with dependencies installed, run:

`pnpm measure:bluesky`
