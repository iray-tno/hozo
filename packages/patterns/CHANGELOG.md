# @hozo/patterns

## 0.4.0

### Minor Changes

- [#1473](https://github.com/iray-tno/hozo/pull/1473) [`3ad9a9d`](https://github.com/iray-tno/hozo/commit/3ad9a9d10138f5aafa64d80971e628ab4434aa03) Thanks [@iray-tno](https://github.com/iray-tno)! - Accordion panels can animate opening and closing. The pattern now wraps each panel's content in a node of its own (`panelContentClassName`, and `panelContentStyle` on Native) and gives the Web panel its content's measured height as `--hozo-panel-height`; a closing panel is `inert` until its exit transition ends and then `hidden`. On Native, a panel whose classes ask for a `height` transition grows and shrinks through `HozoAnimated` and is removed when it reaches `0`. `@hozo/ui`'s Accordion uses this for a 200ms height transition, with its padding moved to the content node, and opens and closes at once under reduced motion.

- [#1462](https://github.com/iray-tno/hozo/pull/1462) [`0b1a810`](https://github.com/iray-tno/hozo/commit/0b1a810adccf701a2b1ec76b9cc61af484e7282d) Thanks [@iray-tno](https://github.com/iray-tno)! - On Native, a control indicator part (a switch's track and thumb, a checkbox's box and tick) whose classes ask for a transition now animates to its new look through `HozoAnimated`, following reduced motion; one whose classes ask for none is the plain `View` it was.

- [#1243](https://github.com/iray-tno/hozo/pull/1243) [`480e00a`](https://github.com/iray-tno/hozo/commit/480e00a0d6e165b92beb8dbf9310710fcceb7fd1) Thanks [@iray-tno](https://github.com/iray-tno)! - Add a portable one-axis drag behavior, Splitter and ResizablePane. Panes resize with captured pointer drags, Web keyboard commands and Native accessibility actions, support logical sides and collapse/restore, and expose change/commit callbacks for application-owned persistence.

- [#1254](https://github.com/iray-tno/hozo/pull/1254) [`9499425`](https://github.com/iray-tno/hozo/commit/94994254d4cc7efce6fa611ea22c1b03ada99118) Thanks [@iray-tno](https://github.com/iray-tno)! - `Slider` takes a `railClassName` and a `railStyle`: an `aria-hidden` element along the whole track, under the fill. `@hozo/ui`'s Slider draws its rail with it, where it used the track's `::before` before. React Native has no pseudo-elements, so the Native slider showed only its fill, and that fill sat at the top of the track. The rail and fill are now centred by insets, which leaves them 8px thick, where they were 4px.

- [#1245](https://github.com/iray-tno/hozo/pull/1245) [`37a9151`](https://github.com/iray-tno/hozo/commit/37a915152634d8e25dfa9b2958661d4bc8f0a134) Thanks [@iray-tno](https://github.com/iray-tno)! - Add portable CodeLines and CodeBlock with application-supplied tokens, semantic line marks, hidden gutters, line numbers, wrapping, accessible scrolling and copy feedback. Supply Native clipboard access through CodeClipboardProvider. Pure model, Shiki connection and fence metadata helpers have independent subpaths; no highlighter or diff runtime is included.
  
  Del now renders a semantic `<del>` on Web instead of `<s>`. Strikethrough retains `<s>`; Ins adds `<ins>` with underline on Native.

### Patch Changes

- [#1353](https://github.com/iray-tno/hozo/pull/1353) [`e90b243`](https://github.com/iray-tno/hozo/commit/e90b2430e542706bff0c8c5001d94d1180b7d8a2) Thanks [@iray-tno](https://github.com/iray-tno)! - `BottomSheet` takes a `handleBarClassName` (and `handleBarStyle` on Native) for the bar drawn inside its handle, and renders that bar only when the prop is given. `@hozo/ui` used to draw its grabber with `before:` on the handle, which React Native has no host for, so a Native sheet showed an empty 24px band. It now draws the grabber through this slot, and it shows on both platforms.

- [#1281](https://github.com/iray-tno/hozo/pull/1281) [`6dd5256`](https://github.com/iray-tno/hozo/commit/6dd525626b8535772381dfb7c28dac665a063a16) Thanks [@iray-tno](https://github.com/iray-tno)! - Keep CodeBlock's copy status regions mounted before updating their messages so NVDA can announce completion. Alternate the regions for repeated copies of the same text, and retire feedback when content or clipboard connections change.

- [#1256](https://github.com/iray-tno/hozo/pull/1256) [`4270a72`](https://github.com/iray-tno/hozo/commit/4270a727b14605d7ff5c9831238e60cb518e3ed6) Thanks [@iray-tno](https://github.com/iray-tno)! - Share BottomSheet drag capture, frame coalescing and cancellation through useDrag1D on Web and Native. Settle from the final release position and velocity, restore the starting detent on cancellation, and discard pending movement when closing or unmounting. Keep handle taps and keyboard activation separate from the click generated after a drag.
  
  Expose drag velocity details, an optional geometry validation callback and a Native movement threshold without changing existing delta-only callbacks.

- [#1396](https://github.com/iray-tno/hozo/pull/1396) [`d674538`](https://github.com/iray-tno/hozo/commit/d674538468608c9aa128494f983bf022722c4337) Thanks [@iray-tno](https://github.com/iray-tno)! - A Native `CodeBlock` or `CodeLines` no longer redraws the lines an update left alone: a line passed again as the same object keeps its row. Changing one line of a 1000-line block re-rendered every mounted line before.

- [#1375](https://github.com/iray-tno/hozo/pull/1375) [`38ac1a9`](https://github.com/iray-tno/hozo/commit/38ac1a9521cb83e714471d76885925aa9bd6ade8) Thanks [@iray-tno](https://github.com/iray-tno)! - `CodeBlock` takes `maxHeight`: longer content scrolls inside the block. On React Native only the lines near the visible ones are mounted ([#1289](https://github.com/iray-tno/hozo/issues/1289)), and the widest line is drawn once, at no height, so a block that scrolls sideways is still as wide as its widest line. The Web keeps every line in the page.

- [#1419](https://github.com/iray-tno/hozo/pull/1419) [`1c052da`](https://github.com/iray-tno/hozo/commit/1c052dad66426e8a4acd462c776f161249330c35) Thanks [@iray-tno](https://github.com/iray-tno)! - A windowed Native `CodeBlock`'s accessible name now gives its length, for example "Code, 4000 lines", from the new `hozo.code.lines` message.

- [#1384](https://github.com/iray-tno/hozo/pull/1384) [`1b54676`](https://github.com/iray-tno/hozo/commit/1b54676fbc476f848d2e834a9443fde0bf888ce9) Thanks [@iray-tno](https://github.com/iray-tno)! - A windowed `CodeBlock` now windows on the Web too: only the lines near the visible ones are mounted, the rest are held as space, and an unwrapped block keeps its scrolling width with a hidden copy of the widest line. The lines stay one `<pre><code>`.

- [#1411](https://github.com/iray-tno/hozo/pull/1411) [`301e475`](https://github.com/iray-tno/hozo/commit/301e475d88e4628517a9b4fb2b2f0a245af62144) Thanks [@iray-tno](https://github.com/iray-tno)! - A windowed Web `CodeBlock` can be read to its last line by a screen reader: the whole text is kept as hidden plain lines with their mark prefixes, and the drawn rows are hidden from reading.

- [#1384](https://github.com/iray-tno/hozo/pull/1384) [`2c37b3c`](https://github.com/iray-tno/hozo/commit/2c37b3cccc43c7671c61c5f46b81e60fc5ba82a2) Thanks [@iray-tno](https://github.com/iray-tno)! - `CodeBlock` takes `windowing: 'auto' | 'on' | 'off'`. With `maxHeight`, `'auto'` (the default) now windows only past 100 lines, and a shorter block scrolls with every line mounted.

- [#1399](https://github.com/iray-tno/hozo/pull/1399) [`3fb505a`](https://github.com/iray-tno/hozo/commit/3fb505a3ce6a7793eef0037ec27d72edea0abf27) Thanks [@iray-tno](https://github.com/iray-tno)! - A Web `CodeBlock` or `CodeLines` no longer redraws the lines an update left alone, as on Native: a line passed again as the same object keeps its row.

- [#1461](https://github.com/iray-tno/hozo/pull/1461) [`205b7a6`](https://github.com/iray-tno/hozo/commit/205b7a66a93fdfe3df702c4cd326abb3a4a0a9a4) Thanks [@iray-tno](https://github.com/iray-tno)! - Keep ColorPicker slider markers visible with value-dependent light/dark outlines and a contrasting outer edge. Add a shared thumb-look callback without moving slider focus ownership.

- [#1480](https://github.com/iray-tno/hozo/pull/1480) [`82c2472`](https://github.com/iray-tno/hozo/commit/82c24723090e6f1b4c29f60017d8d1d10a639b62) Thanks [@iray-tno](https://github.com/iray-tno)! - Center ColorPicker slider thumbs with logical inline-start margins (`-ms-3`) instead of a physical `-translate-x-1/2`, and reverse ColorPicker track gradients (`to left`) and preset swatch arrow navigation under RTL on Web and React Native.

- [#1338](https://github.com/iray-tno/hozo/pull/1338) [`97b956c`](https://github.com/iray-tno/hozo/commit/97b956c9ee6ef1bd0721bc09923c1bc9102b14f7) Thanks [@iray-tno](https://github.com/iray-tno)! - `Menu` and `Combobox` take `defaultOpen`, on Web and Native, as `Popover` and `Tooltip` already did: the menu opens with its first enabled item active, the combobox with its list showing and nothing active.
  
  `@hozo/ui`'s `CommandPalette` draws a focus ring on its field, inset so the panel does not clip it, and its shortcut hints are `text-hozo-text-muted`: on the active row, `text-hozo-text-subtle` was 4.26:1 in light.

- [#1298](https://github.com/iray-tno/hozo/pull/1298) [`e3730c7`](https://github.com/iray-tno/hozo/commit/e3730c735239b78d713e275429a568f047653a49) Thanks [@iray-tno](https://github.com/iray-tno)! - On React Native, `Avatar` no longer clips its status dot. The avatar clipped everything inside it to its own corners, so a dot on a round avatar's edge was cut to a sliver. The picture now takes the avatar's corners itself, and the avatar does not clip. `@hozo/ui`'s Avatar rounds its picture on the Web too, which did not clip either.

- [#1352](https://github.com/iray-tno/hozo/pull/1352) [`c49b78b`](https://github.com/iray-tno/hozo/commit/c49b78b8daa63e0fdc2a44f6d83461960f71bf27) Thanks [@iray-tno](https://github.com/iray-tno)! - The Native `BottomSheet` comes up from the bottom edge over a scrim. Before, it was drawn at the top of the screen with no visible scrim. React Native drops `fixed`, so the pattern's root now fills its `Modal`. `@hozo/ui`'s root class also names `flex-row`, because `items-end` means the bottom edge only in a row.

- [#1253](https://github.com/iray-tno/hozo/pull/1253) [`381b826`](https://github.com/iray-tno/hozo/commit/381b826b09abefbc36c17ceb812ad13d528d818b) Thanks [@iray-tno](https://github.com/iray-tno)! - On React Native, `ColorPicker`'s sliders now paint their tracks: the hue spectrum, and the saturation, lightness and alpha ramps the Web half draws. Before, the tracks were left plain and the thumb was white on a white surface, so the sliders could not be seen.

- [#1320](https://github.com/iray-tno/hozo/pull/1320) [`4b50482`](https://github.com/iray-tno/hozo/commit/4b50482e7ce1085970cda578e17fe4deeffa7234) Thanks [@iray-tno](https://github.com/iray-tno)! - `backdrop:backdrop-blur-*` on a `Dialog` compiles for React Native and blurs behind the panel through the app's backdrop-filter adapter (`configureHozoBackdropFilter`). With no adapter the blur is left out and the scrim keeps its colour. `@hozo/ui`'s Dialog now blurs the page a little (`backdrop-blur-xs`) on both platforms.

- [#1303](https://github.com/iray-tno/hozo/pull/1303) [`79b0319`](https://github.com/iray-tno/hozo/commit/79b0319e7159d58d4cd15f997d6c1e88e16d6d4a) Thanks [@iray-tno](https://github.com/iray-tno)! - `Accordion` and `NativeSelect` show their chevrons on React Native. `@hozo/patterns`' `Accordion` takes an `indicator` callback, given each header's `expanded` and `disabled`, which draws a hidden node after the header, the same slot `Checkbox`, `Switch` and `RadioGroup` have. `@hozo/form`'s `NativeSelect` takes `indicatorClassName` for a hidden node after the value on React Native; the Web `<select>` draws its own. `@hozo/ui` uses both instead of an `::after` chevron, which React Native cannot draw.

- [#1361](https://github.com/iray-tno/hozo/pull/1361) [`262aca9`](https://github.com/iray-tno/hozo/commit/262aca978ebe1c79c61bac914b01f50e5768c0bc) Thanks [@iray-tno](https://github.com/iray-tno)! - A right-hand `Drawer` on React Native opens at the right edge and fills the height of the screen. It opened on the left, because a Native flex box is a column and `justify-end` moved the panel down instead of across. The Native `Drawer` root now fills its `Modal`, as the Web's `fixed inset-0` layer does.

- [#1353](https://github.com/iray-tno/hozo/pull/1353) [`d6beff8`](https://github.com/iray-tno/hozo/commit/d6beff866c9b57a9d7bcf12bf7ab16622dcde78c) Thanks [@iray-tno](https://github.com/iray-tno)! - The Native `Drawer` and `BottomSheet` clear the safe area of the edges they reach. The Drawer clears the status bar and notch at the top and the home indicator at the bottom; the BottomSheet clears the bottom. The inset is added to the panel's own padding, and it is zero in an app without a `<SafeAreaProvider>`.

- [#1348](https://github.com/iray-tno/hozo/pull/1348) [`b59995e`](https://github.com/iray-tno/hozo/commit/b59995e108e4cc9b6d093c2487cebece0d02a707) Thanks [@iray-tno](https://github.com/iray-tno)! - The Native `Menu` sheet clears the home indicator and the Android gesture handle: it adds the bottom inset an app's `<SafeAreaProvider>` reports below its own padding, and nothing in an app without one. `@hozo/engine` gains `useHozoProvidedSafeArea()` for that, which reads zeros instead of throwing when the provider or `react-native-safe-area-context` is missing, and the missing-package warning for a safe-area class now fires when such a class first renders rather than whenever the Native entry loads.

- [#1365](https://github.com/iray-tno/hozo/pull/1365) [`272063f`](https://github.com/iray-tno/hozo/commit/272063f6f13901c9b919e987b496f6cf7d7c1952) Thanks [@iray-tno](https://github.com/iray-tno)! - The Native `Drawer`, `BottomSheet` and `Menu` keep clear of a landscape notch or camera cut-out on the left or right. A `Drawer` pads the edge it is against. A `BottomSheet`'s root keeps the sheet off both side insets, and the scrim still covers them. A `Menu` pads both sides of its full-width box.

- [#1252](https://github.com/iray-tno/hozo/pull/1252) [`701eb1f`](https://github.com/iray-tno/hozo/commit/701eb1fdd1abce723bad1f8d8faad98b3fc6dcd5) Thanks [@iray-tno](https://github.com/iray-tno)! - On React Native, `Accordion` and `Tabs` now draw a panel whose `content` is a string. The string sat bare in a `View`, so the panel came out empty. It is now wrapped in a `Text` that carries the panel's text classes.

- [#1302](https://github.com/iray-tno/hozo/pull/1302) [`eb31fc7`](https://github.com/iray-tno/hozo/commit/eb31fc745fb581ee06db50e10db3b0aa60518870) Thanks [@iray-tno](https://github.com/iray-tno)! - On React Native, a `Stepper` step's description sits beside its label, as on the Web, instead of under it. The label and description were in a column of their own; they are now the step row's children, so its gap separates them, and each can shrink so a narrow screen wraps their words.

- [#1306](https://github.com/iray-tno/hozo/pull/1306) [`5cbbb5d`](https://github.com/iray-tno/hozo/commit/5cbbb5de2ba68dd8e44c1939535a84f5325bb950) Thanks [@iray-tno](https://github.com/iray-tno)! - On React Native, a string given to `Dialog`, `Drawer`, `BottomSheet` or `Popover` as children, to `Tooltip` as `content`, to `Avatar` as `fallback` or to `Combobox` as `emptyMessage` is drawn inside a `Text`, with the box's text classes. It sat bare in a `View`, which React Native rejects. `hozoTextChildren` takes an optional text style for this.

- [#1388](https://github.com/iray-tno/hozo/pull/1388) [`4b50034`](https://github.com/iray-tno/hozo/commit/4b500340d7b3ec96066a6a37c8c23d326a9f73ef) Thanks [@iray-tno](https://github.com/iray-tno)! - Allow clicks and taps on OTP cells to focus the single input, including when a cell already displays a digit or masked character.

- [#1039](https://github.com/iray-tno/hozo/pull/1039) [`cf7773e`](https://github.com/iray-tno/hozo/commit/cf7773edcfd5f9d9cb42e35489ce1b15e35312bb) Thanks [@iray-tno](https://github.com/iray-tno)! - A Text nested in `@hozo/ui`'s `Checkbox` or `Switch` label now takes their `hover:`, `active:` and `focus-visible:` text classes on Native. `@hozo/patterns`' pressable provides its state through `HozoInteractionContext`, now in `@hozo/behaviors/pressable-interaction` and shared with `@hozo/primitives`, so the `HozoText` a caller's Text compiles to reads it.

- [#1262](https://github.com/iray-tno/hozo/pull/1262) [`6901bd2`](https://github.com/iray-tno/hozo/commit/6901bd2ed536d9482b3cb273cae9059a803b14b4) Thanks [@iray-tno](https://github.com/iray-tno)! - Share Slider drag capture, frame coalescing and cancellation through useDrag1D on Web and Native. Keep track presses immediate and apply the final release position before committing, including controlled sliders and ColorPicker. Cancel queued movement when disabling or unmounting, preserve onValueCancel without committing, and focus the Web thumb when pressing its track.

- [#1142](https://github.com/iray-tno/hozo/pull/1142) [`98c1e65`](https://github.com/iray-tno/hozo/commit/98c1e65e578b885bd8184dd2eee1617b6d01cfbc) Thanks [@iray-tno](https://github.com/iray-tno)! - `Tooltip` on the Web renders in the top layer, so a fixed or positioned neighbour such as a sidebar no longer paints over it. `className` and `style` now apply to a box inside the positioner, around the `role="tooltip"` label, because the top-layer positioner resets its own background and padding.

- [#1145](https://github.com/iray-tno/hozo/pull/1145) [`bc65476`](https://github.com/iray-tno/hozo/commit/bc654769284e1429e00028d8b6176cbdafab59c8) Thanks [@iray-tno](https://github.com/iray-tno)! - A `Tree` branch can be opened and closed with a pointer. By default a press on a branch row now selects it and opens or closes it, on both platforms. Before this, the Web half only selected and the Native half only toggled.
  
  `toggleOn="marker"` makes only the marker open and close, for a `+` box or for a tree whose branches are things to choose. On React Native the row then offers expand and collapse as accessibility actions. `renderRow` receives a `toggle` for a marker it draws itself. `@hozo/ui`'s `Tree`, whose marker is a chevron, keeps the row behaviour.
- Updated dependencies [[`4270a72`](https://github.com/iray-tno/hozo/commit/4270a727b14605d7ff5c9831238e60cb518e3ed6), [`d674538`](https://github.com/iray-tno/hozo/commit/d674538468608c9aa128494f983bf022722c4337), [`1c052da`](https://github.com/iray-tno/hozo/commit/1c052dad66426e8a4acd462c776f161249330c35), [`7ad0aaa`](https://github.com/iray-tno/hozo/commit/7ad0aaa1ea5db43cb04d4cb4f471e738265f4f1e), [`1b54676`](https://github.com/iray-tno/hozo/commit/1b54676fbc476f848d2e834a9443fde0bf888ce9), [`301e475`](https://github.com/iray-tno/hozo/commit/301e475d88e4628517a9b4fb2b2f0a245af62144), [`3fb505a`](https://github.com/iray-tno/hozo/commit/3fb505a3ce6a7793eef0037ec27d72edea0abf27), [`480e00a`](https://github.com/iray-tno/hozo/commit/480e00a0d6e165b92beb8dbf9310710fcceb7fd1), [`fac2f53`](https://github.com/iray-tno/hozo/commit/fac2f53a7636c7373cf22c4d49fcf5a137bb08ec), [`add3e7b`](https://github.com/iray-tno/hozo/commit/add3e7b2c5a152c770eabee7d09d723e925958e1), [`e4734c8`](https://github.com/iray-tno/hozo/commit/e4734c832c6469edc4ba88a7e09209b2b2ccd29b), [`b59995e`](https://github.com/iray-tno/hozo/commit/b59995e108e4cc9b6d093c2487cebece0d02a707), [`d5a1a1e`](https://github.com/iray-tno/hozo/commit/d5a1a1ee6a55dd50c6c2f91289a11a8665dd9d74), [`c1ca21a`](https://github.com/iray-tno/hozo/commit/c1ca21afee0e3f4dd92110570f3ff3775b01c4cf), [`5cbbb5d`](https://github.com/iray-tno/hozo/commit/5cbbb5de2ba68dd8e44c1939535a84f5325bb950), [`cf7773e`](https://github.com/iray-tno/hozo/commit/cf7773edcfd5f9d9cb42e35489ce1b15e35312bb), [`c4696a4`](https://github.com/iray-tno/hozo/commit/c4696a4660ceb546fc9e29bc18d1fe73979681e5), [`c9a3b4d`](https://github.com/iray-tno/hozo/commit/c9a3b4d61541024c66165c91a4b7e2a75c9a203c), [`416d627`](https://github.com/iray-tno/hozo/commit/416d627e8afc6a3f321c95dbe1f74b630d173d7b), [`37a9151`](https://github.com/iray-tno/hozo/commit/37a915152634d8e25dfa9b2958661d4bc8f0a134)]:
  - @hozo/behaviors@0.4.0
  - @hozo/typography@0.4.0
  - @hozo/engine@0.4.0

## 0.3.0

### Minor Changes

- [`80f2686`](https://github.com/iray-tno/hozo/commit/80f2686ace0922e27502695d0b88c1dba2e08be0) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `Avatar`: a person's picture, or their initials when it is absent or fails to load, read as one image named for the person, with an optional status read after the name ("Ada Lovelace, online"). The headless version lives in `@hozo/patterns`, and the look (three sizes and a status dot) in `@hozo/ui`. Its class lists compile on both platforms, as `Chip`'s do. `@hozo/core` now also exports `Chip`, which it previously reached only through compiled output.

- [#818](https://github.com/iray-tno/hozo/pull/818) [`adfe1fd`](https://github.com/iray-tno/hozo/commit/adfe1fd914d60effc27677efdaee6edf19feaf6b) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `ColorPicker`. It offers:
  - preset swatches as a radio group;
  - hue, saturation and lightness (and opacity, with `alpha`) as ordinary sliders rather than a two-dimensional square, which a keyboard and a screen reader can reach but not operate;
  - a hex field;
  - on the Web, an optional eyedropper where the browser has one.
  
  Every colour is read named and numbered, for example "dark blue, #1e3a8a", and the names go through the i18n connection. `Slider` on the Web now also takes a track `style`.

- [#817](https://github.com/iray-tno/hozo/pull/817) [`496f1b7`](https://github.com/iray-tno/hozo/commit/496f1b75e06bc5f5b079870ce566754e7161c21a) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `CommandPalette` and `useCommandShortcut`.
  
  **`CommandPalette`** is a searchable list of commands in a modal.
  - On the Web it is a dialog holding a combobox and a grouped listbox. The arrow keys move through the matching commands while focus stays in the field (`aria-activedescendant`), Enter runs one, and Escape closes it and returns focus.
  - On React Native it is a full-screen modal with a button per command.
  - On both platforms, matches are ranked (starts with, then a word that starts with, then contains, then the letters in order), and the number of matches is announced as the query narrows them.
  - The headless version lives in `@hozo/patterns` and the look in `@hozo/ui`.
  
  **`useCommandShortcut`** (`@hozo/behaviors`) calls a function for ⌘K on a Mac and Ctrl+K elsewhere. It does nothing on React Native.

- [#811](https://github.com/iray-tno/hozo/pull/811) [`ace032d`](https://github.com/iray-tno/hozo/commit/ace032d26b7e9e50aecf058cd222f7b362a3f225) Thanks [@iray-tno](https://github.com/iray-tno)! - `Drawer`'s `side` now also takes `'start'` and `'end'`, which follow the reading direction. The direction comes from `HozoI18nProvider`'s `dir`, or else from the document's direction on the Web and `I18nManager.isRTL` on React Native. A navigation drawer written `side="start"` therefore opens from the right in Arabic or Hebrew. `useHozoDrawerSide` is exported for a look that needs the resolved edge. The default is still `'left'`.

- [#923](https://github.com/iray-tno/hozo/pull/923) [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6) Thanks [@iray-tno](https://github.com/iray-tno)! - Resolve Native pattern class-name slots through the project's runtime class resolver. Pattern controls now share the primitive interaction engine and deliver hover, focus, focus-visible and pressed facts to their actual owners instead of reporting pressed alone.
  
  Static interaction styles are additionally wired for Chip, ColorPicker swatches, Pagination page controls and CommandPalette pointer-state item slots. Selection slots and nested controls retain their own ownership: a remove button does not inherit its row's focus, and a command item does not borrow the input's focus. Other static state slots and semantic predicates remain subject to their existing diagnostics.
  
  Styled Button receives a pressed look; Checkbox and Switch indicators are real elements on both platforms rather than Native-invisible pseudo-elements. Non-transition Native Pressables and their Text children no longer allocate animation values/listeners. Interaction ownership remains mounted when transitions are added or removed. This removes idle animation work, not every initial-mount cost or every platform delivery difference; measured list mount/update tradeoffs remain tracked separately.

- [#809](https://github.com/iray-tno/hozo/pull/809) [`70cc763`](https://github.com/iray-tno/hozo/commit/70cc763166d3f3aa04c466c5a12e7a8a4dba0a0f) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `OtpInput`, for a one-time code or a PIN. It is one real input drawn as cells, so a screen reader finds one field ("Verification code, 6 characters"), and a pasted or autofilled code lands at once. It asks each platform for a one-time code: `autocomplete="one-time-code"` on the Web, `textContentType="oneTimeCode"` on iOS and `autoComplete="sms-otp"` on Android. `mask` turns it into a PIN. The active and filled cells are styled by class lists the pattern applies, so the look reaches React Native as well.

- [#797](https://github.com/iray-tno/hozo/pull/797) [`9a33076`](https://github.com/iray-tno/hozo/commit/9a3307689c1a37847d45bea9083cee1f63c7edba) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `Pagination`: numbered pages with previous and next, inside a `<nav>` named "Pagination". The current page is marked with `aria-current="page"` (`selected` on Native), and the ends are disabled in place rather than removed. With `getPageHref` every page is a link, which on Native goes through the installed router. The current page and the disabled ends are styled by class lists the pattern applies (`currentItemClassName`, `disabledItemClassName`), so the same look reaches React Native, where there are no selectors.

- [#798](https://github.com/iray-tno/hozo/pull/798) [`030d179`](https://github.com/iray-tno/hozo/commit/030d1791515ef5523560c38c1788e4b23f6bfd92) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `Stepper`: where a person is in a process of several steps. Each step is read with its position and status in words ("Step 2 of 3: Profile, current"), so the status is never carried by colour alone. The current step is marked `aria-current="step"` on the Web and `selected` on Native. With `onStepPress` the steps are buttons. Each status has class lists for the step and its indicator, applied by the pattern, so the look reaches React Native as well.

### Patch Changes

- [#795](https://github.com/iray-tno/hozo/pull/795) [`8e110be`](https://github.com/iray-tno/hozo/commit/8e110be92d0ea8d435ecd1f5e7dcfb236b00b368) Thanks [@iray-tno](https://github.com/iray-tno)! - `Chip`'s `className` and `removeClassName` now style it on React Native. Before, both were ignored there. The compiler lowers `Chip` from `@hozo/core` to `HozoChip` and hands its two class lists over as `style` and `removeStyle`. On the Web they are compiled to classes as before. The Native pattern moves text styles such as `text-white` onto its label, where a `Text` can draw them.

- [#923](https://github.com/iray-tno/hozo/pull/923) [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6) Thanks [@iray-tno](https://github.com/iray-tno)! - Uncompiled View, Text and Image forward refs to their platform hosts. Container measurement preserves the host instead of replacing it, and Web View layout defaults agree between compiled output and fallback components.
  
  An uncompiled Svg now uses its accessibility label as its name, as the compiled path already did. Web controls, including generated Canvas controls and form/pattern actions, show the shared clickable cursor without giving disabled controls an active pointer.

- [#923](https://github.com/iray-tno/hozo/pull/923) [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6) Thanks [@iray-tno](https://github.com/iray-tno)! - Add `HozoI18nProvider`, `hozoMessages`, locale/direction hooks and structural adapters for i18next and react-intl. Hozo's component labels, status descriptions and announcements can use the application's existing translation catalog, with English fallback messages. Hozo connects to an i18n library; it does not introduce a second translation engine or require one of these libraries as a dependency.

- [#802](https://github.com/iray-tno/hozo/pull/802) [`8a7c8c7`](https://github.com/iray-tno/hozo/commit/8a7c8c73dc20d025a10ae5fe472bb81dc8659ce7) Thanks [@iray-tno](https://github.com/iray-tno)! - On the Web, a `<meter>` now carries its amount as a percentage in `aria-valuetext`, as Native already did. Without it, NVDA read `<Meter value={0.6}>` as "progress bar, 0.6" and VoiceOver as "0.6". An author's own `aria-valuetext` still wins.
  
  A `Stepper` step's description is now separated from its status by a space a reader keeps. Before, VoiceOver read "completedEmail and password".
- Updated dependencies [[`80f2686`](https://github.com/iray-tno/hozo/commit/80f2686ace0922e27502695d0b88c1dba2e08be0), [`adfe1fd`](https://github.com/iray-tno/hozo/commit/adfe1fd914d60effc27677efdaee6edf19feaf6b), [`496f1b7`](https://github.com/iray-tno/hozo/commit/496f1b75e06bc5f5b079870ce566754e7161c21a), [`ad1ad0b`](https://github.com/iray-tno/hozo/commit/ad1ad0b355c6ecae07372f44a65aed279e539e22), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`70cc763`](https://github.com/iray-tno/hozo/commit/70cc763166d3f3aa04c466c5a12e7a8a4dba0a0f), [`9a33076`](https://github.com/iray-tno/hozo/commit/9a3307689c1a37847d45bea9083cee1f63c7edba), [`8d58223`](https://github.com/iray-tno/hozo/commit/8d5822322607b6214fa7f57d233a9173a45815b6), [`030d179`](https://github.com/iray-tno/hozo/commit/030d1791515ef5523560c38c1788e4b23f6bfd92)]:
  - @hozo/behaviors@0.3.0
  - @hozo/engine@0.3.0

## 0.2.0

- Add Checkbox, Switch, Slider, Accordion, Popover, BottomSheet and Drawer, with shared Web/Native interaction contracts and public associated types.
- Retain Popover, BottomSheet and Drawer panels during exit transitions; share the Presence/focus infrastructure rather than duplicating it.
- Improve Native Dialog opener-focus requests and expand browser/real-reader verification. Android TalkBack restoration is not universally guaranteed; see the optional native-module guide.

See the [Hozo release notes and migration steps](https://github.com/iray-tno/hozo/blob/main/CHANGELOG.md#020) for cross-package changes and measured boundaries.

### Patch Changes

- Updated Hozo dependencies:
  - @hozo/behaviors@0.2.0
