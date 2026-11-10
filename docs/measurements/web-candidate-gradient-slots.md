# Web candidate gradients use the static registers

Continues #1230 / RFC010 after the
[Native candidate repair](native-candidate-gradient-slots.md).
No owner admission, audit promotion, default routing or ordering-policy change.

Separate runtime classes previously kept independent whole declarations:
colour/position-only rules could not reach a constructor in another class.
Two new candidate-register regressions failed against the previous addon;
the whole-image/unrelated-sheet control passed.

The candidate renderer now invokes the existing static gradient register
writer in candidate mode. Constructor, stop, position and via-removal
serialization remain one implementation. Nine non-inheriting registrations
come from the same registry as static output, once per sheet. A gradient plus
ordinary filter readers require 17, not the static full set of 49. Padding
and whole-image-only sheets still emit no new registrations.

**Deletion receipt:** removes the candidate-only whole-gradient assembly for
these ordinary contributions. The static same-condition literal fast path
remains; raw/whole-image reset rules keep their declarations. No browser
JavaScript, new class parser, context or environment subscription was added.

## Evidence

- Web Rust 225 tests pass with a regression for shared writers and the bounded
  registration family. Compiler suite: 536 passed / two platform skips,
  including three candidate-gradient tests and the existing filter controls.
- `examples/storybook-demo/scripts/candidate-cascade.test.mjs` compares
  independent Hozo and Tailwind documents: both class orders, colour and
  position changes, hover/focus/stacked via removal, class clearing/restoration,
  ordinary and candidate-owner routes, stable DOM identity, and a child with
  its own partial ramp. Removing the candidate sheet must change the result;
  restoring it must restore the result.
- Browser execution is remote-only. Syntax/format checks are not browser
  evidence. The existing Storybook workflow can run this fixture on the PR's
  branch without a new permanent PR-wide integration gate.

CPU1/Idle/serial, Node25/debug addon: a padding sheet is 325 raw/161 gzip
bytes with zero registrations. A constructor plus from-colour, hover to-colour
and focus position sheet is 2,720/470 with nine; a radial/from-colour plus
blur/sepia sheet is 3,322/508 with 17. These are raw candidate CSS sizes,
not application bundle or frame-time measurements.

This does not certify Native interpolation spaces or device pixels. The
browser fixture is bounded linear-gradient declaration evidence, not all
gradient syntax, animated endpoints or mixed static/dynamic ownership. Native
responsive/dark and conic/raw-CSS refusals remain unchanged. No global coverage
or six-axis score is promoted by registering this family.
