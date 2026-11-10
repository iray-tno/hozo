# Native development bundle allowance

Measured on Windows on 2026-11-10 with one logical CPU at Normal priority.
The maintainer approved accepting feature growth for
[#1737](https://github.com/iray-tno/hozo/issues/1737). The development
Hozo-module allowance increases from 510,000 to **530,000**.

## Scope and measurement

The existing development gate sums JavaScript `module.length` over Metro
modules whose debug names identify workspace `packages/`, excluding
`node_modules`. Its historical "bytes" metric is UTF-16 code units rather
than UTF-8 file bytes. This update preserves that metric and compares the
same quantities across the retained baselines and fresh builds.

Fresh builds used main `0c707f5f`, a rebuilt native addon and rebuilt workspace
packages. The Metro commands reset the transform cache:

```sh
pnpm --filter @hozo/compiler build:native
pnpm exec turbo run build --filter='./packages/*'
pnpm --filter @hozo/example-native-demo exec node scripts/bundle.mjs
pnpm --filter @hozo/example-native-demo exec node scripts/check-bundle.mjs
pnpm --filter @hozo/example-native-demo exec node scripts/bundle.mjs --platform android --out budget-android.bundle
```

The old 510,000 gate rejected the fresh iOS result before the ceiling changed.
The retained last accepted census comes from `cb0e9c83`; the original #1737
bundle comes from `324d8727`. No historical dependency installation or rebuilt
historical source is substituted for those saved measurements.

| Development output | Hozo metric | Modules | Actual UTF-8 Hozo bytes | Whole bundle UTF-8 bytes |
| --- | ---: | ---: | ---: | ---: |
| Accepted baseline `cb0e9c83`, iOS | 505,291 | 146 | Not retained | Not retained |
| Original issue `324d8727`, iOS | 514,356 | 147 | 514,444 | 4,737,580 |
| Current `0c707f5f`, iOS | 515,116 | 147 | 515,204 | 4,738,296 |
| Current `0c707f5f`, Android | 515,124 | 147 | 515,212 | 4,754,606 |

The new allowance leaves **14,884** on iOS and **14,876** on Android. The
check still rejects the boundary itself (`< 530_000`). The independent barrel,
whole-bundle, binding, style/theme and production-increment checks remain in
place. The allowance accepts measured development code growth.

## Attribution against the accepted baseline

The iOS delta is **+9,825** (+1.94%). Every module is matched by its normalized
debug path, including additions and removals; module deltas sum exactly to the
package totals below.

| Package | `cb0e9c83` | `0c707f5f` | Delta |
| --- | ---: | ---: | ---: |
| patterns | 120,981 | 127,505 | +6,524 |
| form | 100,313 | 102,993 | +2,680 |
| behaviors | 58,961 | 59,430 | +469 |
| primitives | 69,462 | 69,622 | +160 |
| engine | 70,298 | 70,292 | -6 |
| semantics | 37,483 | 37,481 | -2 |
| Other four packages | 47,793 | 47,793 | 0 |
| Total | 505,291 | 515,116 | +9,825 |

The largest module changes explain the growth:

- Generated pattern slot constants add 5,217; the former non-control constants
  module is removed (-725). These are the owner-profile constants introduced
  by `d81a0619`, replacing component-local facts.
- Generated form owner constants add 2,030, with calendar (+375), time-picker
  (+190) and class-fact (+85) changes. `b25a1e3e` and `320f2e0b` introduced the
  shared button/calendar profiles.
- ColorPicker rules add 1,185 and its Native component adds 375 for contrast,
  RTL marker/gradient behavior and Native gradient output (`205b7a66`,
  `82c24723`, `7e7ef36d`).
- Native Dialog adds 593 for its heading name, backdrop press and scrim child
  handling (`fd2f7613`, `1585408e`, `920b3bdc`).
- Native text-child handling adds 478 for text normalization through React
  Fragments; foundation adds 167 for Button accessibility-state forwarding and
  disabled-state merging. Smaller changes and reductions complete the totals.

Both fresh platforms have zero watched re-exporting barrels. No runtime
implementation changes are part of this allowance update.

## Separate production measurement

```sh
pnpm --filter @hozo/example-native-demo exec node scripts/measure-production.mjs
```

The existing minified, non-development Android measurement passed:

| Production output | Raw UTF-8 bytes | gzip bytes |
| --- | ---: | ---: |
| Full acceptance app | 1,094,939 | 270,551 |
| Matched Hozo screen | 891,067 | 215,501 |
| Matched Native screen | 889,194 | 215,004 |
| Hozo increment for the matched screen | +1,873 | +497 |

The matched screens exercise the same small UI; their delta does not price
every runtime-backed component in the acceptance app. The independent production
ceilings remain 8,000 raw / 3,000 gzip bytes of additional Hozo code. Development
module growth is not presented as a change in this production increment.

## Validation and limits

`pnpm lint` passed. The first root test run found a stale local WASM artifact
from October 28; rebuilding it with `pnpm build:wasm` made binding parity pass
9/9 without changing source or assertions. The subsequent root `pnpm test`
passed 41/41 package tasks, packing for 24 packages, 149/149 publishing checks,
and the Native demo's development, Canvas and production gates.

That run then failed Landing's stale `peer-checked:` verdict assertion,
tracked in [#1871](https://github.com/iray-tno/hozo/issues/1871). With all tracked
files restored to unmodified main, the same built landing output reproduced
the failure. The direct StyleX continuation passed. The direct component audit
failed on a closed Google Analytics POST at radio-group: 8 pages passed,
1 failed and 32 were not visited. This separate occurrence is tracked in
[#1872](https://github.com/iray-tno/hozo/issues/1872); the original failure and
request receipt remain failed results.

Remaining integration, with Landing excluded, passed 34/34 tasks in
11m47.968s (29 cached), including both Native Showcase exports, Storybook's
297 tests, 206 axe cases, 103 appearance checks and shared interactions.
`pnpm docs:check` passed. This is not a claim that the full root test is green.

## Retained receipts

Fresh bundles, module census/deltas, old-gate failure and production logs are
under `artifacts/native-budget-1737/`. The accepted census is retained in
`artifacts/native-budget-expansion/module-sizes.json`, SHA-256
`e32ba54c91d28c82d6a5ee6237ef01b97bc3212642760288f32ee7cbe01f23fc`.
The original issue bundle is retained under
`artifacts/audit-preparation-root-cause/native-baseline.bundle.js`.
