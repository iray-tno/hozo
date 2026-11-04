// This inventory is a contract for the dashboard, not a global feature universe.
// Inputs are status observations that have already passed their own assessors.
import { handleInputCases, tabInputCases } from './owner-input-cases.mjs'
import { viteCapturedScope, viteComparableRows, viteFallbackScope } from './vite-evidence.mjs'

const handle = 'bounded-handle-delivery-evidence'
const tabs = 'box-and-owned-label-host-delivery'
const bundle = 'explicit-component-bundle-react-native-peers-external'

const domains = [
  [
    viteCapturedScope,
    'vite-captured-vs-tailwind',
    'web',
    'matched fixture pair',
    viteComparableRows,
    (row) => row.matchedPairs,
  ],
  [
    viteFallbackScope,
    'vite-fallback-and-ordinary-vs-tailwind',
    'web',
    'matched fixture pair',
    viteComparableRows * 2,
    (row) => row.matchedPairs,
  ],
  [handle, 'handle-web-state', 'web', 'host-state row', 15, (row) => handleCount(row, 'webStates')],
  [
    handle,
    'handle-web-lifetime',
    'web',
    'lifecycle row',
    30,
    (row) => handleCount(row, 'webLifetime'),
  ],
  [
    handle,
    'handle-web-detents',
    'web',
    'input/route row',
    handleInputCases.length * 3,
    (row) => row.liveDetents?.webObservations,
  ],
  [
    handle,
    'handle-native-state',
    'native-host-model',
    'host-state/author row',
    24,
    (row) => handleCount(row, 'nativeStates'),
  ],
  [
    handle,
    'handle-native-lifetime',
    'native-host-model',
    'lifecycle row',
    8,
    (row) => handleCount(row, 'nativeLifetime'),
  ],
  [
    handle,
    'handle-native-detents',
    'native-host-model',
    'input/platform/route row',
    handleInputCases.length * 4,
    (row) => row.liveDetents?.nativeObservations,
  ],
  [
    handle,
    'handle-native-partial',
    'native-host-model',
    'phase/platform row',
    6,
    (row) => handleCount(row, 'nativePartial'),
  ],
  [
    tabs,
    'tabs-web-inputs',
    'web',
    'input/route row',
    tabInputCases.length * 3,
    (row) => row.inputDomain?.webObservations,
  ],
  [
    tabs,
    'tabs-native-inputs',
    'native-host-model',
    'input/route row',
    tabInputCases.length * 4,
    (row) => row.inputDomain?.nativeObservations,
  ],
  [bundle, 'native-component-bundle', 'native-build', 'bundle build', 2, (row) => row.bundleBuilds],
]

function handleCount(row, domain) {
  return row.domains?.find(({ key }) => key === domain)?.observations
}

export function scopedDenominators(observations, trackedChanges) {
  const byScope = new Map()
  for (const row of observations) {
    const matching = byScope.get(row.scope) ?? []
    matching.push(row)
    byScope.set(row.scope, matching)
  }
  return domains.map(([scope, id, platform, unit, expected, count]) => {
    const rows = byScope.get(scope) ?? []
    const row = rows[0]
    const status = trackedChanges
      ? 'uncommitted'
      : rows.length > 1
        ? 'conflicting'
        : !row
          ? 'missing'
          : row.status !== 'measured'
            ? row.status
            : count(row) === expected
              ? 'measured'
              : 'invalid'
    return {
      id,
      scope,
      platform,
      unit,
      expected,
      verified: status === 'measured' ? expected : null,
      status,
    }
  })
}
