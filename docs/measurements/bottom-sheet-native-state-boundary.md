# BottomSheet Native state: published caller boundary

The published `BottomSheet.handle` Owner has two shapes. A resizable handle
receives interaction state on a Pressable; a decorative View does not. The
explicit Native caller preview currently requires an equivalent carrier for
every declared shape. The existing state-independent recipe passes that
requirement. The measured hover/focus/active recipe does not: the preview
retains the original call with `shape-unassessed` instead of installing a
carrier that would give the decorative host unsupported state.

The published-manifest fixture runs the unchanged call and checks that it
reaches the runtime candidate resolver. On each of the Android and iOS host
models, it measures rest and six callback transitions on the same interactive
host. It checks padding, opacity, background, and the authored gap throughout.
The observations live in `stateFallback` in `handle-inputs-native.json`.

This is a tested fallback, not prepared state delivery or device evidence.
The direct-carrier fixture still measures that separate route. Neither the
audit declaration nor default routing changes.

For prepared state delivery, first design how a carrier is selected from the
actual live shape, including changes in detents after mount. Any design must
preserve the decorative path's behavior and keep existing author precedence.
Do not relax the all-shapes equivalence check merely to admit this recipe.
