# Native TextInput state styles

Static `focus:` and `focus-visible:` on a TextInput use the actual field's
focus/blur events. Supported negation, ambient and read-only stacks reuse
the compiler's existing condition guards. The generated `HozoTextInput`
consumes a private `hozoStyle` callback; an authored style remains last.
All field props, caller handlers and the native ref still reach one RN
TextInput, without a View, Pressable, context provider or animation host.
Inputs with no focus conditions remain direct RN TextInput in compiled code.

TextInput paints its value. Its own font and color styles must not be
forwarded to nonexistent JSX text children; the compiler now keeps them on
the field, including in focus callbacks. This does not claim new inheritance
from an unrelated ancestor or create an ancestor interaction context.

A typing field's focus indication is not a button's pointer policy.
[Selectors 4 §9.4](https://www.w3.org/TR/selectors/#the-focus-visible-pseudo)
suggests indicating focus on keyboard-input fields, including fields that
bring up a virtual keyboard. The
[WAI focus-visible technique](https://www.w3.org/WAI/WCAG22/Techniques/css/C45.html)
also distinguishes inputs from pointer-focused buttons. Browser heuristics
are not a Native API or an exact cross-platform guarantee. Hozo's shared
tracker has a `keyboard-input` mode: input focus is visible until blur;
pointer input does not clear it. Existing button modality is unchanged.

Hover/press, focus-within and their unsupported negations still diagnose on
TextInput. The compiler does not guess those facts from an outer Pressable.
This is the focus slice of #887, not completion of the UI Input rewrite:
aria-invalid, internal disabled drivers and the resize/cursor policy remain
separate. Host stand-ins establish lowering, state and ref/handler forwarding;
they do not certify physical keyboard delivery, assistive focus or pixels.
