# Transform composition across runtime candidate classes

Continues #1230 / RFC 010 section 7C. Native's generated candidate map already
uses `hozoTransformStyles` to combine transform axes. Web's candidate sheet
wrote one literal declaration per utility: `translate-x-2 translate-y-3` lost
one axis, and `scale-50 scale-x-75` lost the scale's Y contribution.

The candidate renderer now asks the existing static register writer to use
registers for each transform contribution even within one condition. Static
nodes retain the existing split-condition decision. Literal and candidate
paths share the same axis readers, values, blocking predicates and property
registrations; there is no new class parser, rank table or JS runtime engine.
Registrations are non-inheriting and emitted once per candidate sheet. A sheet
without drawable transform axes emits none.

This scope is translation, scale, skew and the existing function-transform
axes, the domain Native already composes. That initial layer excluded filters
until the Native runtime gap was repaired. A later layer connects
[ordinary Web candidate filter functions](web-candidate-filter-slots.md)
to this same static register writer.
Raw/whole-value transforms retain their existing blocking path. This does not
prove arbitrary raw forms or mixed static-plus-dynamic contribution parity.
Owner admission, text defaults and audits are unchanged.

## Evidence and cost

On Windows, CPU1 / Idle / serial, with a fresh debug addon:

- All 223 Web Rust tests pass. The added regression checks real candidate
  declarations, one non-inheriting registration set, and registration-free
  ordinary/filter-only sheets.
- The compiler regression checks generated Web register readers and executes
  the actual generated Native map against its real transform composer, in both
  class orders: X8/Y12, scaleX0.75/scaleY0.5.
- The existing browser candidate suite now compares independent Tailwind and
  Hozo documents, including class-order reversal, removal/restoration, stable
  hosts, a child with its own axis and exact stylesheet-removal controls.
  Browser execution is CI-only; no local pixel result is claimed here.
- The two raw Web sources are explicit cache inputs for the affected tests;
  the root source-input guard prevents replay of old successes after a change
  to the register writer.

An unbundled six-transform candidate sheet grows **803 -> 5,737 bytes**,
**248 -> 651 gzip bytes**. This includes the existing complete registration
set, emitted once, plus variable writers/readers. A padding-only sheet stays
**317 / 159 raw/gzip bytes**. These are real CSS-byte costs, not free
compatibility or an application/device performance result. No generated Native
engine code changes in this layer.
