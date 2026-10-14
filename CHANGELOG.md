# Hozo changelog

## 0.3.0

Hozo 0.3.0 adds opt-in media and embedded web content, project-aware migration
analysis, more accessible widgets and broader Native state styling. Public npm
packages and Rust library crates continue to release together.

### New packages

- **`@hozo/media`** provides Video and independent Audio players: HTML media
  elements on Web, `expo-video` / `expo-audio` engines on Native. Shared controls
  consume observed player state; seeking uses observed ranges. Posters, timed
  captions, plain-text WebVTT loading, caption selection, volume and playback
  rate/pitch requests follow the source's lifetime. `/source` handles resolution
  and disposal, with a separate optional `/source/expo` asset adapter. Native
  playback requires its Expo engine. See the [media guide](packages/media/README.md).
- **`@hozo/webview`** embeds web content through a named iframe on Web or optional
  `react-native-webview` on Native. Without that Native peer it presents a named
  browser link. Web messages are scoped to the owning frame; `title` is required.
  See the [WebView guide](packages/webview/README.md).

### Components and application integration

- Add **Avatar, Chip, Pagination, Stepper, OtpInput, CommandPalette and ColorPicker**
  in `@hozo/patterns`, with styled counterparts in `@hozo/ui`. Their names,
  selection/status descriptions and keyboard behavior are part of the component
  contract, not supplied by colour alone.
- Add semantic **Table** components, with native column sizing measured across
  cells; **Badge**, **Skeleton** and a Native **Meter** gauge extend status/data
  display. Skeleton descendants respect reduced motion.
- Add **FileDropzone** in `@hozo/form`, with accepted/refused file announcements
  and an application-provided or optional Expo Native picker. Add **Icon** in
  `@hozo/svg`, consuming the application's icon data without bundling an icon set.
- Add **Preformatted** in `@hozo/typography`: `<pre>` on Web, whitespace-preserving
  monospace Text on Native. Uncompiled View, Text and Image now forward host refs.
- **HozoI18nProvider** connects component strings, locale and reading direction
  to the application's i18n library. English fallbacks and structural i18next /
  react-intl adapters are included; no translation library is required. Drawer
  also accepts logical `start` / `end` sides.

### Compiler, styling and Native runtime

- Project Tailwind animations and keyframes reach both backends. StyleX conditions
  inside property values are supported. Project radius tokens and built-in radius
  overrides are respected; quoted class arrays contribute runtime candidates.
- Supported Native conditions can be negated and stacked across environment,
  breakpoints, containers and element/interaction facts. Link state styling uses
  the shared owner; transform resets and runtime state transforms preserve their
  CSS families. Unsupported predicates still produce diagnostics.
- Caller classes can override resting component styles without erasing explicit
  state styles. Web fallback candidate rules remain below raw Tailwind utilities,
  and conditional classes reach elements retained as components.
- Native patterns resolve their class-name slots through the project's resolver
  and share primitive interaction facts. Static interaction slots are wired for
  Chip, ColorPicker swatches, Pagination controls and CommandPalette pointer-state
  items. This does not enable every static slot or semantic predicate.
- Styled Button gains a Native pressed look. Checkbox and Switch use real
  indicators on both platforms. Non-transition Pressables/Text avoid animation
  values and listeners; large-list initial-mount tradeoffs remain under measurement.
- Interrupted colour transitions can read their own interpolated RGBA colour,
  so a second interaction continues from the observed intermediate colour instead
  of jumping to an endpoint. Motion owners share timing/state probes without
  adding animation work to plain Pressables.
- Metro rewrites recognized named barrel imports to defining modules, avoiding
  unrelated component imports. Unknown and namespace imports remain conservative.

### Migration audit

The audit now consumes the compiler-owned `@hozo/compiler/analysis` result,
including full lowering findings and authored/unmapped locations. It inventories
JS/TS source separately from context modules, discovers `src/` and `app/` layouts,
and prepares static theme, preflight, platform-scoped StyleX and tsconfig facts.
Executable configuration is not run; absent, invalid and unassessed context remain
distinct. Supplied static font facts can inform diagnostics, not prove device fonts.

React Native import, JSX tag, surviving reference and copied-value journals explain
actual rewrite decisions. Baseline comparison and `--fail-on error|new-errors`
support CI gating without conflating compiler output with production/runtime proof.
Interactive stdout is Markdown; piped stdout remains JSON. Bluesky-specific ALF
checks remain in its pinned corpus measurement rather than the generic report.

**JSON consumers need schema 3.** Older baselines cannot establish a schema-3
semantic comparison; generate a new baseline under the documented context policy.
See the [audit guide](packages/migration-audit/README.md).

### Upgrading and remaining boundaries

Update your installed `@hozo/*` packages together to 0.3.0. Media and WebView are
opt-in rather than additions to the core facade. Native media needs the tested
Expo engines; applications that do not use media do not gain them.

Media engine policy, autoplay, DRM, fullscreen/PiP and device rendering are not
made identical across platforms. Native static state-slot coverage, device styling
acceptance, Dialog TalkBack focus restoration and iOS Three cold-render performance
remain tracked work. Compiler conformance and successful builds are not claims of
universal device behavior. Three renderer selection and supported capability
boundaries remain those documented for 0.2.0; this release does not add a new GPU backend.

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
