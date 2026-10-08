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

The Slice 4 source-usage foundation adds an opt-in compiler-owned ESM symbol census, **not actual rewrite dispositions yet**. All 1,660 files complete it: 1,300 direct RN import bindings include 406 explicit type imports, one value import used only as a type, and zero unused value imports. There are 5,442 authored runtime reference occurrences, 720 type references and two direct runtime reexport edges. Reference counts include opening/closing JSX tags, not component/call counts; member reads, component values and exports remain separate in JSON. Aliases and lexical shadowing are resolved rather than matched by spelling. Existing component, residue and diagnostic counts are unchanged. CommonJS, dynamic import, TS import-equals and indirect wrapper/data-flow usage remain outside this ESM inventory; zero dynamic-member references here is not proof those other forms are absent.

The final serial observation on two logical CPU cores took **8.89s**: 0.25s discovery, 0.09s Git provenance, 0.21s authored snapshot reads, 3.81s project preparation, 0.93s bindings, **1.00s added RN usage analysis**, 1.62s Web lowering and 0.82s Web residue parsing. The first observation of this slice took 27.47s with 18.51s reads and 1.02s usage analysis. The prior grammar follow-up took 26.41s, including 18.71s source reads; another observation took 7.89s with 0.06s reads, and the earlier Slice 3 run took 44.60s including 35.05s reads. These are **not a controlled performance comparison**. Node 25.9.0, Tailwind 4.3.3 and JSONC parser 3.3.1 were used with a freshly rebuilt development binding. Full input hashes, eligibility, unresolved facts and stage observations remain reproducible in JSON.

Slice 1's corrections are retained: previously omitted setup warnings stay visible, and rewritten Hozo Pressable imports are not mislabeled as direct React Native residue. This slice adds analysis scope/context, not new component compatibility.

## Authored surface

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
| Loaded binding SHA-256 | 7b068bb559acfd57724e145d4cab86bcb1ca29fd17f5dcfd6b3e233ea7b4aaab |
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
