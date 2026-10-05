# Hozo changelog

## 0.2.0

Hozo 0.2.0 adds Three.js rendering, forms, styled UI, motion and SVG filters,
with substantially broader browser and Native verification. All public npm
packages and Rust library crates release together at 0.2.0.

### New packages

- **`@hozo/three`** projects ordinary Three.js scenes into portable Hozo Canvas
  on Web and Native. The supported subset includes meshes, lines, points,
  sprites, instancing/batching, morphs, skinning, clipping, textures, fog and
  normal materials. Responsive surfaces support demand-driven invalidation,
  continuous frames, object picking and named keyboard/screen-reader controls.
  Separate `webgl`, `webgpu` and `r3f` entries host Web GPU rendering; the explicit
  `r3f-native` entry adds an experimental Expo GL host. These renderer families
  are choices, not silent fallbacks. See the [renderer guide](packages/three/README.md)
  and the separate [portable capability](packages/three/conformance.md) and
  [real-scene](packages/three/scene-conformance.md) evidence.
- **`@hozo/form`** adds Calendar, DatePicker, DateRangePicker, TimePicker and
  DateTimePicker, with locale-aware presentation and shared date/time rules.
  Form coordinates submission and invalid controls; TextArea adds multiline
  sizing/count feedback; NativeSelect uses a browser select, iOS ActionSheet,
  modal-list fallback or an application-provided Native presenter. See the
  [form guide](packages/form/README.md).
- **`@hozo/ui`** adds a styled layer over the existing primitives, patterns and
  new forms: buttons, inputs, toggles, sliders, accordions, tabs, overlays,
  selection widgets, calendars/pickers, layout and feedback components. It ships
  TSX source and theme tokens, compiled by the application's Hozo integration
  against its own theme, including paired light/dark colours. It does not ship
  a second widget engine or a prebuilt component stylesheet. See the
  [UI guide](packages/ui/README.md).
- **`@hozo/native`** provides an optional Android accessibility-focus observer
  and bounded retry for Dialog opener restoration. The application explicitly
  installs, rebuilds and wires it through `@hozo/behaviors/native`; no other Hozo
  package requires this native module. It is Android-only, tested with RN 0.87
  New Architecture, and does not guarantee every TalkBack restoration. See the
  [Native module guide](packages/native/README.md) and
  [ADR 006](docs/decisions/006-shipping-native-code.md).

### Components and motion

- `@hozo/patterns` adds Checkbox, Switch, Slider, Accordion, Popover, BottomSheet
  and Drawer. Popover, BottomSheet and Drawer retain their panels through exit
  transitions. FocusScope can focus a panel that mounts after the scope itself.
- `Presence` in `@hozo/primitives` and headless `usePresence` in
  `@hozo/behaviors` keep a child mounted for its exit, exposing
  `data-state="closed"` as the style condition.
- Native supports transition-backed `starting:` opacity/transform entrance
  styles, including variant stacks, and the interpolatable subset of project
  `@keyframes`/`--animate-*` theme animations. Animated Text keeps a Text host.
  Reduced-motion hints cover entrance and exit styles; authors still choose
  their policy with `motion-safe:` or `motion-reduce:`. Unsupported properties
  remain diagnostic. See [ADR 007](docs/decisions/007-motion-is-written-as-classes.md).
- SVG adds Filter, FeColorMatrix, FeGaussianBlur, FeBlend, FeComposite,
  FeDropShadow, FeFlood, FeMerge, FeMergeNode and FeOffset, through both the
  `Svg` namespace and compiler imports. Android blur adapts root viewport scaling,
  density and kernel units; browser and iOS/Android pixel probes cover the shared
  examples. See [SVG filter contracts and limits](packages/svg/README.md).

### Compiler and integrations

- Source-distributed dependencies can contribute class candidates and be
  transformed. Declared `@hozo/*` dependencies are scanned by default;
  `content.packages` explicitly replaces that list. Theme paths are resolved
  from the project, theme aliases can chain, and paired `--dark` colour tokens
  produce Web media rules and Native conditional styles.
- The candidate scanner preserves `=` in arbitrary-value variants, restoring
  data-attribute-driven UI styling. StyleX accepts `@starting-style` and `data-*`
  attribute keys through the same motion conditions.
