# Real-app measurement: Bluesky social-app

This is a read-only compiler measurement, not a claim that the application can be migrated without changes. The audited checkout is not modified.

## Corpus

| | |
|---|---|
| Repository | https://github.com/bluesky-social/social-app |
| Commit | `007c893de107c2ecbf2188d618196075f19c8f5a` |
| Source | `src/**/*.tsx` |
| Files | 1,050 |
| Source bytes | 5,224,642 |
| Shared / Web / Native | 973 / 62 / 15 |

## Findings

1. **The corpus parses cleanly:** 0 parse or compile failures across 1,050 TSX files.
2. **The DOM style-array invariant holds:** Web lowering emitted no React Native style arrays into DOM style props.
3. **The direct RN JSX boundary is closed:** Web lowering retains no JSX bindings imported from React Native. Non-JSX React Native APIs and third-party native libraries remain separate migration boundaries.
4. **Styling surface:** 8 of 1050 files use `className` and 651 use `style`.

The separate [production dependency-graph measurement](./bluesky-rnw-free-build.md) remains a historical build experiment over the same pinned corpus. This static audit does not rerun that production build or certify runtime behavior.

This Slice 2 snapshot uses the same 1,050-file authored fingerprint as Slice 1. Headline counts are unchanged: 1,193 Web components, 1,149 Native components, 573 lowered files, 200 warnings, and zero parse/compile failures, direct RN JSX residue or invalid DOM style arrays. Conventional CSS discovery found no entry; CSS is now recorded as absent rather than unassessed. Auto preflight is true using the shared conservative token scan over selected authored TSX. That is an explicit compiler assumption, not evidence that Bluesky's production Web build ships a reset. Fonts, aliases and cross-file StyleX remain unresolved.

The final serial run on two logical CPU cores took 5.98s, including 2.79s of project preparation (candidate scanning included), with a freshly rebuilt development binding. These are stage observations, not a controlled performance comparison. Complete JSON evidence is emitted by the reproduction command below.

Slice 1 already exposed 117 previously omitted RN_COMPAT_NOT_INSTALLED setup warnings and removed 18 false-positive JSX residues whose Pressable imports had moved to Hozo. Those corrections are retained; this slice does not claim new component support from unchanged counts. The historical pre-analysis snapshot predates this compiler and its component-count differences must not be attributed to audit alone.

## Authored surface

| Signal | Files or bindings |
|---|---:|
| filesImportingReactNative | 605 |
| filesWithDirectReactNativeJsx | 573 |
| directReactNativeJsxBindings | 696 |
| filesWithAliasedDirectReactNativeJsx | 13 |
| aliasedDirectReactNativeJsxBindings | 15 |
| filesWithForeignPrimitiveNames | 538 |
| filesWithClassName | 8 |
| filesWithBareFlexClassName | 0 |
| filesWithStyleProp | 651 |
| filesWithStyleSheetCreate | 46 |

Only direct imports from `react-native` are counted as direct React Native JSX. Application-specific components remain foreign by design; treating every component named `Text` or `Button` as a React Native primitive would create false transformations.

## Corpus-specific signals

These are heuristics supplied by the corpus runner, not general migration guarantees.

| Signal | Files |
|---|---:|
| filesUsingAlfAtoms | 430 |


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

Web uses the shared module lowering path in memory. Native is a compiler-only component/Canvas probe, not full Metro preparation. Neither certifies production builds or runtime behavior. Static CSS/theme is prepared once; executable configuration is refused. Fonts, aliases and cross-file StyleX are not assessed yet. Only authored TSX files enter the denominator; no dependency source modules are loaded.

## Project context

| Fact | Status | Value or reason |
|---|---|---|
| css | absent | "No conventional CSS entry found." |
| theme | defaulted | "builtin" |
| preflight | defaulted | true |
| fonts | unresolved | "Static font registration is not supplied; CSS font faces alone do not prove Native availability." |
| aliases | unresolved | "Project import aliases are not assessed yet." |
| stylexGraph | unresolved | "Cross-file StyleX context is not assessed yet." |

Effective compiler assumptions: theme=builtin, preflight=true. Partial context uses builtin tokens only as a probe, not an assessment of the project's theme. Auto preflight uses the compiler's Tailwind facts for selected authored files; it is not discovery of the app's actual bundler settings or reset stylesheet. CSS inputs and content hashes are retained separately in JSON.

"Lowered" counts files the compiler produced components for. It does not mean migrated, and it is not a measure of progress.

A tag is lowered only when its binding was imported from a module Hozo recognises: `@hozo/core`, the other `@hozo/*` packages, or `react-native`. A file importing none of them is carried verbatim and lowers nothing, however much `className` it contains. So a report whose authored surface shows none of those imports and whose lowering count is above zero is describing two things that cannot both be true — read the counts as suspect rather than as a result.

## Diagnostics

| | Count |
|---|---:|
| Files with errors | 0 |
| Files with warnings | 135 |
| RN_COMPAT_NOT_INSTALLED | 117 |
| ARIA_NAME_PROHIBITED | 40 |
| A11Y_INTERACTIVE_WITHOUT_ROLE | 30 |
| A11Y_INTERACTIVE_NESTING | 4 |
| A11Y_PRESS_WITHOUT_KEYBOARD | 3 |
| A11Y_MISSING_ACCESSIBLE_NAME | 2 |
| ARIA_INCOMPLETE_PATTERN | 2 |
| ROLE_HAS_NO_WEB_EQUIVALENT | 1 |
| UNSAFE_PROP_SPREAD_AFTER_STYLE | 1 |

200 complete finding records are available in JSON. Use --details to expand Markdown findings.

## Analysis provenance

| | |
|---|---|
| Audit / compiler versions | 0.2.0 / 0.2.0 |
| Theme loader / Tailwind / CSS parser | 0.2.0 / 4.3.3 / 8.5.26 |
| Loaded binding SHA-256 | 8372b25b1f93ca4eeed34487bde87fa725b0e6f836f88afb537814a16f983aca |
| Authored source SHA-256 | 1597ac133ed3a9b765d58c7fbd3466e695f0c2941b4945e75afeef05aeb51c2a |
| Checkout dirty | false |

Binding identity, per-file outcomes, stage timings and unresolved project facts are retained in JSON. Diagnostic positions use UTF-16 code units; rewritten positions without a source map are explicitly unmapped.


## Most common React Native imports

| Import | Files |
|---|---:|
| View | 553 |
| Pressable | 76 |
| StyleSheet | 51 |
| Keyboard | 23 |
| useWindowDimensions | 20 |
| ScrollView | 18 |
| ActivityIndicator | 16 |
| LayoutAnimation | 16 |
| Platform | 13 |
| Text | 13 |
| TextInput | 9 |
| AppState | 6 |
| Dimensions | 5 |
| Linking | 5 |
| TouchableOpacity | 5 |

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
- `src/analytics/index.tsx`
- `src/components/ContextMenu/index.tsx`
- `src/components/DebugFieldDisplay.tsx`
- `src/components/Dialog/index.tsx`
- `src/components/FocusScope/index.tsx`
- `src/components/Layout/Header/index.tsx`
- `src/components/Lightbox/Lightbox.web.tsx`
- `src/components/Lightbox/chrome/CircleChromeButton.tsx`
- `src/components/Lightbox/chrome/CircleChromeButton.web.tsx`
- `src/components/Lightbox/chrome/Footer.tsx`

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
