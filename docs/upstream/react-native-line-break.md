# Line breaking on React Native: what Hozo does, and the React Native PR that would finish it

Status: **design, not filed.** This is the change Hozo would propose to React Native, written down so it is not rediscovered. Nothing here changes Hozo's own behaviour.

## What already happens, and what Hozo does about it

Tailwind and CSS say where lines may break with four properties: `line-break`, `word-break`, `overflow-wrap` and `text-wrap`. On the Web, Hozo emits them as written. On React Native, each lands somewhere different.

| Authored | Web | React Native today | Hozo on Native |
|---|---|---|---|
| (nothing) | The browser's default line breaking, which keeps `。`, `、` and `」` off the start of a line | **The same.** Android's line breaker follows Unicode line breaking (UAX #14) with its CJK rules, and iOS's CoreText applies kinsoku itself | nothing to do |
| `text-balance` / `text-pretty` | `text-wrap` | Android `textBreakStrategy` (`balanced` / `highQuality`) | lowered on a `Text` (#785) |
| `break-keep` (`word-break: keep-all`) | CJK runs kept whole | iOS `lineBreakStrategyIOS="hangul-word"` keeps **Korean** words whole. No Android control | lowered for iOS, and warned for Chinese, Japanese and Android |
| `[line-break:strict]` / `loose` / `anywhere` | `line-break` | **No control.** Android 13 has one (below); iOS has none | warning |
| `[word-break:auto-phrase]` | phrase-based breaking (Chrome 119+) | **No control.** Android 13 has one (below) | warning |
| `wrap-anywhere`, `break-all` | `overflow-wrap`, `word-break` | no control | warning |

So the honest gap is narrow. Ordinary kinsoku works on every platform without Hozo. What is missing on Native is the **choice of rule set** (strict or loose) and **breaking by phrase**, and both exist in Android's text stack. React Native does not expose them.

## What the platforms offer

**Android 13 (API 33):** [`LineBreakConfig`](https://developer.android.com/reference/android/graphics/text/LineBreakConfig), set on a `StaticLayout.Builder` or a `TextView`. It has two settings:
- **`lineBreakStyle`:** `LINE_BREAK_STYLE_NONE | LOOSE | NORMAL | STRICT`, which is CSS `line-break`.
- **`lineBreakWordStyle`:** `LINE_BREAK_WORD_STYLE_NONE | PHRASE`. `PHRASE` breaks Japanese at phrase (文節) boundaries, which is CSS `word-break: auto-phrase`.

Android 15 adds `LINE_BREAK_STYLE_UNSPECIFIED` and auto settings, but nothing below depends on them.

**iOS:** `NSParagraphStyle.lineBreakStrategy` (`standard`, `pushOut`, `hangulWordPriority`). React Native already exposes it as `lineBreakStrategyIOS`. There is no strict/loose rule choice and no phrase breaking, so the proposal is Android only, as `android_hyphenationFrequency` is.

## Why not a native module

React Native measures and draws text inside its own pipeline. On Android, `TextLayoutManager.kt` builds the `StaticLayout` that both measures the paragraph for Yoga and is drawn. A third-party module cannot reach that builder, so it would have two choices:
- reimplement `Text` (measurement, spans, nesting, accessibility);
- change only the drawn `TextView`, which would then disagree with the height Yoga measured.

The change belongs in React Native, or in a `patch-package` an application owns.

## The proposed React Native change

Two Android-only props on `Text`, plumbed exactly the way `android_hyphenationFrequency` is today. That makes the review mostly pattern-matching against an existing prop.

```ts
// Libraries/Text/TextProps.js, TextPropsAndroid
lineBreakStyleAndroid?: ?('none' | 'loose' | 'normal' | 'strict'),
lineBreakWordStyleAndroid?: ?('none' | 'phrase'),
```

Both are **paragraph attributes**, not span attributes: `LineBreakConfig` applies to the whole layout, as `hyphenationFrequency` does.

### Files, mirroring `android_hyphenationFrequency` (React Native 0.87.1)

**JS and types**
- `Libraries/Text/TextProps.js`, `Libraries/Text/Text.d.ts`: the two props, documented as API 33+ and ignored below it.
- `Libraries/Text/TextNativeComponent.js`: add both to `validAttributes`.

**Fabric (C++)**
- `ReactCommon/react/renderer/attributedstring/primitives.h`: `enum class LineBreakStyle { None, Loose, Normal, Strict }` and `enum class LineBreakWordStyle { None, Phrase }`.
- `ParagraphAttributes.h` / `.cpp`: two `std::optional` fields, added to `operator==`, the hash, and `getDebugProps`.
- `conversions.h`:
  - `fromRawValue` and `toString` for both enums, following `HyphenationFrequency` (around line 965).
  - `convertRawProp` in the paragraph-attributes conversion (around line 1062).
  - A MapBuffer key each, beside `PA_KEY_HYPHENATION_FREQUENCY` (around line 1169), so the value reaches Kotlin.
- `components/text/BaseParagraphProps.cpp`: the `RAW_SET_PROP_SWITCH_CASE` entries next to `android_hyphenationFrequency` (around line 117).

**Android (Kotlin and Java)**
- `views/text/TextLayoutManager.kt`:
  - Read the two keys from the paragraph-attributes MapBuffer.
  - Where the `StaticLayout.Builder` is configured (`.setHyphenationFrequency(...)`, around line 854), add the line-break config behind an API 33 check:

    ```kotlin
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      builder.setLineBreakConfig(
        LineBreakConfig.Builder()
          .setLineBreakStyle(lineBreakStyle)
          .setLineBreakWordStyle(lineBreakWordStyle)
          .build())
    }
    ```
  - **Check the `BoringLayout` fast path.** It skips `StaticLayout` for single-line text that fits. That is correct as long as the single-line decision is unaffected, but a reviewer will ask.
- `views/text/ReactTextViewManager.kt` and `ReactTextView.java`: the legacy-architecture `@ReactProp` setters, calling `TextView.setLineBreakStyle` / `setLineBreakWordStyle` on API 33+, as `setAndroidHyphenationFrequency` does (around line 307).
- `views/text/TextAttributeProps.kt`: parse helpers like `getHyphenationFrequency`.

**Text input:** `TextInput` reaches the same props through `BaseTextInputProps.cpp` / `AndroidTextInputProps.cpp` for `hyphenationFrequency`. Leave it out of the first PR and say so. It keeps the change reviewable, and input fields rarely want strict kinsoku.

### Verification the PR should carry
- **rn-tester:** a Text example showing a Japanese paragraph under `none` / `strict` / `loose`, and `phrase`, at a width where they break differently. A screenshot from an API 33+ emulator, and one from API 31 showing the props ignored.
- **Measurement agrees with drawing:** a paragraph whose line count changes under `phrase` must get the matching height. This is the bug class the native-module route cannot avoid, and it is the main thing to demonstrate.
- **C++:** a unit test for the conversions (parsing and `toString` round-trip), as `HyphenationFrequency` has.

### How Hozo would use it

- `[line-break:strict|loose|normal]` lowers to `lineBreakStyleAndroid`, and `[word-break:auto-phrase]` to `lineBreakWordStyleAndroid="phrase"`. This goes in `crates/hozo_native/src/text.rs`, next to `text_break_strategy`, and only on a `Text` with an unconditional declaration, the same limits #785 set.
- The warnings in `render.rs` would then narrow to iOS, and to Android below 13.
- Hozo should only emit these props for a React Native that has them. An unknown prop on `Text` is ignored rather than rejected, so emitting them early is harmless. Even so, the compiler has no React Native version gate today, so the choice is between adding one and raising Hozo's minimum React Native when this lands.

### Open questions for the React Native maintainers
- **Naming:** `lineBreakStyleAndroid` matches `lineBreakStrategyIOS`. `android_lineBreakStyle` matches `android_hyphenationFrequency`. React Native uses both conventions.
- **Combined prop:** whether a single `lineBreakConfigAndroid={{ style, wordStyle }}` object prop is preferred over two scalar props. Two scalars match every existing text prop, which is the argument for them.
