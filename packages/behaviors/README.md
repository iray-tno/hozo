# @hozo/behaviors

Universal headless runtime behaviors and positioning primitives for Hozo.

These primitives provide the essential interaction mechanics — focus management, outside click handling, keyboard navigation, collision-aware floating positioning, and hover delay groups — on both Web and React Native.

## Included Behaviors

### 1. Hover & Tooltip Mechanics
- **`useHoverTrigger`**: Headless hook managing hover, keyboard focus, Escape dismissal, and mobile long-press triggers. Monitors pointer movement against safe polygons to avoid flickering.
- **`TooltipGroupProvider` / `useTooltipGroup`**: Warmup and cooldown delay state machine for sibling tooltips (e.g. toolbars). Opens with an intentional delay (`openDelay`, default 700ms) on first hover, then switches instantly (`0ms`) between adjacent tools until the cooldown timer (`skipDelayDuration`, default 300ms) expires.
- **`computeSafePolygon` / `isPointInPolygon`**: Pure ray-casting geometric calculation creating a dynamic safe bridge between the pointer on the trigger and the floating content rectangle (e.g. HoverCards with buttons), allowing diagonal cursor travel without accidental dismissals.
- **`<Tooltip>`**: High-level component integrating `useHoverTrigger`, `FloatingPositioner`, `Portal`, and `DismissableLayer` with automatic `role="tooltip"` and `aria-describedby` wiring.

### 2. Focus & Keyboard Management
- **`FocusScope`**: Universal focus containment (tab trapping), initial auto-focus target resolution, and focus restoration to opener element on unmount.
- **`RovingFocus`**: WAI-ARIA roving `tabIndex` manager for toolbars, menus, tablists, radio groups, and tree views, supporting horizontal/vertical orientations and wrap-around.
- **`Typeahead`**: Predictive keyboard navigation matching query prefixes with loop prevention and reset timeout.

### 3. Layers, Portals & Dismissals
- **`DismissableLayer`**: Outside pointerdown/press dismissal and Escape key handling with proper nested stacking order.
- **`Portal`**: Universal React Portal rendering across Web DOM (`document.body` or custom node) and React Native root hierarchies with sibling `inert` coordination.

### 4. Floating Anchoring & Positioning
- **`FloatingPositioner`**: Zero-dependency floating positioning supporting 12 placements, auto-flip, shift overflow boundary constraints, arrow offset clamping, `matchAnchorWidth` for selects, and `referenceHidden` tracking.

### 5. Screen Reader Announcements
- **`LiveRegion`**: Universal polite and assertive screen reader live announcements with queued vocalization.

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
