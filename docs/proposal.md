# Hozo — 企画書

«A Rust-powered universal UI compiler and accessibility-first layer for React Native.»

---

## 1. 概要

Hozo は、React Native によるクロスプラットフォーム UI 開発を、Rust 製コンパイラによって Web / Native それぞれに適した形へ変換・最適化するための基盤である。

新規プロジェクトでは `@hozo/core` を使うことで、React Native / Web / Tailwind / accessibility を個別に組み合わせることなく、最初から統合された開発環境を利用できる。

一方、既存の React Native / React Native for Web プロジェクトに対しては、`@hozo/compiler` を追加することで、既存コードを大きく書き換えることなく段階的に Hozo の最適化を導入できる。

Hozo は新しいフルスタック UI フレームワークを作ることを目的としない。

目指すのは、

«既存の React Native ecosystem を尊重しながら、その下に高速で薄い compilation layer を提供すること»

である。

命名の由来: 日本の木工における「ほぞ継ぎ」。異なる部材を精密に組み合わせ、一つの構造にする技法。

---

## 2. 基本思想

Hozo の設計は、以下の4原則を中心に置く。

### 2.1 Existing source first

既存プロジェクトに Hozo 専用 API への全面移行を要求しない。

React Native のコードは、そのまま Hozo compiler の入力として利用できる。

```tsx
import { View, Text } from 'react-native'

export function Card() {
  return (
    <View className="rounded-xl p-4">
      <Text className="font-bold">
        Hello
      </Text>
    </View>
  )
}
```

Hozo compiler はこのコードを解析し、安全に変換できる部分だけを最適化する。

---

### 2.2 Golden path for new projects

既存コードを尊重する一方、新規プロジェクトではセットアップの複雑さそのものを減らしたい。

そのため `@hozo/core` を公式の推奨 entry point とする。

```tsx
import { View, Text, Paragraph, Heading, Section, Button } from '@hozo/core'
```

`@hozo/core` は巨大な UI framework ではなく、

- View
- Text
- Paragraph（Webの `p` / Nativeの `Text`）
- Heading（Webの `h1`〜`h6` / Nativeのheader role付き`Text`）
- Section（Webの `section` / Nativeの `View`）
- Article（Webの `article` / Nativeのarticle role付き`View`）
- Nav（Webの `nav` / Nativeのnavigation role付き`View`）
- List / ListItem（Webの `ul`・`ol`・`li` / Nativeのlist semantics）
- Pressable
- Button
- Link

などの canonical primitives と semantic primitives を提供する薄いレイヤーである。

新規プロジェクトでは、

```
npm create hozo@latest
```

から、

```
npm run web
npm run ios
npm run android
```

までを最短距離で成立させることを目標とする。

Hozo Core の役割は、Hozo 利用を必須化することではなく、

«最も設定が少なく、最も最適化しやすく、最も accessibility が保証される経路»

を提供することである。

---

### 2.3 Compile what you can, fall back gracefully

Hozo は100%の静的変換を前提としない。

コンパイラが安全に理解できる部分はビルド時に変換し、理解できない部分は既存 runtime に委譲する。

```
                  React Native source
                         │
                         ▼
                  Hozo analysis
                         │
                ┌────────┴────────┐
                │                 │
           understood         unsupported
                │                 │
             lowering          fallback
                │                 │
                └────────┬────────┘
                         │
                      runtime
```

fallback は失敗ではなく、Hozo の正式な設計要素とする。

Hozo の成熟に従って、静的に扱える coverage を徐々に増やしていく。

---

### 2.4 Accessibility is not optional

Accessibility は追加機能ではなく、Hozo の基本仕様とする。

v1 から、

- semantic HTML
- React Native accessibility props
- compile-time diagnostics
- keyboard interaction
- focus management

を設計対象に含める。

Hozo において accessibility を「後から付ける」状態は作らない。

---

## 3. なぜ Hozo が必要か

### 3.1 React Native for Web のセットアップは強力だが複数レイヤーに分かれている

React Native で Web / iOS / Android を共通化する場合、実際には複数のツールを組み合わせる必要がある。

例えば、

```
React Native
+
React Native for Web
+
styling solution
+
Tailwind integration
+
Metro / Babel configuration
+
Web bundler integration
+
accessibility implementation
```

といった構成になる。

個々のツールは優れているが、新規プロジェクトを作るたびに統合方法を理解・設定する必要がある。

Hozo Core はこの組み合わせを一つの推奨構成として提供する。

