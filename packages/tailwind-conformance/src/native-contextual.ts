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
    | 'not-hover'
    | 'not-active'
    | 'pressed-text-owner'
    | 'descendant-not-active'
    | 'descendant-not-hover'
    | 'descendant-focus-visible'
    | 'descendant-not-focus-visible'
    | 'group-focus-visible'
    | 'not-md'
    | 'not-dark'
    | 'not-min-[500px]'
    | 'not-max-[500px]'
    | 'not-@md'
    | 'not-@max-md'
    | 'not-@min-[400px]'
    | 'not-@md/main'
    | 'container-interaction-host'
    | 'container-descendant-owner'
    | 'link-interaction'
    | 'link-descendant-owner'
    | 'link-container-owner'
  purpose: string
  className: string
  props?: string
  primitive?: 'Pressable' | 'View' | 'Button' | 'Link'
  children?: string
  expected: string[]
}

export interface NativeContextualResult extends NativeContextualCase {
  verdict: ContextualVerdict
  detail?: string
}

export const NATIVE_CONTEXTUAL_CASES: NativeContextualCase[] = [
  {
    candidate: 'not-active',
    purpose: 'negated pressed alone drives the existing transition under stacked predicates',
    primitive: 'Button',
    props: 'disabled={false}',
    className: 'opacity-100 transition-opacity md:not-disabled:not-active:opacity-50',
    expected: ['HozoPressable', '__hozoBp_md && !((false)) && !(pressed) &&', 'opacity: true'],
  },
  ...(['Button', 'Pressable'] as const).map((primitive) => ({
    candidate: 'pressed-text-owner' as const,
    purpose: `${primitive} supplies inherited pressed state to raw text instead of emitting an unused style`,
    primitive,
    className: 'active:text-red-500 not-active:text-blue-500',
    expected: ['HozoPressable', 'HozoText', 'pressed &&', '!(pressed) &&'],
  })),
  {
    candidate: 'descendant-not-active',
    purpose: 'descendant-only negated pressed selects the measured nearest link owner',
    primitive: 'Link',
    props: 'href="/docs"',
    className: '@container/main',
    children: '<Text className="@sm/main:not-active:opacity-50">x</Text>',
    expected: [
      'hozoLinkComponent={HozoPressable}',
      'HozoContainerQuery',
      'HozoText',
      '!(pressed) &&',
    ],
  },
  ...(['Link', 'Button', 'Pressable'] as const).map((primitive) => ({
    candidate: 'link-interaction' as const,
    purpose: `${primitive} with href keeps navigation while sharing interaction transitions`,
    primitive,
    props: 'href="/docs"',
    className: 'opacity-100 transition-opacity md:not-hover:opacity-50 focus-visible:opacity-25',
    expected: [
      'HozoLink',
      'hozoLinkComponent={HozoPressable}',
      'hozoFocusVisible',
      'opacity: true',
    ],
  })),
  {
    candidate: 'link-descendant-owner',
    purpose: 'descendant-only state and modality enable the nearest link owner',
    primitive: 'Link',
    props: 'href="/docs"',
    className: '',
    children: '<Text className="not-focus-visible:text-red-500 group-hover:underline">x</Text>',
    expected: [
      'hozoLinkComponent={HozoPressable}',
      'hozoFocusVisible',
      'HozoText',
      '!(focusVisible) &&',
    ],
  },
  {
    candidate: 'link-container-owner',
    purpose:
      'container measurement forwards navigation and interaction without replacing either host',
    primitive: 'Link',
    props: 'href="/docs"',
    className: '@container/main text-gray-500 transition-colors not-hover:text-blue-500',
    children: '<Text className="@sm/main:focus:opacity-50">x</Text>',
    expected: [
      'hozoContainerComponent={HozoLink}',
      'hozoLinkComponent={HozoPressable}',
      'HozoContainerQuery',
      'colors: true',
    ],
  },
  {
    candidate: 'container-interaction-host',
    purpose: 'measurement keeps the event owner, modality and existing transition on one host',
    className:
      '@container/main opacity-100 transition-opacity not-hover:opacity-50 focus-visible:opacity-25',
    expected: [
      'HozoContainer',
      'hozoContainerComponent={HozoPressable}',
      'hozoFocusVisible',
      'opacity: true',
    ],
  },
  {
    candidate: 'container-descendant-owner',
    purpose: 'a container-declaring control still supplies interaction and width contexts to Text',
    className: '@container/main',
    children: '<Text className="@sm/main:not-hover:opacity-50">x</Text>',
    expected: [
      'hozoContainerComponent={HozoPressable}',
      'HozoText',
      'HozoContainerQuery',
      '!(hovered) &&',
    ],
  },
  {
    candidate: 'not-hover',
    purpose: 'Native event-owned hover is negated in the same callback and opacity transition',
    className: 'opacity-100 transition-opacity md:not-hover:opacity-50',
    expected: ['HozoPressable', '__hozoBp_md && !(hovered) &&', 'opacity: true'],
  },
  {
    candidate: 'descendant-not-hover',
    purpose: 'a descendant-only negated hover predicate enables its otherwise plain owner',
    className: '',
    children: '<Text className="not-hover:opacity-50">x</Text>',
    expected: [
      'HozoPressable',
      'HozoText style={({ pressed, hovered, focused }) =>',
      '!(hovered) &&',
    ],
  },
  {
    candidate: 'not-@md',
    purpose: 'negating a measured ancestor width remains inside its query and can transition',
    primitive: 'View',
    className: 'opacity-100 transition-opacity not-@md:opacity-50',
    expected: [
      'HozoContainerQuery',
      'HozoAnimated',
      '__hozoCq[""] !== undefined && !(__hozoCq[""] >= 448)',
    ],
  },
  {
    candidate: 'not-@max-md',
    purpose: 'negated strict maximum retains the inclusive minimum and missing-container guard',
    primitive: 'View',
    className: 'opacity-100 not-@max-md:opacity-50',
    expected: ['HozoContainerQuery', '__hozoCq[""] !== undefined && !(__hozoCq[""] < 448)'],
  },
  {
    candidate: 'not-@min-[400px]',
    purpose: 'an arbitrary pixel query negates the existing measurement without a viewport hook',
    primitive: 'View',
    className: 'opacity-100 not-@min-[400px]:opacity-50',
    expected: ['HozoContainerQuery', '__hozoCq[""] !== undefined && !(__hozoCq[""] >= 400)'],
  },
  {
    candidate: 'not-@md/main',
    purpose: 'a named query composes with the owner state without negating ancestor availability',
    className: 'opacity-100 not-@md/main:not-focus:opacity-50',
    expected: [
      'HozoContainerQuery',
      'HozoPressable',
      '__hozoCq["main"] !== undefined && !(__hozoCq["main"] >= 448)',
      '!(focused) &&',
    ],
  },
  {
    candidate: 'not-md',
    purpose: 'negated breakpoint and focus predicates share their existing ambient/owner state',
    className: 'opacity-100 not-md:not-focus:opacity-50',
    expected: ['HozoPressable', '!(__hozoBp_md) && !(focused) &&', 'useHozoBreakpoint'],
  },
  {
    candidate: 'not-dark',
    purpose: 'a light-only ambient target can animate without an interaction callback',
    className: 'opacity-100 transition-opacity not-dark:opacity-50',
    primitive: 'View',
    expected: ['HozoAnimated', '!(__hozoDark) &&', 'useHozoDark'],
  },
  {
    candidate: 'not-min-[500px]',
    purpose: 'a negated pixel minimum composes with the existing hover context',
    className: 'opacity-100 not-min-[500px]:hover:opacity-50',
    expected: ['HozoPressable', '!(__hozoWidth_500) && hovered &&', 'useHozoWidthAtLeast'],
  },
  {
    candidate: 'not-max-[500px]',
    purpose: 'negating the strict maximum retains the inclusive minimum boundary',
    className: 'opacity-100 not-max-[500px]:opacity-50',
    expected: ['!(!__hozoWidth_500) &&', 'useHozoWidthAtLeast'],
  },
  {
    candidate: 'descendant-focus-visible',
    purpose: 'child-authored state enables modality tracking on an otherwise plain owner',
    className: '',
    children: '<Text className="focus-visible:opacity-50">x</Text>',
    expected: [
      'HozoPressable',
      'hozoFocusVisible',
      'HozoText style={({ pressed, hovered, focused, focusVisible }) =>',
    ],
  },
  {
    candidate: 'descendant-not-focus-visible',
    purpose: 'a focus-only parent also tracks modality for its negated child predicate',
    className: 'focus:opacity-50',
    children: '<Text className="not-focus-visible:opacity-50">x</Text>',
    expected: ['HozoPressable', 'hozoFocusVisible', '!(focusVisible) &&'],
  },
  {
    candidate: 'group-focus-visible',
    purpose: 'the existing group context binds the focus-visible value it reads',
    className: '',
    children: '<Text className="group-focus-visible:opacity-50">x</Text>',
    expected: [
      'HozoPressable',
      'hozoFocusVisible',
      'HozoText style={({ pressed, hovered, focused, focusVisible }) =>',
    ],
  },
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
  const primitive = testCase.primitive ?? 'Pressable'
  const source =
    `import { Pressable, Text, View, Button, Link } from '@hozo/core'\n` +
    `export function C() {\n` +
    `  return <${primitive} ${primitive === 'Pressable' ? 'accessibilityRole="button"' : ''} ${testCase.props ?? ''} className="${testCase.className}">${testCase.children ?? 'x'}</${primitive}>\n` +
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
