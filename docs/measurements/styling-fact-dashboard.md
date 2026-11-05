# Styling fact dashboard

Owner Evidence publishes the machine-readable `styling-fact-status` artifact
and a job summary from that same report. To render a downloaded report:

```sh
node scripts/style-slots/status-summary.mjs artifacts/style-fact-model/styling-fact-status.json
```

Each row names its evidence scope, platform/model, unit, expected count and
verified count. A missing, stale, failed, dirty or conflicting receipt has no
verified count. Host-state, lifecycle, route and build counts cannot be added.
The external-peer component bundle reports bytes separately from its two-build
denominator; it is neither the Metro bundle proof nor an application budget.

The registry can accept further assessed scopes without changing the report
format. The rows cover the current BottomSheet and Tabs evidence, a component
build pair and actual Vite browser fixtures. Vite has separate captured and
ordinary/fallback comparisons against Tailwind: 15 and 30 matched
widget/phase/route pairs respectively. Stylesheet-removal controls are
required but do not count as matching pairs.

Metro has a separate four-build denominator: Android and iOS, each with the
partial-owner opt-in and the ordinary build. The production bundles run
BottomSheet styling code with Native host stand-ins. The receipt records carrier
delivery, decorative fallback, the missing-state diagnostic, and the
interactive hover result. It does not certify device behavior or count towards
the external-peer size comparison.

The same Metro probe also checks an opaque class value from an installed
dependency without a manifest. The dependency must resolve its Android/iOS
export, receive no prepared carrier, and agree with the neighboring literal
on rest, hover, decorative fallback, and the authored padding override. This
is an exclusion control inside each build, not four more builds or permission
to enable the route by default. The dashboard reports these controls
separately: older build-only receipts cannot satisfy them, and partial or
wrong-platform controls have no verified count.

A second exclusion control checks a local Metro-reachable sibling omitted
from caller preflight. Even an identical literal class must stay ordinary
there, while its captured neighbor may receive the carrier. This separates
caller identity from the opaque-input restriction; it is not general graph
discovery evidence.

The Metro probe also runs two separate budget-fallback builds (one per
platform) after the opt-in build in the same fixture. An actual edge-budget
refusal must return to ordinary output with neither captured nor uncaptured
carriers, while preserving the same styles and missing-state diagnostic.
The dashboard verifies both `budgetFallbacks` rows separately from the
four-build count, including the refusal reason, absence of carriers,
and continued opaque and uncaptured input behavior. The experiment is
not the default.

The partial-owner opt-in bundle consumes a capture observed from the
preceding ordinary Metro bundle's actual resolver context. The fixture
still supplies an exact anchor, origin list, and explicit subpaths; it
does not discover them automatically. The observer does not change the
ordinary build's output. Capture identity and route count are retained
in the raw opt-in rows. A failed ordinary build does not publish a capture
even when its resolver reached the anchor before failing.
The dashboard counts Android and iOS separately from the four-build total
only when each opt-in capture is linked to its platform's ordinary bundle
hash and records a valid bounded route count.

These are fixture observations, not the §6 denominators
for global coverage, fidelity, diagnostic completeness or contract audit.
In particular, a measured Native partial delivery does not turn the
decorative shape into a stateful host or certify operating-system behavior.

The Phase A dashboard and denominators item stays open: portable conformance
denominators and attributable diagnostic identities are not established by
this dashboard slice.