---

### 3.2 静的に分かる情報まで runtime に残ることがある

React / React Native のクロスプラットフォーム stack では、

- style resolution
- conditional styles
- platform differences
- semantic mapping
- component wrappers

などが runtime で処理される場合がある。

Hozo は source code 全体を compiler から見ることで、

«本当に runtime で必要な処理だけを runtime に残す»

ことを目指す。

設計原則は、

«Pay runtime cost only for what is genuinely dynamic.»

とする。

---

### 3.3 Web と Native は同じではない

Web を React Native の単純なエミュレーションとして扱わない。

同じ source component から、

```
                  Hozo IR
                 /        \
                /          \
              Web          Native
               │              │
        DOM / CSS / ARIA   React Native
                           primitives
```

へ platform-specific lowering を行う。

Web では Web の semantic primitive を優先する。

Native では React Native / Fabric の ecosystem をそのまま利用する。

---

## 4. アーキテクチャ

```
                       Application
                           │
             ┌─────────────┴─────────────┐
             │                           │
        @hozo/core                Existing RN code
        recommended                     │
             │                          │
             └─────────────┬────────────┘
                           │
                           ▼
                    Hozo Compiler
                      Rust core
                           │
             ┌─────────────┼─────────────┐
             │             │             │
          Style IR    Semantic IR    Diagnostics
             │             │             │
             └─────────────┼─────────────┘
                           │
                       Hozo IR
                           │
             ┌─────────────┴─────────────┐
             │                           │
         Web backend                Native backend
             │                           │
        DOM + CSS                  React Native
        semantic HTML              View / Text
        ARIA                       StyleSheet
             │                     accessibility props
             │
         fallback
             │
             RNW
```

---

## 5. Hozo Core

`@hozo/core` は、新規 Hozo project の canonical API を提供する。

初期 primitive は、

```
View
Text
Image
Pressable
Button
Link
```

程度に限定する。

例えば、

```tsx
import { View, Text, Button } from '@hozo/core'

export function Login() {
  return (
    <View className="flex-1 items-center justify-center p-6">
      <Text className="text-xl font-bold">
        Welcome
      </Text>

      <Button className="mt-4 px-4 py-2">
        Continue
      </Button>
    </View>
  )
}
```

Web では可能な限り、

```html
<div>
  <span>Welcome</span>
  <button>Continue</button>
</div>
```

へ直接 lowering する。

Native では、

```
View
Text
Pressable
```

等へ lowering する。

Hozo Core は runtime abstraction を増やすためではなく、

«compiler が意味を最も正確に理解できる canonical source»

を提供するために存在する。

---

## 6. Styling

### 6.1 Tailwind first

Hozo v1 における公式 styling API は Tailwind とする。

独自 CSS DSL は作らない。

```tsx
<View className="flex flex-col gap-4 p-6 md:flex-row">
```

という既に広く知られた記述方法をそのまま利用する。

---

### 6.2 Tailwind は frontend、Hozo IR は内部表現

Hozo 内部を Tailwind 固有構造に固定しない。

```
Tailwind
   │
   ▼
CSS / utility semantics
   │
   ▼
Hozo Style IR
   │
   ▼
platform lowering
```

Hozo Style IR は例えば、

```
Display(Flex)
FlexDirection(Row)
Padding(...)
Gap(...)
BackgroundColor(...)
FontSize(...)
Media(...)
Hover(...)
Focus(...)
Disabled(...)
```

などの platform-independent な情報を保持する。

---

### 6.3 Universal Style Subset

Web / Native の双方で意味を保ったまま利用できる styling 領域を内部的に定義する。

初期対象:

**Layout**

- flex
- direction
- align / justify
- gap
- margin / padding
- width / height
- absolute positioning

**Visual**

- background
- color
- opacity
- border
- border-radius

**Typography**

- font-size
- font-weight
- line-height
- text-align

**Conditions**

- responsive
- hover
- focus
- pressed
- disabled
- platform variants

これはユーザー向けの新しい言語ではない。

Tailwind class を platform capabilities に変換するための内部モデルである。

---

## 7. 動的 className

Hozo は dynamic className を一律 runtime 扱いにはしない。

例えば、

```tsx
<View
  className={cn(
    'p-4',
    active && 'bg-blue-500',
    size === 'lg' && 'text-xl'
  )}
/>
```

について、`active` や `size` の値をコンパイル時に知る必要はない。

式の構造を保持したまま、

