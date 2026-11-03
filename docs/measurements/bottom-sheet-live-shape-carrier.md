# BottomSheet Native: live-shape carrier prototype

A test-only callback composes two real compiler carriers through the existing
private `hozoHandleStyle` prop. The mounted component supplies interaction
state on the Pressable and `undefined` on the decorative View. No caller-side
detent heuristic is needed. In both Native host models, changing detents
while hovered selects the decorative carrier, then a fresh interactive host
returns to rest and can hover again. Authored gap survives every transition.

This is a prototype of host-side carrier selection, not a change to caller
lowering. The fixture supplies a separately specified state-independent
decorative recipe; it does not prove that one authored stateful recipe can
be compiled for both destinations.

For a compiler follow-up, prefer an explicit private ABI capability over
inferring shape identity from arbitrary callback inputs. If a shape cannot
compile the original recipe, preserve its ordinary resolver behavior and
diagnostics rather than removing unsupported variants from the recipe.
Exercise absent/retained owners, live shape changes, author precedence,
stale callbacks and resolver call counts before allowing any new admission.
Keep the existing all-shapes rule for contracts without such a capability.
