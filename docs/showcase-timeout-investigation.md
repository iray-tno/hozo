# Showcase route timeout observations

These are retained failures, not retries selected away by the 0.3.0 release.
Successful later runs do not establish a zero-flake rate or explain every
earlier failure.

## Android: System UI blocks the first SVG story

[Run 38532959644](https://github.com/iray-tno/hozo/actions/runs/38532959644)
completed APK installation (32,152 ms) after the framework/package readiness
probe (600 ms). The SVG scenario timed out before recording a functional check.
Its `failure.xml` and screenshot contain the Android-owned alert title
`System UI isn't responding`, with `Close app` and `Wait` buttons.

`logcat.txt` records the app activity start at 08:25:47.147, its display at
08:25:49.814 and React Native's Storybook Linking event for
`svg-filter-pixels--color` at 08:25:51.538. Therefore the URI reached JavaScript;
the generic missing-story timeout alone was misleading. The failure capture
shows a blocking system dialog, not a directly observed SVG rendering failure.
This does **not** identify why System UI became unresponsive or certify the SVG
pixels hidden behind it. No ANR stack/pressure report was retained in this
non-diagnostic run; the log buffer has no explicit `ANR in` entry. A library
regression, host load and cold-boot system work are not interchangeable claims.

The driver now fails explicitly when this exact OS alert is observed, even if
the requested label is also present behind it. It does not dismiss the alert,
tap Wait, retry the route or relaunch the app. CPU, pressure, input and system
ANR reports are collected once on failure, including in functional runs.

## iOS: OS route command fails before the UI wait

[Run 38532936484](https://github.com/iray-tno/hozo/actions/runs/38532936484)
passed the counter, actual Storybook selector, disabled button and form checks.
`simctl openurl` for `patterns-shared-showcase--preferences` then returned
`NSPOSIXErrorDomain` code 60 (`Operation timed out`). The driver never reached
its Preferences AX wait. The screenshot still shows the saved Profile form.
The old `failure.json` was the last successful AX read, not a newly captured
post-failure tree; it must not be treated as fresh evidence of app response.

The app-only syslog records prior Disabled/Form URI deliveries, not this
Preferences delivery. That supports investigating the command/OS handoff,
but absence from one filtered log is not proof of an application-free cause.
OS-side logs/route acknowledgement and current UI were missing from the old
structured evidence. The driver now records command output, error, elapsed
time and the separate UI-ready phase per route, and labels failure-tree
freshness. No command is automatically resent after an ambiguous timeout.

## What remains

The approved main dry run
[38538010634](https://github.com/iray-tno/hozo/actions/runs/38538010634) and tag
release [38544726512](https://github.com/iray-tno/hozo/actions/runs/38544726512)
succeeded on both platforms. The differing source commits and all original
failed runs remain in the release evidence; these successes are not a
controlled explanation of OS failure frequency.

The new deterministic tests cover recorded failure shapes and evidence/state
handling, not fresh Simulator/Emulator execution. Actual device smoke is still
required for a functional claim. Route/UI/pixel deadlines, functional checks,
release signing and the deployment gate are unchanged. Gate separation or a
delivery/readiness fix needs stronger causal measurements; a timeout alone
does not justify either.