```
p-4

active
  → bg-blue-500

size === lg
  → text-xl
```

という conditional style expression に lowering する。

一方、

```tsx
<View className={classNameFromProps} />
```

のように compiler が意味を特定できない場合は、小さな runtime path へ fallback する。

したがって、

```
Static styles
    → compile away

Structurally dynamic styles
    → compile conditional expression

Truly dynamic styles
    → runtime fallback
```

という3段階を基本とする。

---

## 8. Web lowering

Hozo は Web において、React Native primitive を可能な範囲で直接 DOM へ lowering する。

例えば、

```tsx
<View className="p-4">
```

を、

```html
<div class="...">
```

へ変換する。

ただし React Native primitive の semantics が複雑な場合は、無理に lowering しない。

例えば responder system や特殊な interaction behavior が必要な component は、RNW fallback を利用できる。

---

### 8.1 React Native semantics

React Native View には Web の `div` とは異なる default behavior がある。

Hozo は例えば、

```
display: flex
flex-direction: column
flex-shrink: 0
position: relative
min-width: 0
box-sizing: border-box
```

といった View semantics を Hozo IR 内で定義する。

Web lowering 時には shared base style として適用する。

```html
<div class="hozo-view p-4">
```

のように共通ルールとして出力し、重複を避ける。

---

## 9. Native lowering

Native target では React Native ecosystem をそのまま利用する。

Hozo は、

```
Hozo IR
   ↓
React Native primitive
   ↓
Fabric
```

という位置に留まる。

独自 renderer や Fabric の置き換えは行わない。

これにより、

- Expo
- native modules
- React Native libraries
- platform integrations

との互換性を保つ。

---

## 10. Accessibility

Accessibility は v1 から Hozo Core / Compiler / Runtime のすべてに関係する。

### 10.1 Semantic lowering

例えば、

```tsx
<Button disabled={disabled}>
  Save
</Button>
```

を Web では、

```html
<button disabled>
  Save
</button>
```

へ lowering する。

Native では、

```tsx
<Pressable
  disabled={disabled}
  accessibilityRole="button"
  accessibilityState={{ disabled }}
>
```

相当へ lowering する。

原則は、

«Prefer platform semantics over compatibility emulation.»

とする。

---

### 10.2 Compile-time diagnostics

Hozo compiler は accessibility の問題を build 時に検出する。

例えば、

```tsx
<Pressable onPress={save}>
  Save
</Pressable>
```

に対して、

```
warning[HOZO_A11Y_001]

Interactive Pressable has no accessible role.

Consider:
  accessibilityRole="button"
```

のような diagnostic を出せる。

対象候補:

- interactive element without role
- image without accessible label
- form control without label
- invalid semantic nesting
- inaccessible disabled state
- keyboard-inaccessible Web interaction

---

### 10.3 Runtime accessibility

すべての accessibility 問題を compiler で解決しようとはしない。

以下のような behavior は runtime が担当する。

- focus trap
- focus restoration
- keyboard navigation
- roving tabindex
- Escape handling
- live region timing
- virtual focus

v1 では特に Dialog を最初の高難度 primitive として実装する。

Dialog は、

- initial focus
- focus trap
- focus restoration
- Escape
- modal semantics
- background inert
- screen reader behavior

まで含めて品質基準を定める。

---

## 11. パッケージ構成

```
@hozo/core
    recommended primitives
    semantic components

@hozo/compiler
    Rust compiler
    TSX analysis
    Hozo IR
    Web / Native lowering
    diagnostics

@hozo/runtime
    truly dynamic styles
    interactive behavior
    accessibility behavior

@hozo/tailwind
    Tailwind integration

@hozo/a11y
    complex accessibility primitives
    Dialog etc.
```

将来的に、

```
@hozo/nativewind-compat
@hozo/tamagui-compat
```

のような compatibility layer を追加できる構造にする。

---

## 12. 既存エコシステムとの関係

**React Native**

Native target の基盤として利用する。

既存 React Native project は Hozo Core へ移行せずとも compiler の恩恵を受けられることを目標とする。

---

**React Native for Web**

Web backend における fallback implementation として利用できる。

Hozo が安全に直接 lowering できる領域が増えるほど、application-owned component tree における RNW dependency を減らしていく。

v1 では RNW 完全排除を成功条件にはしない。

---

**NativeWind**

Tailwind を React Native で利用するという developer experience を共有する。

既存 NativeWind project から段階的に Hozo を利用できる compatibility path を検討する。

