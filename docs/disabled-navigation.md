# Unavailable destinations

`disabled` keeps the same meaning on Link, destination-bearing Button and
Pressable: unavailable, present in the accessibility tree and outside the
sequential keyboard order (decision 001). Navigation still has a link role;
a disabled destination is not changed into a button or removed from the tree.

On Web an anchor has no native `disabled` attribute. Compiled and value-level
hosts use `aria-disabled`, the shared `data-hozo-disabled` styling hook and
`tabIndex=-1`. Primary and auxiliary activation are prevented, not handed to
an authored handler. Reenabling restores the authored tabindex, or the
browser's default tab order when none was supplied. An explicit positive
tabindex cannot undo disabled. Programmatic focus remains possible, as for
Hozo's other synthesized controls; this is not an `inert` subtree.

The real href remains available for copying and the browser's context menu.
This is UI unavailability, not authorization or URL access control. Do not
use a disabled link to protect a resource. Without hydrated React handlers
or a mounted navigation provider, static HTML alone cannot suppress following
an anchor that retains href. A real action Button still uses the browser's
native disabled behavior even without hydration.

When a spread hides navigation or availability props, the compiler keeps the
component and its canonical props. It must not rename nativeID to id or
onPress to onClick before the component chooses its host. Layout/responder
Pressables keep their richer host and delegate to the same link implementation.
The navigation provider also prevents a marked disabled anchor from being
offered to a router or falling back to browser navigation.

Native continues to use the disabled Pressable/link host rather than DOM
attributes. Host-render tests cover prop/role preservation and transitions,
not real device keyboard or screen-reader behavior. This does not resolve
the platform/device limitations recorded in decision 001.
