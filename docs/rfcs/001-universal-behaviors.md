# RFC 001: Universal Runtime Behaviors & Floating Positioning

- **Status**: Implemented
- **Tracking Issues**: #156, #158, #211
- **Target Package**: `@hozo/behaviors`

---

## 1. Summary & Motivation

In Hozo's Three-Layer Component Hierarchy, **Layer 2 Universal Behaviors** provide the minimal headless interaction units powering all interactive compound components (such as `Dialog`, `Popover`, `Menu`, `Tabs`, `Toolbar`, `Tooltip`, and pickers).

Interactive UI divides deeply between Web and React Native:
- **Focus Management**: The Web platform provides native DOM focus APIs (`focus()`, `activeElement`, `tabindex`), while React Native uses an asynchronous node handle system (`findNodeHandle`, `accessibilityFocus`).
- **Floating Positioning**: Web uses CSS transforms or modern anchor positioning; React Native has no `position: fixed` or synchronous bounding box measurement, requiring window-relative measurement (`measureInWindow`) rendered into an overlay portal.
- **Outside Click & Dismissal**: Web coordinates pointer/mouse events across nested stacked layers; React Native manages a global responder hierarchy and hardware back buttons.
- **Hover & Tooltips**: Web manages mouse pointers and safe hover trajectories; Native devices mix desktop hover with touch long-press gestures.

Instead of writing dozens of complex, disparate components, Hozo condenses all interactive mechanics into **6 core Behaviors + Hover Mechanics**.

---

## 2. Architectural Design

```text
Layer 2: Universal Behaviors (@hozo/behaviors)
  │
  ├── Focus Management
  │     ├── FocusScope            (tab trapping, initial auto-focus, return-focus)
  │     └── RovingFocus           (arrow navigation for toolbars, menus, tablists)
  │
  ├── Stacking & Dismissal
  │     ├── DismissableLayer      (outside click/press, Escape key, nested stack)
  │     └── Portal                (DOM relocation & Native overlay tree)
  │
  ├── Spatial Positioning
  │     └── FloatingPositioner    (12 placements, auto-flip, shift, boundary constraints)
  │
  ├── Hover & Delay Grouping
  │     ├── useHoverTrigger       (hover/focus/touch trigger with safe polygon tracking)
  │     ├── TooltipGroupProvider  (warmup 700ms cold, 0ms warm across siblings)
  │     └── computeSafePolygon    (ray-casting safe bridge between pointer & card)
  │
  └── Screen Reader Announcements
        └── LiveRegion            (polite and assertive queued announcements)
```

### Compiler Invariant
> **静的に分かることはビルド時に解決し、分からないことだけを runtime に残す。**

The compiler statically removes runtime overhead from Layer 2:
- If an initial focus target is static, emits native `autofocus` on Web rather than runtime DOM tree queries.
- Pre-wires matching accessible IDs (`aria-labelledby`, `aria-describedby`, `id`) at compile time.
- Statically identifies sibling elements and attaches `inert` during portal open.

---

## 3. Specification of Core Behaviors

### 1. `FocusScope`
- **Props**: `trapFocus?: boolean`, `restoreFocus?: boolean`, `autoFocus?: boolean`.
- **Web Lowering**: Traps tab navigation within the container boundary using sentinel nodes or keydown interceptors; restores focus to the opener element on unmount.
- **Native Lowering**: Requests accessibility focus on mount and coordinates with VoiceOver / TalkBack focus traps.

### 2. `DismissableLayer`
- **Props**: `onDismiss?: () => void`, `escapeKey?: boolean`, `outsidePointer?: boolean`.
- Coordinates a nested stack so that only the topmost layer responds to Escape or outside clicks.

### 3. `Portal`
- **Web Lowering**: Renders children into `document.body` or a specified container node.
- **Native Lowering**: Relocates views into the root `<PortalHost>` container.

### 4. `RovingFocus`
- **Props**: `orientation?: 'horizontal' | 'vertical' | 'both'`, `loop?: boolean`.
- Manages WAI-ARIA roving `tabIndex` (`0` for active item, `-1` for inactive items) and navigates via Arrow keys.

### 5. `FloatingPositioner`
- **Props**: `placement?: Placement`, `offset?: number`, `flip?: boolean`, `shift?: boolean`, `matchAnchorWidth?: boolean`.
- 12 canonical placements (`top`, `bottom`, `left`, `right` plus `-start` / `-end`).
- Dynamically flips to opposite side when clashing with viewport boundaries, shifts along cross-axis to stay on screen, and tracks `referenceHidden`.

### 6. `useHoverTrigger` & `TooltipGroupProvider`
- Headless hook managing hover, focus, Escape, and touch long-press.
- Pure ray-casting geometric computation (`computeSafePolygon`) creates a safe traversal corridor from cursor to popover.
- Delay state machine (`DelayGroupMachine`) supports toolbar warmup (700ms on first hover, 0ms on adjacent siblings, 300ms cooldown).

---

## 4. Verification Matrix

| Behavior | Web / Screen Reader | Native / Assistive Tech | Test Status |
|---|---|---|---|
| FocusScope | Traps Tab key; restores focus on unmount | Traps VoiceOver swipe cursor | Automated & tested |
| DismissableLayer | Escape key and outside click dismiss topmost layer | Hardware back button and outside touch dismiss | Automated & tested |
| FloatingPositioner | Flips at viewport edge; stays pinned on scroll | Computes window coordinates within safe area | Automated & tested |
| Hover / Tooltip | Instant sibling switch; diagonal safe polygon | Responds to desktop hover and touch long-press | Automated & tested |