ただし Hozo Core 自体は NativeWind の bug-for-bug compatibility を仕様とはしない。

---

**Tamagui**

Tamagui ecosystem には豊富な component / styling assets が存在する。

長期的には Tamagui-compatible source を Hozo IR へ変換できる compatibility layer を研究する。

```
Tamagui-compatible source
          │
       understood?
        /       \
      yes        no
       │          │
 Hozo lowering  Tamagui fallback
```

完全互換を最初から要求するのではなく、compiler coverage を段階的に増やす。

---

## 13. ロードマップ

### Phase 0 — Vertical prototype

最初から巨大な framework を作らない。

最小の縦切りを完成させる。

対象:

```
View
Text
Pressable
Button

Tailwind className

flex
spacing
color
typography

conditional className

Web lowering
Native lowering

basic a11y diagnostics
Button semantics
```

確認すること:

- Rust から TSX を十分高速に解析できるか
- Tailwind semantics を Style IR に落とせるか
- dynamic expression を構造のまま lowering できるか
- Web direct lowering と RNW fallback を混在できるか
- Native style output が成立するか
- semantic lowering が Web / Native の双方で成立するか

---

### Phase 1 — Hozo v1

**New project path**

```
npm create hozo@latest
```

から Web / iOS / Android をすぐ起動できる。

`@hozo/core` を利用する。

---

**Existing project path**

`@hozo/compiler` を既存 React Native project に追加できる。

source API は変更しなくてよい。

---

**Styling**

Tailwind first。

static / conditional / runtime fallback の3段階を実装する。

---

**Accessibility**

v1 から必須。

- semantic Button / Link
- compile-time diagnostics
- basic form semantics
- Dialog

を含める。

---

**Web**

安全な component を direct DOM lowering。

未対応 component は RNW fallback。

---

## 14. Phase 2 — Coverage expansion

実際の project で利用しながら、

- supported React Native APIs
- Tailwind utilities
- interaction states
- accessibility primitives
- Web direct lowering coverage

を拡大する。

---

## 15. Phase 3 — Compatibility

需要に応じて、

- NativeWind migration
- Tamagui compatibility
- StyleX を第二のフロントエンドとして読む
- Canvas 描画バックエンド（SVG は Phase 2 で入った）
- third-party component analysis

を進める。

### 描画 — SVG と Canvas を両方持つ

グラフ描画ライブラリの土台として、SVG と Canvas の**両方**を出せるように
する。ライブラリ作者が選ぶ — 単純なグラフは SVG、大規模データは Canvas。
SVG は Phase 2 で入った（`Primitive::Svg`）。Canvas はまだ無い。

Canvas 側の非対称は SVG と**逆向き**になる。

```
SVG     Web = 宣言的（要素）   Native = react-native-svg（宣言的）
Canvas  Web = 命令的（ctx）    Native = Skia（宣言的）
```

Skia の React API は `<Canvas><Rect/></Canvas>` なので、命令的なのは Web
だけ。Hozo が吸収するのは「宣言 → 描画命令列」で、これは典型的な
コンパイラの仕事になる。

**シーン記述は共有しない。** 二つの IR を持ち、それぞれのプラットフォーム
能力を取りこぼさずに出す。共通化しない理由は単純さではなく、**イベントと
ヒットテスト**にある。SVG は要素ごとにハンドラが付き、Canvas は当たり判定
を自分で書く。ここを隠した共通 IR は「SVG では動き Canvas では無反応な
チャート」を生み、チャートはツールチップと選択があってこそなので、それは
端ではなく中心の失敗になる。ほかに、共通 IR は両者の**共通部分**にしか
ならず（フィルタも合成モードも落ちる）、切り替え可能に見えて切り替えられ
ない場合をコンパイラが判定して言う必要も出る。

**アクセシビリティはシーンより上の層に置く。** 「宣言から読み上げ可能な
等価物を出す」は一見魅力的だが、チャートでは最善ではない — 棒や点の集まり
から表を起こすより、元の系列データから起こすほうが正確で、ライブラリ作者
はデータを持っている。共通 IR を推す最も強い論拠はここで消える。

共有するのは IR ではなく素材:

- **パス文字列。** SVG のパス構文は三箇所でそのまま通る（Web の `Path2D`、
  `react-native-svg`、Skia の `MakeFromSVGString`）。折れ線・面・円弧は
  ほぼこれ一本で書ける
- **テーマ解決。** `fill-blue-500` → 実際の色は `StyleProperty` 側にあり、
  既に共有されている
