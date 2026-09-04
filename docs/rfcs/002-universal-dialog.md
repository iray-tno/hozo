# RFC 002: Universal Dialog Component

- **Status**: Implemented
- **Tracking Issues**: #156, #167, #203
- **Target Package**: `@hozo/core`

---

## 1. Summary & Motivation

Modal dialogs are the hallmark benchmark of universal component composition. A robust modal across Web and React Native requires harmonizing four distinct behavioral aspects:
1. **Portal**: Rendering outside parent overflow boundaries directly into the root DOM or native overlay tree.
2. **FocusScope**: Trapping tab focus inside the modal dialog while open and restoring focus to the trigger button on close.
3. **DismissableLayer**: Closing on Escape key press, backdrop click, or native hardware back button.
4. **Accessible Structure**: Announcing dialog appearance to screen readers and rendering underlying content inert.

As the first Layer 3 Universal Component target, `<Dialog>` validates that Layer 2 Universal Behaviors (`FocusScope`, `DismissableLayer`, `Portal`) compose seamlessly into an accessible, production-ready interface.

---

## 2. Architecture & Behavior Composition

```text
Dialog (@hozo/core)
  = Portal              (relocates markup to document body / root hierarchy)
  + FocusScope          (traps tab navigation, focuses initial element, restores on close)
  + DismissableLayer    (handles Escape key, backdrop click, hardware back button)
  + Semantic Layout     (HTML5 <dialog> on Web; <Modal> on React Native)
```

---

## 3. API Specification

```tsx
import { useState } from 'react'
import { Dialog, Button, Heading, Paragraph, View } from '@hozo/core'

export function ConfirmModal() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onPress={() => setOpen(true)}>Open Dialog</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        accessibilityLabel="Confirm Deployment"
        className="rounded-2xl bg-white p-6 shadow-2xl backdrop:bg-slate-900/60 max-w-md w-full"
      >
        <View className="space-y-4">
          <Heading level={3} className="text-lg font-bold">Confirm Action</Heading>
          <Paragraph className="text-sm text-slate-600">Are you sure?</Paragraph>
          <View className="flex flex-row justify-end gap-3 pt-4">
            <Button onPress={() => setOpen(false)}>Cancel</Button>
            <Button onPress={() => setOpen(false)}>Confirm</Button>
          </View>
        </View>
      </Dialog>
    </>
  )
}
```

### Props
- `open: boolean`: Controlled open state.
- `onClose: () => void`: Callback triggered when dismissed via Escape key, backdrop click, or close action.
- `accessibilityLabel?: string`: Accessible title for screen readers.
- `accessibilityDescribedBy?: string`: Associated description text ID.
- `className?: string`: Scoped styles compiled via Hozo IR.

---

## 4. Platform Lowering

### Web Backend
- Emits native HTML5 `<dialog open>` element.
- Emits backdrop styling using modern CSS `::backdrop` pseudo-element.
- Traps focus within the dialog; handles `Escape` key natively.

### Native Backend
- Lowers to React Native `<Modal>` with `transparent={true}` and `animationType="fade"`.
- Uses accessible overlay views with `accessibilityViewIsModal={true}` to trap assistive touch cursors on iOS and Android.

---

## 5. Accessibility Verification Matrix

| Target Platform | Semantic Output | Expected AT Behavior | Verified Status |
|---|---|---|---|
| Web / Chrome + NVDA | `<dialog>` / ARIA | Traps focus, announces title, Escape closes | Tested in CI (axe-core) |
| Web / Safari + VoiceOver | Semantic DOM / ARIA | Traps focus, reads description, Escape closes | Tested in CI (axe-core) |
| iOS + VoiceOver | RN Modal / AccessibilityView | Traps VoiceOver swipe cursor, announces role | Tested in CI |
| Android + TalkBack | RN Modal / AccessibilityView | Traps explore-by-touch cursor, back button closes | Tested in CI |
