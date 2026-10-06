import { compileNative } from '@hozo/compiler'

export type ContextualVerdict = 'COVERED' | 'REFUSED' | 'SILENT'

export interface NativeContextualCase {
  candidate:
    | 'transition'
    | 'duration-200'
    | 'ease-in-out'
    | 'rotate-none'
    | 'scale-none'
    | 'translate-none'
    | 'transform-none'
    | 'transform-cpu'
    | 'not-disabled'
    | 'not-aria-checked'
    | 'not-motion-reduce'
    | 'not-focus'
    | 'not-focus-visible'
  purpose: string
  className: string
  props?: string
  expected: string[]
}

export interface NativeContextualResult extends NativeContextualCase {
  verdict: ContextualVerdict
  detail?: string
}

export const NATIVE_CONTEXTUAL_CASES: NativeContextualCase[] = [
  {
    candidate: 'not-focus',
    purpose: 'negated focus reuses the Pressable callback and opacity transition',
    className: 'opacity-100 transition-opacity md:not-focus:opacity-50',
    expected: ['HozoPressable', '__hozoBp_md && !(focused) &&', 'opacity: true'],
  },
  {
    candidate: 'not-focus-visible',
    purpose: 'negation alone enables modality inference using the same focus-visible state',
    className: 'opacity-100 md:not-focus-visible:opacity-50',
    expected: ['HozoPressable', '__hozoBp_md && !(focusVisible) &&', 'hozoFocusVisible'],
  },
  {
    candidate: 'not-disabled',
    purpose: 'a negated prop predicate composes with a breakpoint and existing interaction state',
    props: 'disabled={false}',
    className: 'opacity-100 md:hover:not-disabled:opacity-50',
    expected: ['__hozoBp_md && hovered && !((false)) &&'],
  },
  {
    candidate: 'not-aria-checked',
    purpose: 'the opposite ARIA state uses the same readable accessibilityState prop',
    props: 'accessibilityState={{ checked: false }}',
    className: 'opacity-100 md:not-aria-checked:opacity-50',
    expected: ['__hozoBp_md &&', '.checked === true)) &&'],
  },
  {
    candidate: 'not-motion-reduce',
    purpose: 'a negated supported environment query reuses its hook under a breakpoint',
    className: 'opacity-100 md:not-motion-reduce:opacity-50',
    expected: ['__hozoBp_md && !(__hozoEnv_motion_reduce) &&', 'useHozoEnvironment'],
  },
  ...(
    ['rotate-none', 'scale-none', 'translate-none', 'transform-none', 'transform-cpu'] as const
  ).map((candidate) => ({
    candidate,
    purpose: 'conditional transform control preserves the independent CSS transform slots',
    className: `translate-x-2 rotate-45 scale-95 rotate-x-30 md:hover:${candidate}`,
    expected: ['hozoTransformStyles', '__hozoBp_md && hovered &&'],
  })),
  {
    candidate: 'transition',
    purpose: 'default transition drives an interactive transform',
    className: 'transition hover:scale-95',
    expected: ['HozoPressable', 'duration: 150', 'transform: true'],
  },
  {
    candidate: 'duration-200',
    purpose: 'duration override drives an interactive background colour',
    className: 'bg-white transition duration-200 hover:bg-blue-500',
    expected: ['HozoPressable', 'duration: 200', 'colors: true'],
  },
  {
    candidate: 'ease-in-out',
    purpose: 'easing override reaches inherited Animated.Text colour',
    className: 'text-gray-500 transition ease-in-out hover:text-blue-500',
    expected: ["easing: 'ease-in-out'", 'HozoText', 'colors: true'],
  },
]

export function compareNativeContextual(testCase: NativeContextualCase): NativeContextualResult {
  const source =
    `import { Pressable } from '@hozo/core'\n` +
    `export function C() {\n` +
    `  return <Pressable accessibilityRole="button" ${testCase.props ?? ''} className="${testCase.className}">x</Pressable>\n` +
    `}\n`
  const [result] = compileNative(source)
  if (!result) return { ...testCase, verdict: 'SILENT', detail: 'no component compiled' }
  const refusal = result.diagnostics.find(
    (diagnostic) =>
      diagnostic.code === 'WEB_ONLY_PROPERTY_ON_NATIVE' ||
      diagnostic.code === 'NOT_WIRED_ON_NATIVE',
  )
  if (refusal) {
    return { ...testCase, verdict: 'REFUSED', detail: refusal.message }
  }
  const missing = testCase.expected.filter(
    (fragment) => !result.jsx.includes(fragment) && !result.runtimeImports.includes(fragment),
  )
  if (missing.length > 0) {
    return {
      ...testCase,
      verdict: 'SILENT',
      detail: `compiled without the expected lowering markers: ${missing.join(', ')}`,
    }
  }
  return { ...testCase, verdict: 'COVERED' }
}