- **色と長さの型**
- **アクセシブルな等価物のヘルパー。** データを受け取る層として、
  SVG / Canvas のどちらからも使える

この形なら、両対応するライブラリは描画コードを二度書くが、データと
アクセシビリティは一度で済む。二度書く部分は本来プラットフォームが違う
ところなので、隠さないほうが正しい。

### StyleX について

**2026-08-29 更新:** 最初の縦切りと contextual Grid は実装済み。namespace import された
same-file・module-scope の `stylex.create` と、
`stylex.props(styles.base, condition && styles.active)` を直接 Hozo IR に読む。
静的 string/number の universal property は Web/Native の既存 lowering を通り、
公式 StyleX 0.19.0 の CSS 出力との差分テストも持つ。未対応式は消さず
`STYLEX_NOT_LOWERED` として公式コンパイラへ残す。

StyleX 自身が公開する `CSSProperties` と React Native 自身が公開する style key
を機械的に交差させる分母も conformance report に追加した。2026-09-04 時点では
全 CSS 名で 384/522 (73.6%)、両 platform に名前が存在するか、同じ typed IR へ
正確に展開できる集合で 134/134 (100%)、contextual runtime 集合で 17/17
(100%)、Web-only 集合で 233/370 (63.0%)。残りは optional adapter 候補 1、
未対応の Web-only 名と別集計する。
これは value や API
を含めた互換率ではなく property-name の上限値で、
代表値は公式 Babel plugin の CSS と個別に差分検証する。

property-name の分母・lane・mapped判定は生成済みの
`packages/tailwind-conformance/stylex-manifest.json` に固定する。通常のreportは
Rust sourceのmatch armをその場で数えずmanifestを読み、同期testだけがStyleX/RNの
型定義とfrontend lowering tableから再生成してdriftを検出する。各522項目には
Universal、Contextual、Adapter、Web-onlyのlaneと、mappedとして数える実装根拠を
持たせる。これを90%計画のproperty/value/construct/real-sourceの多軸scorecardの
基盤とする。

現在の実行可能scorecardでは、代表value 243/243 (100%)、一般的なauthoring
construct 16/16 (100%)、Card/Typography/Input/Scroll/Motion/Grid/Borderへ利用頻度を
持たせた宣言205/205 (100%)、silent failure 0となった。valueはHozo Webが公式
StyleX Babel CSSと一致し、かつNativeが忠実にlowerするかmanifest所定のWeb-only
refusalを返した場合だけcoveredとする。diagnostic付きresidualは安全性を満たすが
coverageには加点しない。このためproperty名がmappedでも一般値が通らないケースを
隠さない。

standalone `translate` / `rotate` / `scale` は Web-only 文字列にはせず typed IR とする。
Web は StyleX が書いた component 数を保ち、Native は CSS 規定の
translate→rotate→scale 順で transform array に合成する。px/% の1〜2軸 translate、
degree rotate、数値/% の1〜3軸 scale を portable subset とし、それより広い構文は
公式 StyleX の residual に残す。

`textShadow` は `none`、または明示色と px/zero の2 offset・任意 blur からなる
単一 layer を portable subset とする。Web は同じ `text-shadow` を出力し、Native は
`textShadowColor` / `textShadowOffset` / `textShadowRadius` へ分解する。複数 layer、
相対単位、動的値は近似せず公式 StyleX transform の residual に残す。

animation control longhandのうちcomposition、正負delay、direction、fill mode、
非負iteration count、play state、keyword / `cubic-bezier()` / `steps()` timing
functionはexact Web-onlyとして扱う。
Nativeでは任意CSS keyframesが動くように見せず、明示的なWeb-only diagnosticを返す。
module-scopeの静的な`stylex.keyframes`と、それを参照する`animationName`はtyped IRで
frame本体ごと保持し、content hash名でWeb stylesheetへ一度だけhoistする。export済み
sheet内の参照もproject module registryを越えて保持する。静的keyframe参照の
`firstThatWorks(...)`とvalue arrayも公式と同じfallback順で出力する。dynamic keyframes、
同時再生するanimation-name list、より広いeasing構文、timelineは公式StyleX側のresidualに残す。

Webのcompositing / 3D制御では、静的な`clipPath`、`perspective`、
`perspectiveOrigin`、`transformBox`、`transformStyle`、`willChange`を安全な
grammarでlowerし、Nativeでは明示的にrefuseする。`backdropFilter`は単なるWeb出力で
adapter 1/1と数えず、BlurView / Expo adapterを実装するまでadapter候補のまま残す。

