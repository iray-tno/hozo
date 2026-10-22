---
title: "Behaviors & i18n (@hozo/behaviors)"
description: "Headless accessibility engines, focus management, portals, floating positioning, and internationalization connections."
sidebar:
  order: 3
---

`@hozo/behaviors` is the bottom layer of Hozo's runtime stack. It depends on nothing and provides the headless accessibility and internationalization primitives that `@hozo/patterns`, `@hozo/form`, and custom application widgets build on.

```tsx
import {
  DismissableLayer,
  FloatingPositioner,
  FocusScope,
  Portal,
  useHoverTrigger,
} from '@hozo/behaviors'
```

## Focus and keyboard management

- **`FocusScope`:** contains Tab focus (`trapFocus`), resolves the initial auto-focus target (`initialFocusIndex`), and restores focus to the opener element when unmounted. When initial focus is statically knowable at build time, the compiler optimizes it directly.
- **`RovingFocusGroup` & `useRovingItem`:** WAI-ARIA roving `tabIndex` manager (`0` on the active item, `-1` on siblings) for toolbars, menus, tablists, radio groups, and trees, supporting horizontal, vertical, and wrap-around arrow navigation.
- **`useTypeahead`:** predictive character-prefix navigation with loop prevention and a reset timer.

## Layers, portals, and floating positioning

- **`Portal`, `PortalHost` & `PortalProvider`:** renders overlays into `document.body` (or a custom container) on the Web and into the root portal host on React Native, coordinating sibling `inert` state when modal.
- **`DismissableLayer`:** handles Escape key and outside pointerdown/press dismissal in nested stacking order so closing a menu inside a dialog does not dismiss the dialog.
- **`FloatingPositioner` & `useFloatingPosition`:** zero-dependency collision-aware anchoring supporting 12 placements (`top`, `bottom-start`, etc.), auto-flip, viewport shift clamping, arrow offset clamping, `matchAnchorWidth`, and `referenceHidden` tracking.

## Hover mechanics and safe polygons

- **`useHoverTrigger`:** coordinates pointer hover, keyboard focus, Escape dismissal, and touch long-press triggers.
- **`TooltipGroupProvider` & `useTooltipGroup`:** warmup and cooldown state machine (`openDelay` default 700ms, instant `0ms` handoff between adjacent triggers until `skipDelayDuration` 300ms expires).
- **`computeSafePolygon` & `isPointInPolygon`:** ray-cast geometric bridge between a trigger and its floating panel so a user moving the cursor diagonally toward an interactive popover or hover card does not accidentally close it.

## Screen reader announcements and i18n

- **`LiveRegion` & `useAnnounce`:** polite and assertive screen-reader announcements with queued vocalization on both Web (`aria-live`) and React Native (`AccessibilityInfo.announceForAccessibility`).
- **`HozoI18nProvider`:** connects your application's locale and reading direction (`dir="ltr" | "rtl"`) to Hozo widgets without bundling a message catalog ([decision 008](https://github.com/iray-tno/hozo/blob/main/docs/decisions/008-i18n-is-a-connection.md)). Logical edges such as `Drawer`'s `side="start"` read `dir` from this provider first, falling back to the document direction on Web and `I18nManager.isRTL` on React Native.

## Native pressable interaction facts

`@hozo/behaviors/pressable-interaction` exports `usePressableInteraction`, shared by compiled primitives and runtime patterns on React Native. It tracks `{ pressed, hovered, focused, focusVisible }` and returns eventless handlers that compose caller callbacks and feed Hozo's Native interaction style callbacks and `Animated` transition driver without extra wrapper views.
