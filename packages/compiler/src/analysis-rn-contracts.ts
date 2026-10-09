import type { ReactNativeValueOutcome } from './analysis-rn-values.ts'
import type { ReactNativeBindingUsage, ReactNativeReference } from './index.ts'

/** A reviewed declaration subset, not proof that a particular call satisfies it. */
export interface ReactNativeMemberContract {
  status: 'reviewed-adapter-subset' | 'retained-guidance' | 'not-assessed'
  id?: string
  summary: string
  nextAction: string
  evidence?: readonly { implementation: string; tests: string }[]
}

// This is intentionally not another import-ownership table. A lookup is only
// allowed AFTER the actual origin and final source-run verdict have been joined.
// Missing entries mean unreviewed, not unsupported. No application is imported.
const adapters = new Map<string, Omit<ReactNativeMemberContract, 'status'>>()

function adapter(
  imported: string,
  file: string,
  members: Readonly<Record<string, string>>,
  nextAction: string,
) {
  for (const [member, summary] of Object.entries(members)) {
    adapters.set(`${imported}.${member}`, {
      id: `web:${imported}.${member}`,
      summary,
      nextAction,
      evidence: [
        {
          implementation: `packages/rn-compat/src/${file}.ts`,
          tests: `packages/rn-compat/src/${file}.test.ts`,
        },
      ],
    })
  }
}

adapter(
  'Platform',
  'platform',
  {
    OS: 'Web adapter reports "web"; this is not the Native OS value.',
    select:
      'Selects an explicit web key (including undefined), otherwise default; no native-key fallback.',
    Version: 'Web adapter reports the placeholder "0.0.0", not the browser or Native OS version.',
    isTesting: 'Reads process.env.NODE_ENV === "test"; not a device testing capability.',
  },
  'Check Web branch/fallback behavior and do not use Web Version as a real OS version. Verify the installed adapter matches this compiler review.',
)
adapter(
  'StyleSheet',
  'stylesheet',
  {
    create:
      'Preserves named object styles; freezes style objects outside production. No numeric style-ID registry.',
    flatten:
      'Recursively merges object/array styles, ignoring null, undefined and false; later properties win. Numeric style IDs are outside this subset.',
    compose:
      'Returns [first, second], preserving style precedence; DOM style consumption still needs normalization.',
    absoluteFill:
      'An object with absolute positioning and all four edges at zero, not a registered style ID.',
    absoluteFillObject: 'The same absolute-position object as absoluteFill.',
    hairlineWidth: 'Web hairline is 1 CSS pixel, not a device-pixel-dependent Native hairline.',
  },
  'Check object-style inputs and Web/Native units. A moved StyleSheet import does not validate CSS properties or DOM style-array consumption.',
)
adapter(
  'Keyboard',
  'keyboard',
  {
    dismiss:
      'Blurs document.activeElement when possible; a safe no-op without a document. Not a software-keyboard visibility guarantee.',
    isVisible: 'Always false on Web; this does not establish that a software keyboard is absent.',
    metrics: 'Always undefined on Web; software-keyboard geometry is unavailable.',
    addListener:
      'Returns a removable no-op subscription; no keyboard lifecycle events are emitted.',
    removeListener: 'No-op; Web keyboard lifecycle listeners are not installed.',
    removeAllListeners: 'No-op; Web keyboard lifecycle listeners are not installed.',
  },
  'Do not depend on Web keyboard events or geometry for layout. Test focus/blur behavior separately and retain platform-specific behavior where needed.',
)
adapter(
  'Dimensions',
  'dimensions',
  {
    get: 'Reads window/screen snapshots; browser viewport/devicePixelRatio, fontScale 1, server zero sizes until supplied. Only window/screen keys are defined.',
    addEventListener:
      'Only change subscriptions are defined; remove() detaches the subscription. The checked fixture covers shared server snapshots, not device resize behavior.',
  },
  'Check the window/screen key and change event, SSR assumptions and browser resize behavior. No device or layout correctness is certified.',
)

const retained = new Map<string, string>([
  [
    'Animated.timing',
    'Keep an RN-compatible animation backend for this call, or redesign the animation with a separately validated Web/Native path. Animated.View lowering alone does not supply timing.',
  ],
  [
    'Animated.Value',
    'Keep the Animated value backend until the value creation, subscriptions and animation consumers are migrated together. A compiled Animated.View is not a value engine.',
  ],
  [
    'Animated.createAnimatedComponent',
    'Review the wrapped component and its animation backend together; lowering a JSX Animated.View does not replace this factory.',
  ],
  [
    'LayoutAnimation.configureNext',
    'Review layout-animation requirements on each platform. Keep the backend or implement and verify an explicit alternative; no equivalent replacement is applied here.',
  ],
  [
    'LayoutAnimation.Presets.easeInEaseOut',
    'Migrate the preset and configureNext consumer together; copying this preset reference does not create a Hozo layout-animation backend.',
  ],
  [
    'Alert.alert',
    'Review alert buttons, cancellation and focus behavior before selecting a dialog alternative. Do not mechanically replace this call with window.alert.',
  ],
  [
    'AppState.addEventListener',
    'Review foreground/background event semantics per platform before adapting to browser visibility/focus events; they are not interchangeable.',
  ],
  [
    'AppState.currentState',
    'Review the application lifecycle state requirement per platform; browser visibility is not automatically the same state.',
  ],
  [
    'Linking.openURL',
    'Review the URL, platform and router/external-navigation intent before choosing a Hozo navigation integration; this call is not rewritten.',
  ],
  [
    'Image.resolveAssetSource',
    'Review asset resolution and bundler outputs on each platform; an Image component rewrite does not replace this asset API.',
  ],
])

function unknown(summary: string): ReactNativeMemberContract {
  return {
    status: 'not-assessed',
    summary,
    nextAction:
      'Inspect this authored reference and the actual target API; no compatibility or unsupported-API verdict is inferred.',
  }
}

export function reviewReactNativeMember(
  binding: ReactNativeBindingUsage,
  reference: ReactNativeReference,
  outcome: ReactNativeValueOutcome,
): ReactNativeMemberContract {
  if (outcome.disposition === 'not-assessed' || !outcome.emittedSpan)
    return unknown('No assessed final reference/origin; a known spelling is not evidence.')
  if (
    binding.kind !== 'import' ||
    binding.imported === '*' ||
    binding.imported === 'default' ||
    reference.access !== 'static-member' ||
    !reference.member
  )
    return unknown(
      'Only direct named-import static members are reviewed; values, forwarding, namespace/default and dynamic access remain unreviewed.',
    )
  const key = `${binding.imported}.${reference.member}`
  const contract = adapters.get(key)
  if (
    outcome.disposition === 'rewritten-to-hozo' &&
    outcome.replacement === '@hozo/rn-compat' &&
    contract
  )
    return {
      ...contract,
      status: 'reviewed-adapter-subset',
      // Do not expose registry objects to consumers who mutate report JSON.
      evidence: contract.evidence?.map((item) => ({ ...item })),
    }
  const nextAction = retained.get(key)
  if (outcome.disposition === 'remains-react-native' && nextAction)
    return {
      status: 'retained-guidance',
      id: `rn:${key}`,
      summary:
        'This reference is still RN-backed. Guidance is a migration review, not a verdict that RN or the API is unsupported.',
      nextAction,
      evidence: [
        {
          implementation: 'packages/compiler/src/lower.ts',
          tests: 'packages/compiler/src/rn-contract.test.ts',
        },
      ],
    }
  return unknown(
    'No reviewed member contract matches this actual origin and member. Import movement alone does not certify the API.',
  )
}