mask系は`WebkitMaskImage`と標準`maskImage`、mode、repeat、position、size、origin、
clip、composite、typeのlonghandをexact Web-onlyとして扱う。通常のURL/gradient、
layered keyword、静的なlength/percentageのposition/sizeを対象にし、より広いimage
function、variable、`mask` shorthand、mask-borderは近似せず公式StyleXへ残す。

motion path / float shapeでは、`offsetAnchor`、`offsetDistance`、`offsetPath`、
`offsetPosition`、`offsetRotate`と、物理方向の`float`/`clear`、`shapeOutside`、
`shapeMargin`、`shapeImageThreshold`をexact Web-onlyとして扱う。安全なpath/ray/basic
shape、position、angle、lengthを対象にし、方向相対float、calc、新しいshape構文、
`offset` shorthandは公式StyleXのresidualに残す。

border imageでは、`borderImageSource`、`borderImageSlice`、`borderImageWidth`、
`borderImageOutset`、`borderImageRepeat`のlonghandをexact Web-onlyとして扱う。
通常のURL/gradient、`fill`、静的なnumber/length/percentage list、repeat keywordを
対象にし、`borderImage` shorthand、より広いimage function、calc、variableは
公式StyleXのresidualに残す。Nativeでは明示的にrefuseする。

implicit browser Gridでは、`gridAutoColumns`、`gridAutoRows`、`gridAutoFlow`、
`gridTemplateAreas`をexact Web-onlyとして扱う。静的なtrack size、dense flow、矩形の
named-area templateを対象にし、calcやrepeatを含むimplicit track、variable、非矩形の
area定義は公式StyleXのresidualに残す。Nativeでは明示的にrefuseする。

authoring constructでは、`stylex.props`の再帰arrayとternaryを条件式IRへ展開し、
module-localな`const` object literalのspreadもsource順にflattenする。対象objectは
spread以外へescapeせず、export・mutationされず、利用前に宣言されている場合に限る。
`let`、late declaration、関数callのspreadなどは公式StyleXへ残す。
同じtyped propertyへ一意に変換できる静的な`stylex.firstThatWorks(...)`も対象とする。
Webは公式実装と同じく候補を逆順のCSS宣言として出し、Nativeは自身で表現できる
最初の候補を選ぶ。dynamic、空、複数宣言化、property不一致の候補はresidualに残す。

Web-only の最初の 20 名は、appearance、color-scheme、image-rendering、
overflow/overscroll、print-color-adjust、resize、scroll snap、scrollbar、
text-rendering、touch-action の closed-keyword longhand である。共通 IR 上でも
`WebOnly` として universal property や任意 CSS から区別し、Web は公式 StyleX の
CSS と同じ宣言を出す。Native は spread を消費したうえで
`WEB_ONLY_PROPERTY_ON_NATIVE` を error にし、黙って drop しない。許可した keyword
集合外の値は対応済みと数えず、従来どおり公式 StyleX の residual に残す。
さらに実用corpusから word-break、overflow-wrap、visibility、background position/
repeat/size、object-position、justify-self、place-items、transition-delay、
animation-duration の保守的な静的値を追加した。これらもWebでは公式CSSと一致し、
Nativeでは近似せず明示的にrefuseする。

第2 slice の21名は、新しい任意CSS経路を増やさず既存 typed IR を再利用する。
整数 `order`、軸別 overflow、scroll behavior、物理/論理 scroll margin/padding
longhand、text indent が対象で、Web出力とNative refusalはTailwind frontendと共有する。
scroll shorthand は物理4辺と論理2軸の静的な長さを最終slotへ展開する。

contextual の実装済み 8 名は Grid の template/placement である。静的な正の
`fr`、非負の `px`、`minmax(px, fr)`、等幅 `repeat` track と、整数 line、
`auto`、等しい span、full span を既存 Grid IR に読み、Native では
`HozoGrid`/`HozoGridItem` solver を再利用する。それより広い CSS Grid value は
近似せず `STYLEX_NOT_LOWERED` として StyleX に残す。
加えて transition property/duration/timing の3名は既存のNative interaction・ambient
transition runtimeへ接続する。Nativeで忠実に補間できるproperty、整数ms、4種のeasing
だけをtyped IRへ入れ、それ以外は公式StyleXに残す。
contextual 3名の `container` / `containerName` / `containerType` も既存の
`HozoContainer` runtimeへ接続する。typeは `normal`、`size`、`inline-size`、nameは
単一の保守的なCSS identifierに限定し、複数nameなどruntimeが忠実に扱えない値は
公式StyleXのresidualに残す。加えて `whiteSpace` / `textOverflow` はTextの
`numberOfLines` / `ellipsizeMode`、`caretColor` はTextInputの`cursorColor`へlowerする。
これでcontextual property-name集合は17/17になった。

