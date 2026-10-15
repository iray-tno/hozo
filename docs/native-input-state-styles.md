# Native TextInput state styles

Static `focus:` and `focus-visible:` on a TextInput use the actual field's
focus/blur events. Supported negation, ambient and read-only stacks reuse
the compiler's existing condition guards. The generated `HozoTextInput`
consumes a private `hozoStyle` callback; an authored style remains last.
All field props, caller handlers and the native ref still reach one RN
TextInput, without a View, Pressable, context provider or animation host.
Inputs with no focus conditions or opaque class expressions remain direct RN
TextInput in compiled code. A dynamic class expression instead uses the same
field helper and candidate resolver, receiving only `focused` and
`focusVisible` as interaction facts. Missing hover/press or semantic drivers
are named once per candidate, not silently interpreted as measured false.
This includes the current source-distributed `@hozo/ui Input`; its themed
runtime focus classes now follow the real field, not an ancestor.

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
The UI Input explicitly supplies disabled, editable, readOnly and
`aria-invalid` drivers to static and dynamic styles. `aria-invalid:` is not
a default Tailwind variant; use its supported `aria-[invalid=true]:` spelling.
Both boolean true and the string "true" match, not false, grammar or spelling.
Native's invalid border reads that authored prop, not an invented
`accessibilityState.invalid`. RN has no corresponding invalid attribute, so
the Native adapter consumes it for styles only; this does **not** claim that
VoiceOver or TalkBack announces invalidity. Use the field's error/description
contract and verify assistive behavior independently.

A canonical disabled input disables editing and reports the disabled state
on Native. Its prop adapter is shared by value-level and generated hosts,
preserving existing accessibilityState keys. Read-only alone does not become
disabled. A defined readOnly wins over editable, matching RN, and a disabled
input cannot re-enable editing by passing readOnly=false. Static and runtime
read-only styles share one predicate; a disabled field is non-editable, while
the disabled semantic fact remains separate.

#887 still leaves the resize/cursor policy and full static UI rewrite open.
Host stand-ins establish lowering, state and ref/handler forwarding;
they do not certify physical keyboard delivery, assistive focus or pixels.
