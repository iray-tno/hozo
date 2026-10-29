# Connected copy gap authors retain interaction and async lifetimes

Test-only follow-up to [CodeCopy gap composition](code-copy-gap-composition.md),
continuing #1230. No production component, resolver, order, ABI or eligibility
changes in this layer. Merge the composition fix first.

## Actual interaction owner

Public CodeBlock's copyStyle joins the existing handler matrix through the
real public CodeClipboardProvider, not a direct private CodeCopy import.
The actual Pressable receives hover-in, press-in, press-out, hover-out, focus
and blur. Across 16 owner/class-source cases (15 distinct interaction slots),
four routes, three authors, seven frames and eight fixed Yoga layouts, all
**10,752 interaction observations** agree. The increase from 10,080 is the
new copy owner. No-author controls respond to the actual interaction facts;
generic/nested authored axes stay authoritative.

## Connection and clipboard operations

All four raw/literal/opaque/spread public routes use a frozen getter-valued
copy author. Without a ClipboardProvider, the getter throws if read and the
button must be absent. After connecting the actual public provider, one
button must expose the button role, Copy code accessible name and current
gap axes; its nested Text must not receive gap properties.

The tests drive five application-connected deferred clipboard requests per
route (20 total). Changing copy content retires pending feedback without
reverting the current style. Active completion changes the visible label to
Copied and calls the actual Native announcement hook. Replacing the provider
value retires another pending operation while preserving the mounted owner.
Removing the provider intentionally unmounts its subtree; settling the old
request neither announces success nor reads its disconnected author.
Reconnection has fresh gap values and Copy code feedback. A current rejection
announces Could not copy code rather than success. Exact request payloads and
announcement sequences are asserted, not merely absence of an exception.

This does not prove OS clipboard access or audible screen-reader delivery:
the application clipboard is a controlled promise and RN hosts/announcement
transport are stand-ins. Projection freshness is not a whole-app React
render-count or performance guarantee.

## Verification and limits

CPU1/Idle/serial: owner file **12 tests**, related owner/input-slot/dynamic-slot/
Alert/Native-host/cache selection **73 tests**, all passing with no skips.
Retained rest **10,272**, control/indicator **14,976** and conditional handle
**2,400** observations remain passing. Lint, generated docs, package metadata,
ABI (58 leaves, 81 names) and diff checks pass.

No full local root suite, browser/app/Metro build, Native device/pixel/Fabric/
AT or performance run, compatibility snapshot or headline coverage change.
CodeBlock body/rows/windowing/cache and separately owned #1289 are untouched.
Other gap boundaries remain before whole-family eligibility and old-path
removal. No changeset per user instruction; no whole six-group family closes.