共存実測の結論は **Hozo → StyleX の順だけが安全**。StyleX を先にすると
spread が第二の `className` になり、Hozo は JSX の last-wins で本来消える
Tailwind class まで合成してしまう。Hozo を先にすると元の `create/props` 関係を
IR に取り込み spread を消せるため、後段 StyleX は未使用 definition を除去する。
この二つの失敗/成功形は公式 Babel plugin を実行する回帰テストに固定した。

cross-file static sheet はproject-wide registryへ一度登録し、named/star/namespace
re-export chainを解決する。Vite、Next、Metroは各bundler自身のalias resolver結果を
bindingとして渡し、Metroはplatform別に分離する。未対応memberは公式StyleXへ残す。
残る API 境界は、`createTheme`、keyframes、未対応nested selector/at-rule、
新しい `sx`/`atoms` API である。StyleX 0.19 の既定
`property-specificity` にある4段階の atomic priority は frontend 内で解決済み。
対応する shorthand を最終 property slot へ展開し、priority と引数順で整列してから
共通 IR へ渡すため、Web/Native runtime と IR に priority 機構は増やしていない。
条件付き shorthand に対して無条件の高 priority longhand が勝つ場合も、その slot
だけを除去して他の条件付き slot は残す。
Web-only の `columns`、`columnRule`、`listStyle` も同じ仕組みで最終longhandへ
展開する。省略された値はCSS shorthandのinitial値で埋めるため、部分的な
shorthand/longhand競合でもブラウザのcascadeを保てる。
物理4辺の `scrollMargin` / `scrollPadding` はCSSの1〜4値を各longhand slotへ
展開する。`scrollMarginBlock/Inline` と `scrollPaddingBlock/Inline` はCSSの1〜2値を
logical start/end slotへ展開する。論理axisと物理longhandの競合はdirection /
writing-mode依存なので近似せず残す。
`flexFlow` は direction/wrap、`gridGap` は row/column gap の最終slotへ展開し、
legacy alias の `gridRowGap` / `gridColumnGap` も同じ typed IR を使う。これらは
React Native に同名keyがなくても既存keyへ正確に変換できるため universal lane とする。
borderのaxis/edge longhand 19名も追加した。widthとcolorの9名は既存のlogical edge
IRへ展開し、styleの10名はWebで公式CSSを出しつつ、辺ごとのstyleを持てないNativeでは
明示的にrefuseする。StyleX 0.19のproperty-specificity mode自身が拒否する
`border` / `borderTop` 等のcompound shorthandは、型に名前があってもmappedに数えない。

ただし logical/physical edge の衝突は Native の実行時 direction が必要であり、
Grid shorthand と個別 line の衝突は現在の Grid IR では分解できない。この二種類は
近似せず、引き続き `STYLEX_NOT_LOWERED` として公式 StyleX に残す。

同じ rule に対応済みと未対応の宣言が混ざる場合も、rule 全体を諦めない。対応済み
宣言は通常の typed IR に落とし、未対応 property の source span だけから inline の
`stylex.create` を再構成する。公式 Babel plugin は inline create を hoist できるため、
元の mixed definition は参照されなくなり、JSX には残余 StyleX class と Hozo class を
結合した一つの `className` だけが残る。条件付き `props()` 引数の guard も残余へ
コピーする。残余と lowering 側が同じ property family で競合する場合、object spread
や computed key で競合を判定できない場合は分割せず、従来どおり元の call を保つ。

§6.2 の「Tailwind はフロントエンド、Hozo IR は内部表現」がそのまま効く。
`stylex.create({ button: { padding: 16 } })` を IR に落とせば、Web と
Native の lowering は一行も変えずに使える。IR をフロントエンド非依存に
した理由がここにある。

