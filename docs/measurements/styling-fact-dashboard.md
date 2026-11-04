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

These are fixture observations, not the §6 denominators
for global coverage, fidelity, diagnostic completeness or contract audit.
In particular, a measured Native partial delivery does not turn the
decorative shape into a stateful host or certify operating-system behavior.

The Phase A dashboard and denominators item stays open: portable conformance
denominators and attributable diagnostic identities are not established by
this dashboard slice.
