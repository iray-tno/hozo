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

## Published partial path

An explicit instance-project opt-in now selects the partial ABI from the
published manifest. It leaves the authored class attribute intact for the
decorative resolver and emits one stylesheet for the interactive carrier.
The status artifact reports six observed transitions across Android and iOS
host models, separately from the direct-carrier state matrix. Evidence is
only counted for the current clean source and manifest. No ordinary adapter
opts in, and this does not certify the owner or operating-system behavior.
