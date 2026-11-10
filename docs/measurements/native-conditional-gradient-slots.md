# Native gradient registers across active conditions

Part of #1230 and RFC 010's register-composition boundary. No owner admission,
audit promotion, default routing or class-order policy change.

## Failure and repair

On main `1fee98e1`, `bg-linear-to-r from-red-500 to-blue-500
md:bg-linear-to-b hover:from-green-500` lost the active bottom direction
when hovered at md: the hover object's copied base restored the right direction.
Independent position changes and a constructor plus a colour without a base
also lost contributions. Four of the first five new compiler regressions
failed against that freshly built addon; the direct-path control passed.

For two conditional groups writing different gradient fields, Native now
emits metadata beside the actual style objects and composes selected image,
stop-colour and stop-position registers. The existing IR writer supplies
values, constructor normalization and defaults. The helper neither parses
classes nor ranks conditions. It preserves original object identities for
filter and transform composition and respects a caller's whole-image style.

**Deletion receipt:** the old copied-base gradient branch is bypassed at these
independent-register boundaries. It is retained for a single conditional
group, same-field constructor replacements and animated endpoints; those
are not dead reference code. Candidate maps remain a separate follow-up.
Conic and unassessed non-percent positions do not acquire partial metadata.
Numeric opaque RN styles retain the old whole-property result.

## Receipts

- `packages/compiler/src/conditional-gradient-slots.test.ts`: six tests execute
  emitted callbacks, reversed class order, inactive conditions, direction,
  positions, via removal, absent constructors, author overrides and combined
  filter/transform output. Removing composition makes the equality fail.
  Animation and conic refusal controls retain their existing paths.
- `packages/tailwind/src/native-gradient-slots.test.ts`: actual Tailwind
  position writers independently supply 25%/80% expectations for the emitted
  Native callback. This is declaration evidence, not colour-space or pixels.
- `packages/engine/src/gradient-slots.test.ts`: five tests cover frozen
  identities, nested arrays, raw/none images, register revival, via removal,
  caller precedence, opaque style IDs and a preindexed map that rejects scans.
- CPU 1 / Idle / serial: Native Rust 365 passed; compiler 526 passed / two
  skipped; engine 109 and Tailwind 250 passed. Fresh addon used for JS tests.

The regression tests and this measurement stay as maintained evidence, not
temporary spike instrumentation or a default-adapter switch.

## Cost and remaining scope

Node 25 / debug addon / esbuild: the isolated helper leaf is 786 minified bytes
/ 460 gzip bytes. The example above emits 506 JSX bytes / 209 style bytes.
A warmed 50,000-call loop over three styles/metadata entries took 48.75ms,
checksum 200,000. This includes per-call indexing, not React rendering, Yoga,
GPU work, frame time or application speed. Direct single-group boundaries
import no helper; there are no contexts or subscriptions.

Native's existing AOT output strips interpolation clauses such as `in oklab`;
this change does not claim Tailwind colour-space or device-pixel equality.
Runtime candidates, mixed static/dynamic boundaries, animated endpoints and
shadow/drop-shadow registers remain distinct follow-ups. No global coverage
or six-axis progress score is promoted by this scoped declaration repair.