反対する理由は原理ではなくコストで、それは分母の話。Hozo の確信は
「Tailwind 自身のエンジンと差分を取る」から来ている。StyleX 側も手書きの
対応表を分母にせず、公式 type declaration を読むようにしたため、依存更新で
分母が変われば snapshot が失敗する。22446 の variant と 23286 の utility と
3074 の合成の隣にもう一組を維持するコストは残るが、少なくとも未対応名が
報告から黙って消える形にはしない。

StyleX の atomic CSS は別の話で、StyleX を採らなくてもできる。今の
Hozo は要素ごとに完結したルールを書くので、同じクラスを持つ二つの
コンポーネントは同じ宣言を二度出す（`.hozo-view` のような primitive の
基底だけは共有される）。それが実際に効く規模かは**測っていない** —
先に重複率を測り、材料が出てから決める。順序を逆にすると、クラス名が
読めなくなる代償だけ先に払うことになる。

短期の問いは共存のほう。StyleX を使っているプロジェクトに Hozo を
足したとき、二つのコンパイラが同じ JSX を書き換える。順序と、
`UnsafePropSpreadAfterStyle` が見ているような相互作用が起きうる。
これは今日答えが出る質問で、フロントエンドを増やすかどうかとは独立
している。

---

## 16. Phase 4 — Advanced optimization

Hozo IR を利用して、

- static style extraction
- dead style elimination
- component flattening
- wrapper elimination
- constant folding
- token resolution
- platform dead-code elimination
- semantic element selection

などの最適化を行う。

---

## 17. 成功指標

Hozo の成功を「RNW を完全に消せたか」だけで評価しない。

**Adoption**

- 外部 production project 数
- 新規 Hozo project 数
- 既存 RN project への導入数
- compatibility request 数

**Compiler coverage**

- application-owned RN primitives の direct lowering 率
- runtime fallback 率
- RNW fallback 率

**Performance**

- cold build
- incremental build
- HMR
- production build
- runtime JS size
- bundle size
- style resolution cost

**Web output**

- wrapper 削減数
- DOM node 数
- generated CSS size
- semantic HTML 使用率

**Accessibility**

- automated diagnostic coverage
- semantic HTML coverage
- keyboard test pass rate
- screen reader test coverage
- primitive ごとの accessibility conformance

---

## 18. リスク

| リスク | 方針 |
|---|---|
| compiler scope が膨張する | partial lowering + fallback を正式仕様とする |
| RNW compatibility の再実装が巨大化する | v1 で完全互換を目指さず、安全な subset から始める |
| Tailwind semantics が複雑 | Style IR を境界に置き、Hozo 内部表現を分離する |
| NativeWind compatibility が重い | core 仕様と compatibility layer を分離する |
| dynamic styling が runtime を必要とする | genuinely dynamic なケースに runtime cost を限定する |
| accessibility の保守コストが大きい | primitive を狭くし、品質を coverage より優先する |
| core が framework 化する | canonical primitives に限定し、UI kit を作らない |
| optimization が実用上効かない | Phase 0 から実 project benchmark を取る |

---

## 19. Hozo が目指す位置

Hozo は単なる、

- styling library
- UI kit
- RNW replacement
- accessibility library

のいずれでもない。

これらの境界に位置する。

```
                     React Native source
                            │
             ┌──────────────┴──────────────┐
             │                             │
        @hozo/core                 existing ecosystem
             │                             │
             └──────────────┬──────────────┘
                            │
                      Hozo Compiler
                            │
                         Hozo IR
                            │
             ┌──────────────┴──────────────┐
             │                             │
            Web                          Native
             │                             │
      semantic DOM + CSS              React Native
      accessibility                   accessibility
      minimal runtime                 minimal runtime
```

新規 project では Hozo Core を使えばよい。

既存 project では Hozo Compiler を一つ足せばよい。

複雑な部分は Hozo が下で処理する。

---

## 20. 長期ビジョン

Hozo の理想形は、Hozo 固有 API の利用率が高いことではない。

むしろ、

> **Hozo を意識しなくても、既存 React Native ecosystem がより効率よく Web / Native に接続される状態**

を作ることである。

Hozo Core は最も簡単な入口。

Hozo Compiler は既存 ecosystem への入口。

Hozo IR はその両者を接続する内部基盤。

Accessibility はその全経路に共通する基本要件。

最終的には、

```
React Native ecosystem
          │
          ▼
       Hozo IR
          │
      ┌───┴───┐
      │       │
     Web    Native
```

という共通 compilation substrate を目指す。

Hozo が目立つ必要はない。

複数の部材を外から目立たない形で正確につなぐ。

その役割そのものが **Hozo** という名前の意味である。
