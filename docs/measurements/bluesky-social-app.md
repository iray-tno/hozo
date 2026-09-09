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
3. **RNW cannot yet be removed:** 46 files retain 52 direct React Native JSX bindings after Web lowering.
4. **The app is not className-shaped:** 430 files use ALF atoms while only 8 use `className`. Inline-style compatibility is therefore the first migration constraint, not Tailwind coverage.

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
| filesWithStyleProp | 651 |
| filesWithStyleSheetCreate | 46 |
| filesUsingAlfAtoms | 430 |

Only direct imports from `react-native` are counted as direct React Native JSX. Custom ALF components remain foreign by design; treating every component named `Text` or `Button` as a React Native primitive would create false transformations.

## Lowering outcome

| Outcome | Count |
|---|---:|
| filesLowered | 573 |
| filesLoweredForWeb | 567 |
| filesLoweredForNative | 543 |
| webComponents | 1220 |
| nativeComponents | 1175 |
| directReactNativeJsxPassedThroughOnWeb | 1 |
| filesWithDirectReactNativeJsxResidueOnWeb | 46 |
| directReactNativeJsxBindingsResidueOnWeb | 52 |
| sharedBackendShapeMismatches | 0 |
| parseOrCompileFailures | 0 |

Platform suffixes are respected: Web-only files run through Web lowering, iOS/Android/Native files through Native lowering, and shared files through both.

## Diagnostics

| | Count |
|---|---:|
| Files with errors | 0 |
| Files with warnings | 28 |
| ARIA_NAME_PROHIBITED | 40 |
| A11Y_INTERACTIVE_WITHOUT_ROLE | 31 |
| A11Y_INTERACTIVE_NESTING | 4 |
| A11Y_PRESS_WITHOUT_KEYBOARD | 3 |
| A11Y_MISSING_ACCESSIBLE_NAME | 2 |
| ARIA_INCOMPLETE_PATTERN | 2 |
| ROLE_HAS_NO_WEB_EQUIVALENT | 1 |
| UNSAFE_PROP_SPREAD_AFTER_STYLE | 1 |

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
| View | 34 |
| TouchableOpacity | 5 |
| TouchableWithoutFeedback | 3 |
| FlatList | 2 |
| Modal | 2 |
| RefreshControl | 2 |
| ScrollView | 2 |
| Animated | 1 |
| Pressable | 1 |

## Wrong-output boundary

| Confirmed invariant violation | Count |
|---|---:|
| Files whose lowered DOM contains `style={[...]}` | 0 |
| Invalid DOM style-array occurrences | 0 |

A lowered DOM element with style={[...]} is confirmed wrong output: React DOM requires one style object. Other suspicious samples still require source/output review.

This is a lower bound, not a complete wrong-output count. An automatic compiler run can prove this structural violation, but absence of it does not prove rendered behavior is correct. The remaining samples below are the deterministic queue for manual review and follow-up fixtures.

## Review samples

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

### directReactNativeJsxResidueOnWeb

- `src/Splash.tsx: View`
- `src/components/DebugFieldDisplay.tsx: TouchableWithoutFeedback`
- `src/components/Dialog/index.tsx: ScrollView`
- `src/components/Dialog/index.web.tsx: FlatList, View`
- `src/components/Dialog/shared.tsx: View`
- `src/components/InterestTabs.tsx: View`
- `src/components/Lightbox/chrome/ImageMenu.tsx: Modal`
- `src/components/Lightbox/pager/ImagePager.tsx: View`
- `src/components/Post/Embed/VideoEmbed/index.web.tsx: View`
- `src/components/ProgressGuide/FollowDialog.tsx: View`
- `src/components/ProgressGuide/List.tsx: View`
- `src/components/Tooltip/index.tsx: View`

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

### directReactNativeJsxPassedThroughOnWeb

- `src/view/com/util/List.tsx: RefreshControl`

### diagnostic:A11Y_MISSING_ACCESSIBLE_NAME

- `src/view/com/util/UserAvatar.tsx`

## Reproduce

The corpus runner fetches and verifies https://github.com/bluesky-social/social-app at commit `007c893de107c2ecbf2188d618196075f19c8f5a`. From a Hozo checkout with dependencies installed, run:

`pnpm measure:bluesky`
