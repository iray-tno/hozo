# Menu popup layer (#1035)

The Menu owner audit found a real hit-test failure: a later sibling stacking
context intercepted the opened popup despite its positioner's `z-50`.

## Choice

Opt only Menu into `FloatingPositioner.topLayer`. The positioner's existing
DOM host becomes a `popover="manual"`, shown before the existing positioning
effect measures it. Its UA panel box is reset to a transparent positioning
box; the existing panel classes continue to own appearance. Other floating
consumers remain inline by default.

This is a rendering mechanism, not the Hozo Popover widget and not a modal.
Menu keeps its role, disabled action guards, keyboard navigation, dismissal
and readiness-based focus. The browser removes disconnected popovers from
its layer; unmount does not call hidePopover and add competing focus return.
StrictMode's repeated setup does not repeatedly show an already open host.

## Why not a larger z-index or a body Portal?

A descendant z-index cannot escape its ancestor stacking context. A body
Portal can escape that context, but breaks DOM CSS ancestry: inherited
typography, scoped custom properties, dir/lang and descendant selectors then
need a separate preservation policy. Moving into a modal ancestor's inert/
focus boundary is another concern. Native CSS top-layer rendering keeps DOM
ancestry, so live theme changes remain ordinary CSS, not an observer/copy
engine. No additional host, provider, timer or event listener is introduced.

The [CSS top-layer specification](https://www.w3.org/TR/css-position-4/#top-layer)
defines ancestor opacity/clipping independence. The
[HTML popover model](https://html.spec.whatwg.org/multipage/popover.html)
provides the non-modal manual mechanism; its
[UA style rules](https://html.spec.whatwg.org/multipage/rendering.html#flow-content-3)
explain why the positioning host needs its neutral box reset.

## Boundaries

- Native Menu remains its existing Modal, with the same facts and string
  label styles. No new Native focus, OS dismissal or window behavior is
  claimed. Cross-platform owner tests remain in force.
- showPopover-capable browsers get the layer fix. Engines lacking that API
  retain the previous inline behavior, with one warning that ancestor
  clipping/stacking limitations remain. This is not an old-browser layer
  polyfill or an assertion of identical rendering on unsupported engines.
- The top layer follows browser ordering, not arbitrary author z-index over
  other top-layer entries. Dialog/nested-layer behavior is tested separately
  from ordinary sibling stacking contexts.
- No other popup widget is opted in by this change.

## Evidence required

Actual pointer/elementFromPoint checks with adjacent opacity contexts and
transformed/clipping ancestors; exact original overlap without fixture
spacing; raw and compiled literal/opaque/mixed paths in both CSS orders;
live ancestor theme/font/dir/descendant-selector inheritance; position
alignment after scroll/resize; disabled actions; first/last focus, keyboard
activation, reopen, outside-click and Escape return; nested native dialog;
StrictMode cleanup and unsupported-API warning/inline fallback. A passing
style comparison alone is not hit-testing evidence.
