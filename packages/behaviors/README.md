# @hozo/behaviors

Universal headless runtime behaviors for Hozo: the layer where **accessibility and internationalisation are first-class behaviours**.

Those are the two concerns that should be designed in from the start and are usually added at the end. Defining them here, below every component, is how Hozo makes "from the start" the default ([decision 008](../../docs/decisions/008-i18n-is-a-connection.md)).

The behaviours cover focus management, outside click handling, keyboard navigation, collision-aware floating positioning, disclosure states, screen reader announcements, phonetic reading control, text direction, and hover delay groups, on both Web and React Native.

## Included Behaviors

### 1. Hover & Tooltip Mechanics
- **`useHoverTrigger`**: Headless hook managing hover, keyboard focus, Escape dismissal, and mobile long-press triggers. Monitors pointer movement against safe polygons to avoid flickering.
- **`TooltipGroupProvider` / `useTooltipGroup`**: Warmup and cooldown delay state machine for sibling tooltips (e.g. toolbars). Opens with an intentional delay (`openDelay`, default 700ms) on first hover, then switches instantly (`0ms`) between adjacent tools until the cooldown timer (`skipDelayDuration`, default 300ms) expires.
- **`computeSafePolygon` / `isPointInPolygon`**: Pure ray-casting geometric calculation creating a dynamic safe bridge between the pointer on the trigger and the floating content rectangle (e.g. HoverCards with buttons), allowing diagonal cursor travel without accidental dismissals.
- **`@hozo/patterns` `Tooltip`** composes these headless pieces and owns the rendered widget.

### 2. Focus & Keyboard Management
- **`FocusScope`**: Universal focus containment (tab trapping), initial auto-focus target resolution, and focus restoration to opener element on unmount.
- **`RovingFocusGroup` / `useRovingItem`**: WAI-ARIA roving `tabIndex` manager for toolbars, menus, tablists, radio groups, and tree views, supporting horizontal/vertical orientations and wrap-around.
- **`useTypeahead`**: Predictive keyboard navigation matching query prefixes with loop prevention and reset timeout.

### 3. Layers, Portals & Dismissals
- **`DismissableLayer`**: Outside pointerdown/press dismissal and Escape key handling with proper nested stacking order.
- **`Portal` / `PortalHost` / `PortalProvider`**: Universal React Portal rendering across Web DOM (`document.body` or custom node) and React Native root hierarchies with sibling `inert` coordination.
- **Dialog foundations**: focus scope, dismissable layers, and portals remain here; the rendered
  `Dialog` / `HozoDialog` component is owned by `@hozo/patterns`.

### 4. Floating Anchoring & Positioning
- **`FloatingPositioner` / `useFloatingPosition`**: Zero-dependency floating positioning supporting 12 placements, auto-flip, shift overflow boundary constraints, arrow offset clamping, `matchAnchorWidth` for selects, and `referenceHidden` tracking.

### 5. Screen Reader Announcements
- **`LiveRegion` / `useAnnounce`**: Universal polite and assertive screen reader live announcements with queued vocalization.

## Usage Example

```tsx
import { useState } from 'react'
import {
  FloatingPositioner,
  DismissableLayer,
  FocusScope,
  Portal,
  useHoverTrigger,
} from '@hozo/behaviors'

export function HoverPreview() {
  const [open, setOpen] = useState(false)
  const { triggerProps, contentProps } = useHoverTrigger({
    open,
    onOpenChange: setOpen,
    openDelay: 400,
    closeDelay: 200,
  })

  return (
    <>
      <button type="button" {...triggerProps}>
        Hover or Focus me
      </button>
      {open && (
        <Portal>
          <DismissableLayer onDismiss={() => setOpen(false)}>
            <FocusScope trapFocus={false}>
              <FloatingPositioner placement="top">
                <div {...contentProps}>Accessible contextual card</div>
              </FloatingPositioner>
            </FocusScope>
          </DismissableLayer>
        </Portal>
      )}
    </>
  )
}
```

## Native pressable interaction facts

`@hozo/behaviors/pressable-interaction` exports `usePressableInteraction`.
It returns `state` (`pressed`, `hovered`, `focused`, `focusVisible`) and
eventless `handlers` for hover, focus, pointer/key modality and press changes.
The host delivers those events and composes any caller handlers afterwards.
Focus-visible inference is opt-in. The optional `onChange` callback receives
the next facts synchronously for the existing Native animation driver.
This is shared by the primitive and patterns; it has no listeners, subscriptions
or animation allocations of its own, and does not subscribe to environment
conditions such as media queries or colour scheme.

<!-- generated: package-footer -->

---

Part of [Hozo](https://iray-tno.github.io/hozo/), a universal UI framework for React Native, compiled by Rust, with native semantics on every platform, first-class accessibility, and diagnostics for humans and AI agents alike. Most applications install [`@hozo/core`](https://www.npmjs.com/package/@hozo/core) and one build integration; see [Getting started](https://iray-tno.github.io/hozo/docs/getting-started/). Source and issues: [github.com/iray-tno/hozo](https://github.com/iray-tno/hozo).

<!-- /generated: package-footer -->
