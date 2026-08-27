// What it costs to keep a compiled screen on screen.
//
// Everything else in this package measures the compiler: what it emits,
// whether that matches Tailwind, whether React Native's types accept it.
// Nothing measured the runtime, and the runtime is where a regression
// would be invisible -- `VALIDATION.md` records a bundle-size number and
// nothing about behaviour, so a change that made every component
// re-render on every pixel of a resize would ship green.
//
// Counts, not milliseconds. A wall-clock number from CI is noise at this
// scale and could not sit in the snapshot, but the claims the runtime
// actually makes are about *how many times things render*:
//
//   "a component using only `md:` must not re-render on every resize that
//    doesn't cross a breakpoint, and it wouldn't if these shared one
//    snapshot"                                    -- hooks.native.ts
//
// That is a number, it is deterministic, and until now nothing checked it.
// The two stores it describes were separated deliberately; this is what
// says the separation still works.
//
// Renders are counted with React's `Profiler`, which reports a commit for
// each subtree that actually re-rendered. Wrapping the components from
// outside rather than instrumenting them keeps what runs identical to what
// ships -- the hook subscriptions live inside the generated component, so
// a counting wrapper around it would see nothing.

import { createRequire } from 'node:module'

import { loadNativeModule } from './native-render.ts'

const require = createRequire(import.meta.url)

/**
 * One screen's worth of components, each depending on a different part of
 * the ambient state.
 *
 * Deliberately three kinds. A component that depends on nothing must never
 * re-render; one that depends on the colour scheme must re-render when it
 * changes and not when the window moves; one that depends on a breakpoint
 * must re-render when the bucket changes and not when the width does.
 * Getting any of those wrong is a real cost on a real screen and none of
 * them is visible in the output the rest of this package compares.
 */
const SCENE = `import { View, Text } from '@hozo/core'

export function Plain() {
  return (
    <View className="flex flex-col gap-4 p-6 bg-white rounded-lg">
      <Text className="text-lg font-semibold">Plain</Text>
    </View>
  )
}

export function Themed() {
  return (
    <View className="flex flex-col gap-4 p-6 bg-white dark:bg-slate-900 rounded-lg">
      <Text className="text-lg dark:text-white">Themed</Text>
    </View>
  )
}

export function Responsive() {
  return (
    <View className="flex flex-col gap-4 p-6 md:p-8 bg-white rounded-lg">
      <Text className="text-lg md:text-xl">Responsive</Text>
    </View>
  )
}
`

const COMPONENTS = ['Plain', 'Themed', 'Responsive'] as const
type ComponentName = (typeof COMPONENTS)[number]

/** How many of each kind the scene holds, so a per-component cost shows. */
const COPIES = 8

export interface RuntimeCost {
  /** Components in the rendered scene. */
  components: number
  /** Commits during the initial mount, per component. */
  mount: number
  /** Components that re-rendered when the colour scheme changed. */
  colorSchemeChange: number
  /** …when the window resized without crossing a breakpoint. */
  resizeWithinBreakpoint: number
  /** …when it crossed one. */
  breakpointCross: number
}

interface Renderer {
  act: (callback: () => void) => void
  create: (element: unknown) => { unmount: () => void }
}

interface ReactModule {
  createElement: (type: unknown, props?: unknown, ...children: unknown[]) => unknown
  Profiler: unknown
  Fragment: unknown
}

interface StubDimensions {
  __hozoSetWindow: (next: { width: number }) => void
}

interface StubAppearance {
  __hozoSetColorScheme: (next: string) => void
}

export function measureRuntimeCost(): RuntimeCost {
  const exports = loadNativeModule(SCENE)
  const react = require('react') as ReactModule
  const renderer = require('react-test-renderer') as Renderer
  // The same stub instance the generated module resolved, so driving it
  // here is driving what the components subscribed to.
  const stub = require('./react-native-stub.js') as {
    Dimensions: StubDimensions
    Appearance: StubAppearance
  }

  let commits = 0
  const onRender = () => {
    commits += 1
  }
  const scene = react.createElement(
    react.Fragment,
    null,
    ...COMPONENTS.flatMap((name: ComponentName) =>
      Array.from({ length: COPIES }, (_, copy) =>
        react.createElement(
          react.Profiler,
          { id: `${name}-${copy}`, key: `${name}-${copy}`, onRender },
          react.createElement(exports[name]),
        ),
      ),
    ),
  )

  const components = COMPONENTS.length * COPIES
  let root: { unmount: () => void } | undefined
  try {
    renderer.act(() => {
      root = renderer.create(scene)
    })
    const mount = commits

    // A resize that stays inside the bucket. 390 and 420 are both below
    // `md`, so nothing about any component's conditions has changed --
    // which is exactly why the viewport and the breakpoint are two stores
    // rather than one.
    commits = 0
    renderer.act(() => stub.Dimensions.__hozoSetWindow({ width: 420 }))
    const resizeWithinBreakpoint = commits

    // Across it. `md` is 768.
    commits = 0
    renderer.act(() => stub.Dimensions.__hozoSetWindow({ width: 900 }))
    const breakpointCross = commits

    commits = 0
    renderer.act(() => stub.Appearance.__hozoSetColorScheme('dark'))
    const colorSchemeChange = commits

    return { components, mount, colorSchemeChange, resizeWithinBreakpoint, breakpointCross }
  } finally {
    // Restored so a second call starts where the first did, and so the
    // listeners this registered stop hearing about it.
    renderer.act(() => {
      stub.Dimensions.__hozoSetWindow({ width: 390 })
      stub.Appearance.__hozoSetColorScheme('light')
      root?.unmount()
    })
  }
}