- Lowering requires trusted import bindings, preserves components when unknown
  spreads conceal the required shape, and refuses generated runtime-import name
  collisions instead of emitting ambiguous bindings.
- Web primitives and RN compatibility wrappers use React 19 ref props;
  Pressable ref forwarding is repaired. Existing author-facing ref usage remains
  supported.

### Verification and examples

- Browser Storybook exercises the expanded widgets in light and dark themes,
  including axe, approved screen-reader utterances, appearance and target-size
  checks. Real NVDA, VoiceOver and TalkBack workflows supplement those checks;
  neither axe nor a virtual reader is treated as proof of device behaviour.
- A React Native Storybook showcase and shared Web/Native examples cover
  preferences, overlays, SVG filters and the interactive Kumimono Three scene.
  Native Three probes cover lifecycle, pixels and a version-pinned glTF corpus.
- Packed-consumer smoke tests install actual tarballs outside the workspace on
  Node 22 and 24: compiler bindings, SSR, a themed Vite application, production
  Metro bundles and optional-module Android autolinking/codegen. Normal releases
  use OIDC and provenance. See the [release verification gate](docs/release-verification.md).
- The documentation site adds domain pages and Canvas/SVG workbenches, responsive
  code examples, a clearer conformance layout and improved navigation/branding.

### Upgrading from 0.1.x

1. Upgrade all directly installed `@hozo/*` packages together to `^0.2.0`, then
   refresh the lockfile. Rebuild compiled output; do not mix old compiler output
   with a different generated-code engine version. Rust library consumers should
   likewise use 0.2.0 together; code constructing or matching the expanded IR
   directly may need updates.
2. `@hozo/vite` and `@hozo/storybook` now require **Vite 8 (`^8.0.0`)**, replacing
   the previously advertised `>=5` range. Native SVG filters require
   **`react-native-svg >=15.9.0`**. React 19 and RN >=0.86 were already required;
   they are not new requirements in this release.
3. Import the new pattern components from `@hozo/patterns`, forms from
   `@hozo/form`, and styled components from `@hozo/ui`; `@hozo/core` retains its
   existing facade exports rather than automatically exporting every new widget.
   UI applications import `@hozo/ui/theme.css` in their Tailwind CSS entry and
   run a Hozo build integration to compile its source.
4. A module rejected with `RUNTIME_IMPORT_COLLISION` must rename its conflicting
   local binding. Components hidden behind untrusted bindings or unknown spreads
   are no longer optimistically lowered; make the import/shape explicit and
   review diagnostics. If you set `content.packages`, include all packages whose
   source you intend to compile, including `@hozo/ui`.

### Measured boundaries

- Portable Three is a documented subset, not a software implementation of
  WebGL. Affine texture/vertex interpolation, bounded line gradients and varying-
  depth fog remain approximations; lighting, custom shaders and GPU state use
  the appropriate GPU renderer. A portable capability percentage is not a
  percentage of arbitrary real applications that render correctly.
- Native GPU support remains experimental Expo prebuild support. iOS Simulator
  lifecycle evidence is not physical-iOS performance or VoiceOver/touch evidence;
  heavy iOS Expo GL submission latency remains open. No Expo Go, bare-RN or
  forced context-loss guarantee is introduced.
- Native SVG keeps upstream blend/blur limits. Android uses an isotropic capped
  kernel; object-bounding-box units and additional group transforms are not
  covered by the root blur correction.
- Native runtime-resolved classes do not acquire the static compiler's dark
  conditions. Native widget class-name slots are not universal runtime styling;
  use the documented style props where the component does not resolve them.
- Android Dialog opener focus restoration is improved, not universally solved.
  The optional native observer is not mandatory and must not be represented as
  a complete fix for every TalkBack/window transition.
- Native Calendar omits `accessibilityCollection` while the supported RN release
  has the upstream Android crash tracked in
  [#525](https://github.com/iray-tno/hozo/issues/525). Reader evidence does not
  imply that collection metadata is exposed on that path.

Package-level notes live beside each package. The [history audit](docs/releases/0.2.0-audit.md)
accounts for all 254 landed PRs since v0.1.0, including supporting tests and fixes.

## 0.1.0

Initial tagged release. The [tagged source](https://github.com/iray-tno/hozo/tree/v0.1.0)
is the baseline for the 0.2.0 audit.
