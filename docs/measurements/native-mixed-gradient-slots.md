# Native mixed gradient composition

Part of #1230 / RFC010, extending the
[mixed shadow boundary](native-mixed-shadow-slots.md). Native View and
Pressable without spreads or animation now compose assessed linear/radial
image, colour and position fields across static and runtime classes.
The same element can defer both the shadow and gradient writers without
deferring its other effects.

Candidate tables keep real selected object identities even if the
namespace has only a constructor and no gradient helper import. The
compiled site requests just the affected families. The resolver shares
its existing selection and caches each used deferred resting result
independently from the ordinary one. Tier order and explicit caller
style precedence are unchanged; no new class parser, sort or subscription.

The emitted-output tests cover both constructor/stop directions,
simultaneous shadow and gradient composition, interactive state updates,
explicit backgroundImage override, and cache isolation. An intentionally
premature resolver call loses stops and fails the comparison. The
scope does not include conic/unassessed positions, animated or
spread-bearing sites, other mixed families, or device pixels.
