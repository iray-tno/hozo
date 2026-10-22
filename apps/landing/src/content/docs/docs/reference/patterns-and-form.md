---
title: "Headless Patterns & Form (@hozo/patterns, @hozo/form)"
description: "Unstyled stateful WAI-ARIA widgets, civil-date calendars, and form primitives underneath @hozo/ui."
sidebar:
  order: 2
---

[`@hozo/ui`](../../components/) gives Hozo's widgets a theme and a look. Underneath it sit two headless runtime packages — **`@hozo/patterns`** and **`@hozo/form`** — which own the state machines, WAI-ARIA roles, keyboard contracts, and React Native accessibility semantics with zero built-in CSS.

Most applications either use [`@hozo/ui`](../../components/) for styled components or import the headless patterns from `@hozo/core` (which re-exports `@hozo/patterns`) and `@hozo/form` to supply their own class lists.

## `@hozo/patterns` catalog

`@hozo/patterns` ships 23 stateful widgets:

| Category | Widgets | Key design contract |
| --- | --- | --- |
| Selection & toggles | `Checkbox`, `Switch`, `RadioGroup`, `Chip`, `Listbox`, `Combobox` | `Checkbox` is `<button role="checkbox">` so `aria-checked="mixed"` renders on the server; `Switch` has only on/off; `Chip` separates its toggle slot (`aria-pressed:*`) from its optional `removeClassName` button |
| Overlays & sheets | `Dialog`, `Popover`, `BottomSheet`, `Drawer`, `Tooltip`, `CommandPalette` | `Popover` is non-modal by default and closes when focus leaves; `BottomSheet` and `Drawer` are modal with counted `useScrollLock` and shared flick/detent physics (`sheet-rules.ts`); `Drawer` supports logical `side="start" \| "end"` |
| Navigation & disclosure | `Tabs`, `Accordion`, `Menu`, `Toolbar`, `Tree`, `Pagination`, `Stepper` | `Tabs`, `Toolbar`, and `Tree` use a single tab stop with roving arrow focus; `Accordion` makes each header its own tab stop alongside arrow navigation; `Pagination` and `Stepper` use `aria-current="page"` and `aria-current="step"` |
| Inputs & pickers | `Slider`, `OtpInput`, `ColorPicker`, `Avatar` | `Slider` shares pure drag/step math (`slider-rules.ts`) across Web pointer capture and Native `PanResponder` + `increment`/`decrement` actions; `OtpInput` uses one real `<input>` with a virtual caret |

### Style slots and owner facts on React Native

Because published packages in `node_modules` are not compiled by your build unless shipped as source, patterns write host elements directly (`<button>` / `<div>` on Web, `Pressable` / `View` on React Native) and accept secondary class props for their parts (`panelClassName`, `optionClassName`, `swatchClassName`, `removeClassName`, and so on).

When your component passes a literal or dynamic class string to a registered pattern slot, the compiler and runtime bind that class list to the **actual part that owns the state**:

- **`Chip`:** `removeClassName` receives the remove button's own hover, focus, and disabled state rather than the outer chip's selection state.
- **`ColorPicker`:** `swatchClassName` and `selectedSwatchClassName` read each preset radio's `aria-checked:*` and `disabled:*` state.
- **`CommandPalette`:** `itemClassName` and `activeItemClassName` read `aria-selected:*` and `aria-disabled:*` while DOM focus stays on the search input (`aria-activedescendant`).
- **`OtpInput`:** `inputClassName` owns `focus:*`, `focus-visible:*`, `disabled:*`, and `read-only:*`; decorative cell slots (`cellClassName`, `activeCellClassName`, `filledCellClassName`) do not add extra tab stops or borrow input focus.
- **Decorative indicators (`Checkbox`, `Switch`, `RadioGroup`):** accept an `indicator={({ checked, disabled }) => ({ className, markClassName })}` callback so `@hozo/ui` or custom themes can draw checkmarks and switch thumbs from the pattern's authoritative state.

## `@hozo/form` catalog

`@hozo/form` lives in its own package so applications that only use `Tabs` or `Dialog` do not pull in calendar arithmetic or optional native pickers:

| Component / helper | Purpose |
| --- | --- |
| `Calendar`, `DatePicker`, `DateRangePicker`, `DateTimePicker` | Civil-date month grid (`CalendarDate: { year, month, day }`, `month` 1–12) using UTC integer math so DST and timezone offsets never duplicate or skip a day |
| `TimePicker`, `timeOptions` | `CalendarTime: { hour, minute, second? }` spinbuttons (`TimePicker`) and discrete slot generator (`timeOptions` for `Listbox`), composable inside `DateTimePicker` via a render prop |
| `firstDayOfWeek`, `monthGrid`, `moveFocus`, `dateBounds`, `timeBoundsOn` | Pure exported date/time arithmetic with deterministic locale week-start tables (no reliance on `Intl.Locale.prototype.getWeekInfo`, which Hermes omits) |
| `FileDropzone`, `sortFiles` | Button-first file selector with drag-and-drop shortcut, shared MIME/extension/size/count validation, polite screen-reader summary, and `pickFiles` / `expo-document-picker` seam on Native |
| `TextArea` | Auto-growing multiline input (`minRows`, `maxRows`) with cross-platform content/padding height math (`text-area-rules.ts`) and threshold-gated character-count announcements (`announceRemaining`) |
| `Form`, `useFormSubmit` | Universal form container that refuses to submit past a control marked `aria-invalid`, focusing the first invalid control instead (`firstInvalid`, `shouldSubmit`) and dismissing the software keyboard on Native |
| `NativeSelect`, `NativeSelectProvider` | Styled closed `<select>` on Web; delegates to a custom `presenter`, `ActionSheetIOS` on iOS, or an accessible modal list on Android |
