import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { createCompiler } from '@hozo/compiler'
import * as esbuild from 'esbuild'
import { transformHozoSource } from './transform.ts'

const patternsRequire = createRequire(new URL('../../patterns/package.json', import.meta.url))
const React = patternsRequire('react') as typeof import('react')
const { renderToStaticMarkup } = patternsRequire(
  'react-dom/server',
) as typeof import('react-dom/server')

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

function flattenStyle(style: unknown): Record<string, unknown> {
  if (!style) return {}
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flattenStyle))
  if (typeof style === 'object') return { ...(style as Record<string, unknown>) }
  return {}
}

function loadNativePatternModule(
  relativeFile: string,
  options: { hozoClasses: (value?: string, facts?: unknown) => unknown },
) {
  const fullPath = path.join(root, 'packages/patterns/src', relativeFile)
  const source = readFileSync(fullPath, 'utf8')
  const { code } = esbuild.transformSync(source, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    sourcefile: fullPath,
  })
  const captured: { host: string; props: Record<string, unknown> }[] = []
  let interactionState = { hovered: false, pressed: false, focused: false, focusVisible: false }
  let draggingState = false
  const host = (name: string) => (props: Record<string, unknown>) => {
    const resolvedProps = {
      ...props,
      ...(typeof props.style === 'function'
        ? { style: (props.style as (state: typeof interactionState) => unknown)(interactionState) }
        : {}),
    }
    captured.push({ host: name, props: resolvedProps })
    const children =
      typeof props.children === 'function'
        ? (props.children as (state: typeof interactionState) => React.ReactNode)(interactionState)
        : (props.children as React.ReactNode)
    return React.createElement(`rn-${name.toLowerCase()}`, null, children)
  }
  const AnimatedView = host('Animated.View')
  const rn = {
    View: host('View'),
    Pressable: host('Pressable'),
    Text: host('Text'),
    TextInput: host('TextInput'),
    Modal: host('Modal'),
    ScrollView: host('ScrollView'),
    Animated: {
      View: AnimatedView,
      Value: class {
        value: number
        constructor(value: number) {
          this.value = value
        }
      },
      timing: () => ({ start: () => {}, stop: () => {} }),
    },
    Easing: { out: (fn: unknown) => fn, quad: (n: number) => n },
    PanResponder: { create: () => ({ panHandlers: {} }) },
    I18nManager: { isRTL: false },
    StyleSheet: {
      create: <T>(styles: T) => styles,
      flatten: flattenStyle,
    },
  }
  const cache = new Map<string, unknown>()
  const localRequire = (specifier: string): unknown => {
    if (specifier === 'react') return React
    if (specifier === 'react-native') return rn
    if (specifier === '@hozo/engine/project')
      return { hozoClasses: options.hozoClasses, hozoClassTransitions: {} }
    if (specifier === '@hozo/engine/generated/gap-styles')
      return { hozoAuthoredStyle: (s: unknown) => s }
    if (specifier === '@hozo/engine/generated/safe-area')
      return { useHozoProvidedSafeArea: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }
    if (specifier === '@hozo/engine/generated/animated')
      return { HozoAnimated: rn.View, PresenceContext: React.createContext(null) }
    if (specifier === '@hozo/engine/generated/environment')
      return { useHozoEnvironment: () => false }
    if (specifier === '@hozo/engine') {
      return {
        createClassTransitions: () => () => undefined,
        hozoSplitTextStyle: (style: Record<string, unknown>) => {
          const textKeys = new Set([
            'color',
            'fontSize',
            'fontWeight',
            'lineHeight',
            'letterSpacing',
            'textAlign',
            'textTransform',
          ])
          const box: Record<string, unknown> = {}
          const text: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(style ?? {})) {
            if (textKeys.has(k)) text[k] = v
            else box[k] = v
          }
          return [box, text]
        },
      }
    }
    if (specifier === '@hozo/behaviors' || specifier === '@hozo/behaviors/native') {
      return {
        hozoTextChildren: (children: React.ReactNode, style: Record<string, unknown>) =>
          typeof children === 'string'
            ? React.createElement(rn.Text as unknown as React.ComponentType, { style }, children)
            : children,
        useHozoMessage: () => (key: string) => key,
        useHozoI18n: () => ({ locale: 'en-US', dir: 'ltr' }),
        usePresence: (open: boolean) => ({
          mounted: open,
          state: open ? 'open' : 'closed',
          done: () => {},
        }),
        Portal: ({ children }: { children?: React.ReactNode }) => children ?? null,
        FloatingPositioner: ({ children }: { children?: React.ReactNode }) => children ?? null,
        useDrag1D: () => ({ dragging: draggingState, handlers: {} }),
      }
    }
    if (specifier === '@hozo/behaviors/pressable-interaction') {
      return {
        HozoInteractionContext: React.createContext(null),
        usePressableInteraction: () => ({
          state: interactionState,
          handlers: {
            hoverIn: () => {},
            hoverOut: () => {},
            focus: () => {},
            blur: () => {},
            pointerDown: () => {},
            keyDown: () => {},
            pressIn: () => {},
            pressOut: () => {},
          },
        }),
      }
    }
    if (specifier.startsWith('.')) {
      const target = path.resolve(path.dirname(fullPath), specifier)
      if (cache.has(target)) return cache.get(target)
      const depCode = esbuild.transformSync(readFileSync(target, 'utf8'), {
        loader: target.endsWith('.tsx') ? 'tsx' : 'ts',
        format: 'cjs',
        jsx: 'transform',
        jsxFactory: 'React.createElement',
        jsxFragment: 'React.Fragment',
        sourcefile: target,
      }).code
      const depMod = { exports: {} as Record<string, unknown> }
      cache.set(target, depMod.exports)
      runInNewContext(depCode, {
        module: depMod,
        exports: depMod.exports,
        React,
        require: (nested: string) =>
          nested.startsWith('.')
            ? localRequire(
                `./${path.relative(path.dirname(fullPath), path.resolve(path.dirname(target), nested)).replaceAll('\\', '/')}`,
              )
            : localRequire(nested),
      })
      cache.set(target, depMod.exports)
      return depMod.exports
    }
    throw new Error(`Unexpected require in ${relativeFile}: ${specifier}`)
  }
  const mod = { exports: {} as Record<string, unknown> }
  runInNewContext(code, { module: mod, exports: mod.exports, React, require: localRequire })
  return {
    exports: mod.exports,
    captured,
    setInteraction(next: Partial<typeof interactionState>) {
      interactionState = { ...interactionState, ...next }
    },
    setDragging(next: boolean) {
      draggingState = next
    },
  }
}

test('Native Drawer delivers prepared scrim and panel styles without calling hozoClasses (#2046)', () => {
  const compiler = createCompiler()
  const source = `import { Drawer } from '@hozo/patterns'
export function Screen() {
  return (
    <Drawer
      open
      accessibilityLabel="Menu"
      scrimClassName="bg-[#000000] opacity-50"
      panelClassName="pt-6 bg-[#ffffff] text-[#112233]"
    >
      Navigation
    </Drawer>
  )
}
export function Fallback() {
  return <Drawer open scrimClassName="hover:opacity-50" />
}
`
  const transformed = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(transformed)
  assert.match(transformed, /hozoScrimStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(transformed, /hozoPanelStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.doesNotMatch(transformed, /scrimClassName="bg-\[#000000\]/)
  assert.doesNotMatch(transformed, /panelClassName="pt-6/)
  // Stateless scrim refuses hover: and keeps the runtime path.
  assert.match(transformed, /scrimClassName="hover:opacity-50"/)

  const { code } = esbuild.transformSync(transformed, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    sourcefile: '/app/Screen.tsx',
  })

  let classResolverCalls = 0
  const spyHozoClasses = () => {
    classResolverCalls++
    return { paddingBottom: 77 }
  }
  const drawerMod = loadNativePatternModule('drawer.native.tsx', { hozoClasses: spyHozoClasses })
  const screenMod = { exports: {} as { Screen: React.ComponentType } }
  runInNewContext(code, {
    module: screenMod,
    exports: screenMod.exports,
    React,
    require: (specifier: string) => {
      if (specifier === 'react') return React
      if (specifier === 'react-native') return { StyleSheet: { create: <T>(styles: T) => styles } }
      if (specifier === '@hozo/patterns') return { Drawer: drawerMod.exports.Drawer }
      throw new Error(`Unexpected require: ${specifier}`)
    },
  })

  renderToStaticMarkup(React.createElement(screenMod.exports.Screen))
  assert.equal(classResolverCalls, 0, 'prepared Drawer literals must never call hozoClasses')

  const scrimHost = drawerMod.captured.find((entry) => entry.host === 'Pressable')!
  assert.equal(flattenStyle(scrimHost.props.style).backgroundColor, '#000000')
  assert.equal(flattenStyle(scrimHost.props.style).opacity, 0.5)

  const views = drawerMod.captured.filter((entry) => entry.host === 'View')
  const panelHost = views[views.length - 1]!
  assert.equal(flattenStyle(panelHost.props.style).paddingTop, 24)
  assert.equal(flattenStyle(panelHost.props.style).backgroundColor, '#ffffff')

  const panelText = drawerMod.captured.find((entry) => entry.host === 'Text')!
  assert.equal(flattenStyle(panelText.props.style).color, '#112233')

  for (const [classProp, preparedProp] of [
    ['scrimClassName', 'hozoScrimStyle'],
    ['panelClassName', 'hozoPanelStyle'],
  ]) {
    assert.throws(
      () =>
        renderToStaticMarkup(
          React.createElement(
            drawerMod.exports.Drawer as React.ComponentType<Record<string, unknown>>,
            { open: true, [classProp]: 'pt-2', [preparedProp]: () => ({}) },
          ),
        ),
      new RegExp(`Prepared Drawer styles must consume ${classProp}`),
    )
  }
})

test('Native Popover delivers prepared trigger and panel styles without calling hozoClasses (#2046)', () => {
  const compiler = createCompiler()
  const source = `import { Popover } from '@hozo/patterns'
export function Screen({ open, disabled }: { open?: boolean; disabled?: boolean }) {
  return (
    <Popover
      open={open}
      disabled={disabled}
      trigger="Actions"
      triggerClassName="bg-[#111111] hover:bg-[#222222] active:bg-[#333333] focus-visible:border-[#444444] aria-expanded:bg-[#555555] disabled:bg-[#666666] text-[#eeeeee] disabled:text-[#999999]"
      panelClassName="pt-4 bg-[#fafafa] text-[#112233]"
    >
      Body
    </Popover>
  )
}
export function Fallback() {
  return <Popover open trigger="Keep" panelClassName="hover:opacity-50" />
}
`
  const transformed = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(transformed)
  assert.match(transformed, /hozoTriggerStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(transformed, /hozoPanelStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.doesNotMatch(transformed, /triggerClassName="bg-\[#111111\]/)
  assert.doesNotMatch(transformed, /panelClassName="pt-4/)
  // Stateless panel refuses hover: and keeps the runtime path.
  assert.match(transformed, /panelClassName="hover:opacity-50"/)

  const { code } = esbuild.transformSync(transformed, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    sourcefile: '/app/Screen.tsx',
  })

  let classResolverCalls = 0
  const spyHozoClasses = () => {
    classResolverCalls++
    return { paddingBottom: 77 }
  }
  const popoverMod = loadNativePatternModule('popover.native.tsx', { hozoClasses: spyHozoClasses })
  const screenMod = {
    exports: {} as { Screen: React.ComponentType<{ open?: boolean; disabled?: boolean }> },
  }
  runInNewContext(code, {
    module: screenMod,
    exports: screenMod.exports,
    React,
    require: (specifier: string) => {
      if (specifier === 'react') return React
      if (specifier === 'react-native') return { StyleSheet: { create: <T>(styles: T) => styles } }
      if (specifier === '@hozo/patterns') return { Popover: popoverMod.exports.Popover }
      throw new Error(`Unexpected require: ${specifier}`)
    },
  })

  const renderCase = (
    props: { open?: boolean; disabled?: boolean },
    interaction: {
      hovered?: boolean
      pressed?: boolean
      focused?: boolean
      focusVisible?: boolean
    } = {},
  ) => {
    popoverMod.captured.length = 0
    popoverMod.setInteraction({
      hovered: false,
      pressed: false,
      focused: false,
      focusVisible: false,
      ...interaction,
    })
    renderToStaticMarkup(React.createElement(screenMod.exports.Screen, props))
    return {
      trigger: flattenStyle(
        popoverMod.captured.find((entry) => entry.host === 'Pressable')!.props.style,
      ),
      texts: popoverMod.captured
        .filter((entry) => entry.host === 'Text')
        .map((entry) => flattenStyle(entry.props.style)),
      panel: popoverMod.captured.find((entry) => entry.host === 'Animated.View')
        ? flattenStyle(
            popoverMod.captured.find((entry) => entry.host === 'Animated.View')!.props.style,
          )
        : null,
    }
  }

  const rest = renderCase({ open: false })
  assert.equal(rest.trigger.backgroundColor, '#111111')
  assert.equal(rest.texts[0]!.color, '#eeeeee')
  assert.equal(rest.panel, null)

  assert.equal(renderCase({ open: false }, { hovered: true }).trigger.backgroundColor, '#222222')
  assert.equal(renderCase({ open: false }, { pressed: true }).trigger.backgroundColor, '#333333')
  assert.equal(
    renderCase({ open: false }, { focused: true, focusVisible: true }).trigger.borderColor,
    '#444444',
  )

  const opened = renderCase({ open: true })
  assert.equal(opened.trigger.backgroundColor, '#555555')
  assert.equal(opened.panel!.paddingTop, 16)
  assert.equal(opened.panel!.backgroundColor, '#fafafa')
  assert.equal(opened.texts[1]!.color, '#112233')

  const disabledCase = renderCase({ open: false, disabled: true })
  assert.equal(disabledCase.trigger.backgroundColor, '#666666')
  assert.equal(disabledCase.texts[0]!.color, '#999999')

  assert.equal(classResolverCalls, 0, 'prepared Popover literals must never call hozoClasses')

  for (const [classProp, preparedProp] of [
    ['triggerClassName', 'hozoTriggerStyle'],
    ['panelClassName', 'hozoPanelStyle'],
  ]) {
    assert.throws(
      () =>
        renderToStaticMarkup(
          React.createElement(
            popoverMod.exports.Popover as React.ComponentType<Record<string, unknown>>,
            { open: true, trigger: 'Go', [classProp]: 'pt-2', [preparedProp]: () => ({}) },
          ),
        ),
      new RegExp(`Prepared Popover styles must consume ${classProp}`),
    )
  }
})

test('Native RadioGroup delivers prepared option styles without calling hozoClasses (#2046)', () => {
  const compiler = createCompiler()
  const source = `import { RadioGroup } from '@hozo/patterns'
export function Screen({ value }: { value?: string }) {
  return (
    <RadioGroup
      value={value}
      options={[
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Beta' },
        { value: 'c', label: 'Gamma', disabled: true },
      ]}
      optionClassName="bg-[#111111] hover:bg-[#222222] active:bg-[#333333] focus-visible:border-[#444444] aria-checked:bg-[#555555] aria-disabled:bg-[#666666] text-[#eeeeee] aria-disabled:text-[#999999]"
    />
  )
}
export function Fallback() {
  return (
    <RadioGroup
      options={[{ value: 'a', label: 'Alpha' }]}
      optionClassName="disabled:opacity-50"
    />
  )
}
`
  const transformed = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(transformed)
  assert.match(transformed, /hozoOptionStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.doesNotMatch(transformed, /optionClassName="bg-\[#111111\]/)
  // Web <div role="radio"> has no HTML disabled attribute; disabled: stays on the runtime path.
  assert.match(transformed, /optionClassName="disabled:opacity-50"/)

  const { code } = esbuild.transformSync(transformed, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    sourcefile: '/app/Screen.tsx',
  })

  let classResolverCalls = 0
  const spyHozoClasses = () => {
    classResolverCalls++
    return { paddingBottom: 77 }
  }
  const radioMod = loadNativePatternModule('radio.native.tsx', { hozoClasses: spyHozoClasses })
  const screenMod = { exports: {} as { Screen: React.ComponentType<{ value?: string }> } }
  runInNewContext(code, {
    module: screenMod,
    exports: screenMod.exports,
    React,
    require: (specifier: string) => {
      if (specifier === 'react') return React
      if (specifier === 'react-native') return { StyleSheet: { create: <T>(styles: T) => styles } }
      if (specifier === '@hozo/patterns') return { RadioGroup: radioMod.exports.RadioGroup }
      throw new Error(`Unexpected require: ${specifier}`)
    },
  })

  const renderCase = (
    value: string,
    interaction: {
      hovered?: boolean
      pressed?: boolean
      focused?: boolean
      focusVisible?: boolean
    } = {},
  ) => {
    radioMod.captured.length = 0
    radioMod.setInteraction({
      hovered: false,
      pressed: false,
      focused: false,
      focusVisible: false,
      ...interaction,
    })
    renderToStaticMarkup(React.createElement(screenMod.exports.Screen, { value }))
    return {
      options: radioMod.captured
        .filter((entry) => entry.host === 'Pressable')
        .map((entry) => flattenStyle(entry.props.style)),
      texts: radioMod.captured
        .filter((entry) => entry.host === 'Text')
        .map((entry) => flattenStyle(entry.props.style)),
    }
  }

  const rest = renderCase('b')
  assert.equal(rest.options[0]!.backgroundColor, '#111111')
  assert.equal(rest.options[1]!.backgroundColor, '#555555')
  assert.equal(rest.options[2]!.backgroundColor, '#666666')
  assert.equal(rest.texts[0]!.color, '#eeeeee')
  assert.equal(rest.texts[2]!.color, '#999999')

  assert.equal(renderCase('b', { hovered: true }).options[0]!.backgroundColor, '#222222')
  assert.equal(renderCase('b', { pressed: true }).options[0]!.backgroundColor, '#333333')
  assert.equal(
    renderCase('b', { focused: true, focusVisible: true }).options[0]!.borderColor,
    '#444444',
  )

  assert.equal(classResolverCalls, 0, 'prepared RadioGroup literals must never call hozoClasses')

  assert.throws(
    () =>
      renderToStaticMarkup(
        React.createElement(
          radioMod.exports.RadioGroup as React.ComponentType<Record<string, unknown>>,
          {
            options: [{ value: 'a', label: 'A' }],
            optionClassName: 'pt-2',
            hozoOptionStyle: () => ({}),
          },
        ),
      ),
    /Prepared RadioGroup styles must consume optionClassName/,
  )
})

test('Native Tree delivers prepared row styles without calling hozoClasses (#2046)', () => {
  const compiler = createCompiler()
  const source = `import { Tree } from '@hozo/patterns'
export function Screen({ selectedId }: { selectedId?: string }) {
  return (
    <Tree
      selectedId={selectedId}
      defaultExpanded={['branch-open']}
      nodes={[
        { id: 'leaf', label: 'Leaf' },
        { id: 'branch-open', label: 'Open', children: [{ id: 'child', label: 'Child' }] },
        { id: 'branch-closed', label: 'Closed', children: [{ id: 'hidden', label: 'Hidden' }] },
        { id: 'disabled', label: 'Disabled', disabled: true },
      ]}
      rowClassName="bg-[#111111] hover:bg-[#222222] active:bg-[#333333] focus-visible:border-[#444444] aria-selected:bg-[#555555] aria-expanded:border-[#666666] aria-disabled:bg-[#777777] text-[#eeeeee] aria-disabled:text-[#999999]"
    />
  )
}
export function Fallback() {
  return <Tree nodes={[{ id: 'a', label: 'A' }]} rowClassName="disabled:opacity-50" />
}
`
  const transformed = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(transformed)
  assert.match(transformed, /hozoRowStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.doesNotMatch(transformed, /rowClassName="bg-\[#111111\]/)
  // Web <div role="treeitem"> has no HTML disabled attribute; disabled: stays on the runtime path.
  assert.match(transformed, /rowClassName="disabled:opacity-50"/)

  const { code } = esbuild.transformSync(transformed, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    sourcefile: '/app/Screen.tsx',
  })

  let classResolverCalls = 0
  const spyHozoClasses = () => {
    classResolverCalls++
    return { paddingBottom: 77 }
  }
  const treeMod = loadNativePatternModule('tree.native.tsx', { hozoClasses: spyHozoClasses })
  const screenMod = { exports: {} as { Screen: React.ComponentType<{ selectedId?: string }> } }
  runInNewContext(code, {
    module: screenMod,
    exports: screenMod.exports,
    React,
    require: (specifier: string) => {
      if (specifier === 'react') return React
      if (specifier === 'react-native') return { StyleSheet: { create: <T>(styles: T) => styles } }
      if (specifier === '@hozo/patterns') return { Tree: treeMod.exports.Tree }
      throw new Error(`Unexpected require: ${specifier}`)
    },
  })

  const renderCase = (
    selectedId: string,
    interaction: {
      hovered?: boolean
      pressed?: boolean
      focused?: boolean
      focusVisible?: boolean
    } = {},
  ) => {
    treeMod.captured.length = 0
    treeMod.setInteraction({
      hovered: false,
      pressed: false,
      focused: false,
      focusVisible: false,
      ...interaction,
    })
    renderToStaticMarkup(React.createElement(screenMod.exports.Screen, { selectedId }))
    return {
      rows: treeMod.captured
        .filter((entry) => entry.host === 'Pressable')
        .map((entry) => flattenStyle(entry.props.style)),
      texts: treeMod.captured
        .filter((entry) => entry.host === 'Text')
        .map((entry) => flattenStyle(entry.props.style)),
    }
  }

  // Visible rows order: [0: leaf, 1: branch-open, 2: child (selected), 3: branch-closed, 4: disabled]
  const rest = renderCase('child')
  assert.equal(rest.rows.length, 5)
  assert.equal(rest.rows[0]!.backgroundColor, '#111111')
  assert.equal(rest.rows[1]!.borderColor, '#666666')
  assert.equal(rest.rows[2]!.backgroundColor, '#555555')
  assert.equal(rest.rows[3]!.borderColor, undefined)
  assert.equal(rest.rows[4]!.backgroundColor, '#777777')
  assert.equal(rest.texts[0]!.color, '#eeeeee')
  assert.equal(rest.texts[4]!.color, '#999999')

  assert.equal(renderCase('child', { hovered: true }).rows[0]!.backgroundColor, '#222222')
  assert.equal(renderCase('child', { pressed: true }).rows[0]!.backgroundColor, '#333333')
  assert.equal(
    renderCase('child', { focused: true, focusVisible: true }).rows[0]!.borderColor,
    '#444444',
  )

  assert.equal(classResolverCalls, 0, 'prepared Tree literals must never call hozoClasses')

  assert.throws(
    () =>
      renderToStaticMarkup(
        React.createElement(treeMod.exports.Tree as React.ComponentType<Record<string, unknown>>, {
          nodes: [{ id: 'a', label: 'A' }],
          rowClassName: 'pt-2',
          hozoRowStyle: () => ({}),
        }),
      ),
    /Prepared Tree styles must consume rowClassName/,
  )
})

test('Native Splitter delivers prepared handle styles without calling hozoClasses (#2046)', () => {
  const compiler = createCompiler()
  const source = `import { Splitter } from '@hozo/patterns'
export function Screen({ collapsed }: { collapsed?: boolean }) {
  return (
    <Splitter
      label="Sidebar"
      controls="nav"
      min={100}
      max={400}
      collapsible
      collapsed={collapsed}
      className="w-1 bg-[#111111] hover:bg-[#222222] focus-visible:border-[#333333] data-[dragging]:bg-[#444444] data-[collapsed]:bg-[#555555]"
    />
  )
}
export function Fallback() {
  return (
    <Splitter
      label="Keep"
      controls="nav"
      min={100}
      max={400}
      className="active:bg-[#666666]"
    />
  )
}
`
  const transformed = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(transformed)
  assert.match(transformed, /hozoSplitterStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.doesNotMatch(transformed, /className="w-1 bg-\[#111111\]/)
  // Interactive View handle has no Pressable press responder; active: stays on the runtime path.
  assert.match(transformed, /className="active:bg-\[#666666\]"/)

  const { code } = esbuild.transformSync(transformed, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    sourcefile: '/app/Screen.tsx',
  })

  let classResolverCalls = 0
  const spyHozoClasses = () => {
    classResolverCalls++
    return { paddingBottom: 77 }
  }
  const splitterMod = loadNativePatternModule('splitter.native.tsx', {
    hozoClasses: spyHozoClasses,
  })
  const screenMod = { exports: {} as { Screen: React.ComponentType<{ collapsed?: boolean }> } }
  runInNewContext(code, {
    module: screenMod,
    exports: screenMod.exports,
    React,
    require: (specifier: string) => {
      if (specifier === 'react') return React
      if (specifier === 'react-native') return { StyleSheet: { create: <T>(styles: T) => styles } }
      if (specifier === '@hozo/patterns') return { Splitter: splitterMod.exports.Splitter }
      throw new Error(`Unexpected require: ${specifier}`)
    },
  })

  const renderCase = (
    options: {
      collapsed?: boolean
      dragging?: boolean
      hovered?: boolean
      focused?: boolean
      focusVisible?: boolean
    } = {},
  ) => {
    splitterMod.captured.length = 0
    splitterMod.setDragging(Boolean(options.dragging))
    splitterMod.setInteraction({
      hovered: Boolean(options.hovered),
      pressed: false,
      focused: Boolean(options.focused),
      focusVisible: Boolean(options.focusVisible),
    })
    renderToStaticMarkup(
      React.createElement(screenMod.exports.Screen, { collapsed: options.collapsed }),
    )
    return flattenStyle(splitterMod.captured.find((entry) => entry.host === 'View')!.props.style)
  }

  assert.equal(renderCase().backgroundColor, '#111111')
  assert.equal(renderCase({ hovered: true }).backgroundColor, '#222222')
  assert.equal(renderCase({ focused: true, focusVisible: true }).borderColor, '#333333')
  assert.equal(renderCase({ dragging: true }).backgroundColor, '#444444')
  assert.equal(renderCase({ collapsed: true }).backgroundColor, '#555555')
  assert.equal(classResolverCalls, 0, 'prepared Splitter literals must never call hozoClasses')

  assert.throws(
    () =>
      renderToStaticMarkup(
        React.createElement(
          splitterMod.exports.Splitter as React.ComponentType<Record<string, unknown>>,
          {
            label: 'Sidebar',
            controls: 'nav',
            min: 100,
            max: 400,
            className: 'w-1',
            hozoSplitterStyle: () => ({}),
          },
        ),
      ),
    /Prepared Splitter styles must consume className/,
  )
})

test('Native ResizablePane delivers prepared root, pane and handle styles without calling hozoClasses (#2046)', () => {
  const compiler = createCompiler()
  const source = `import { ResizablePane } from '@hozo/patterns'
export function Screen({ collapsed }: { collapsed?: boolean }) {
  return (
    <ResizablePane
      side="start"
      label="Nav"
      min={100}
      max={400}
      collapsible
      collapsed={collapsed}
      className="bg-[#010101]"
      paneClassName="pt-4 bg-[#fafafa] text-[#112233]"
      handleClassName="w-1 bg-[#111111] hover:bg-[#222222] focus-visible:border-[#333333] data-[dragging]:bg-[#444444] data-[collapsed]:bg-[#555555]"
    >
      Sidebar
    </ResizablePane>
  )
}
export function Fallback() {
  return (
    <ResizablePane side="start" label="Keep" min={100} max={400} paneClassName="hover:opacity-50">
      Keep
    </ResizablePane>
  )
}
`
  const transformed = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(transformed)
  assert.match(transformed, /hozoResizablePaneStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(transformed, /hozoPaneStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(transformed, /hozoHandleStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.doesNotMatch(transformed, /className="bg-\[#010101\]"/)
  assert.doesNotMatch(transformed, /paneClassName="pt-4/)
  assert.doesNotMatch(transformed, /handleClassName="w-1/)
  // Stateless pane refuses hover: and keeps the runtime path.
  assert.match(transformed, /paneClassName="hover:opacity-50"/)

  const { code } = esbuild.transformSync(transformed, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    sourcefile: '/app/Screen.tsx',
  })

  let classResolverCalls = 0
  const spyHozoClasses = () => {
    classResolverCalls++
    return { paddingBottom: 77 }
  }
  const splitterMod = loadNativePatternModule('splitter.native.tsx', {
    hozoClasses: spyHozoClasses,
  })
  const screenMod = { exports: {} as { Screen: React.ComponentType<{ collapsed?: boolean }> } }
  runInNewContext(code, {
    module: screenMod,
    exports: screenMod.exports,
    React,
    require: (specifier: string) => {
      if (specifier === 'react') return React
      if (specifier === 'react-native') return { StyleSheet: { create: <T>(styles: T) => styles } }
      if (specifier === '@hozo/patterns')
        return { ResizablePane: splitterMod.exports.ResizablePane }
      throw new Error(`Unexpected require: ${specifier}`)
    },
  })

  const renderCase = (
    options: {
      collapsed?: boolean
      dragging?: boolean
      hovered?: boolean
      focused?: boolean
      focusVisible?: boolean
    } = {},
  ) => {
    splitterMod.captured.length = 0
    splitterMod.setDragging(Boolean(options.dragging))
    splitterMod.setInteraction({
      hovered: Boolean(options.hovered),
      pressed: false,
      focused: Boolean(options.focused),
      focusVisible: Boolean(options.focusVisible),
    })
    renderToStaticMarkup(
      React.createElement(screenMod.exports.Screen, { collapsed: options.collapsed }),
    )
    const views = splitterMod.captured.filter((entry) => entry.host === 'View')
    return {
      root: flattenStyle(views[0]!.props.style),
      pane: flattenStyle(views[1]!.props.style),
      handle: flattenStyle(views[2]!.props.style),
      text: flattenStyle(splitterMod.captured.find((entry) => entry.host === 'Text')!.props.style),
    }
  }

  const rest = renderCase()
  assert.equal(rest.root.backgroundColor, '#010101')
  assert.equal(rest.pane.paddingTop, 16)
  assert.equal(rest.pane.backgroundColor, '#fafafa')
  assert.equal(rest.text.color, '#112233')
  assert.equal(rest.handle.backgroundColor, '#111111')
  assert.equal(renderCase({ hovered: true }).handle.backgroundColor, '#222222')
  assert.equal(renderCase({ focused: true, focusVisible: true }).handle.borderColor, '#333333')
  assert.equal(renderCase({ dragging: true }).handle.backgroundColor, '#444444')
  assert.equal(renderCase({ collapsed: true }).handle.backgroundColor, '#555555')
  assert.equal(classResolverCalls, 0, 'prepared ResizablePane literals must never call hozoClasses')

  for (const [classProp, preparedProp] of [
    ['className', 'hozoResizablePaneStyle'],
    ['paneClassName', 'hozoPaneStyle'],
    ['handleClassName', 'hozoHandleStyle'],
  ]) {
    assert.throws(
      () =>
        renderToStaticMarkup(
          React.createElement(
            splitterMod.exports.ResizablePane as React.ComponentType<Record<string, unknown>>,
            {
              side: 'start',
              label: 'Nav',
              min: 100,
              max: 400,
              [classProp]: 'pt-2',
              [preparedProp]: () => ({}),
            },
            'Body',
          ),
        ),
      new RegExp(`Prepared ResizablePane styles must consume ${classProp}`),
    )
  }
})

test('Native Slider delivers prepared thumb, fill and rail styles without calling hozoClasses (#2046)', () => {
  const compiler = createCompiler()
  const source = `import { Slider } from '@hozo/patterns'
export function Screen({ disabled }: { disabled?: boolean }) {
  return (
    <Slider
      accessibilityLabel="Volume"
      defaultValue={40}
      disabled={disabled}
      railClassName="bg-[#101010]"
      fillClassName="bg-[#202020]"
      thumbClassName="bg-[#111111] focus:border-[#222222] focus-visible:border-[#333333] aria-disabled:bg-[#444444]"
    />
  )
}
export function Fallback() {
  return (
    <Slider
      accessibilityLabel="Keep"
      thumbClassName="hover:bg-[#555555]"
    />
  )
}
`
  const transformed = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(transformed)
  assert.match(transformed, /hozoRailStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(transformed, /hozoFillStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(transformed, /hozoSliderThumbStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.doesNotMatch(transformed, /railClassName="bg-\[#101010\]"/)
  assert.doesNotMatch(transformed, /fillClassName="bg-\[#202020\]"/)
  assert.doesNotMatch(transformed, /thumbClassName="bg-\[#111111\]/)
  // Track owns pointers on Native; thumb refuses hover: and keeps the runtime path.
  assert.match(transformed, /thumbClassName="hover:bg-\[#555555\]"/)

  const { code } = esbuild.transformSync(transformed, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    sourcefile: '/app/Screen.tsx',
  })

  let classResolverCalls = 0
  const spyHozoClasses = () => {
    classResolverCalls++
    return { paddingBottom: 77 }
  }
  const sliderMod = loadNativePatternModule('slider.native.tsx', { hozoClasses: spyHozoClasses })
  const screenMod = { exports: {} as { Screen: React.ComponentType<{ disabled?: boolean }> } }
  runInNewContext(code, {
    module: screenMod,
    exports: screenMod.exports,
    React,
    require: (specifier: string) => {
      if (specifier === 'react') return React
      if (specifier === 'react-native') return { StyleSheet: { create: <T>(styles: T) => styles } }
      if (specifier === '@hozo/patterns') return { Slider: sliderMod.exports.Slider }
      throw new Error(`Unexpected require: ${specifier}`)
    },
  })

  const renderCase = (
    options: { disabled?: boolean; focused?: boolean; focusVisible?: boolean } = {},
  ) => {
    sliderMod.captured.length = 0
    sliderMod.setInteraction({
      hovered: false,
      pressed: false,
      focused: Boolean(options.focused),
      focusVisible: Boolean(options.focusVisible),
    })
    renderToStaticMarkup(
      React.createElement(screenMod.exports.Screen, { disabled: options.disabled }),
    )
    const views = sliderMod.captured.filter((entry) => entry.host === 'View')
    // [0: track, 1: rail, 2: fill, 3: thumb]
    assert.equal(views.length, 4, 'prepared rail and fill must still mount without class strings')
    return {
      rail: flattenStyle(views[1]!.props.style),
      fill: flattenStyle(views[2]!.props.style),
      thumb: flattenStyle(views[3]!.props.style),
    }
  }

  const rest = renderCase()
  assert.equal(rest.rail.backgroundColor, '#101010')
  assert.equal(rest.fill.backgroundColor, '#202020')
  assert.equal(rest.thumb.backgroundColor, '#111111')
  assert.equal(renderCase({ focused: true }).thumb.borderColor, '#222222')
  assert.equal(renderCase({ focused: true, focusVisible: true }).thumb.borderColor, '#333333')
  assert.equal(renderCase({ disabled: true }).thumb.backgroundColor, '#444444')
  assert.equal(classResolverCalls, 0, 'prepared Slider literals must never call hozoClasses')

  for (const [classProp, preparedProp] of [
    ['thumbClassName', 'hozoSliderThumbStyle'],
    ['fillClassName', 'hozoFillStyle'],
    ['railClassName', 'hozoRailStyle'],
  ]) {
    assert.throws(
      () =>
        renderToStaticMarkup(
          React.createElement(
            sliderMod.exports.Slider as React.ComponentType<Record<string, unknown>>,
            {
              accessibilityLabel: 'Volume',
              [classProp]: 'bg-[#000000]',
              [preparedProp]: () => ({}),
            },
          ),
        ),
      new RegExp(`Prepared Slider styles must consume ${classProp}`),
    )
  }
})

test('Native Accordion delivers all five prepared slot styles without calling hozoClasses (#2046)', () => {
  const compiler = createCompiler()
  const source = `import { Accordion } from '@hozo/patterns'
export function Screen({ expanded }: { expanded?: string | null }) {
  return (
    <Accordion
      expanded={expanded}
      items={[
        { id: 'a', header: 'Shipping', content: 'Two days.' },
        { id: 'b', header: 'Disabled', content: 'Hidden.', disabled: true },
      ]}
      sectionClassName="bg-[#010101]"
      headingClassName="mt-2"
      triggerClassName="bg-[#111111] hover:bg-[#222222] active:bg-[#333333] focus-visible:border-[#444444] aria-expanded:bg-[#555555] disabled:bg-[#666666] data-[hozo-state=open]:border-[#777777] text-[#eeeeee] disabled:text-[#999999]"
      panelClassName="bg-[#fafafa] data-[hozo-state=open]:border-[#888888] text-[#112233]"
      panelContentClassName="pt-4 text-[#223344]"
    />
  )
}
export function Fallback() {
  return (
    <Accordion
      items={[{ id: 'a', header: 'A', content: 'B' }]}
      panelClassName="transition-[height] duration-200 bg-[#fafafa]"
      sectionClassName="hover:opacity-50"
    />
  )
}
`
  const transformed = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(transformed)
  assert.match(transformed, /hozoSectionStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(transformed, /hozoHeadingStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(transformed, /hozoTriggerStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(transformed, /hozoPanelStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(transformed, /hozoPanelContentStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.doesNotMatch(transformed, /sectionClassName="bg-\[#010101\]"/)
  assert.doesNotMatch(transformed, /headingClassName="mt-2"/)
  assert.doesNotMatch(transformed, /triggerClassName="bg-\[#111111\]/)
  assert.doesNotMatch(transformed, /panelClassName="bg-\[#fafafa\]/)
  assert.doesNotMatch(transformed, /panelContentClassName="pt-4/)
  // Transition panel and interactive section stay on the runtime path.
  assert.match(transformed, /panelClassName="transition-\[height\] duration-200 bg-\[#fafafa\]"/)
  assert.match(transformed, /sectionClassName="hover:opacity-50"/)

  const { code } = esbuild.transformSync(transformed, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    sourcefile: '/app/Screen.tsx',
  })

  let classResolverCalls = 0
  const spyHozoClasses = () => {
    classResolverCalls++
    return { paddingBottom: 77 }
  }
  const accordionMod = loadNativePatternModule('accordion.native.tsx', {
    hozoClasses: spyHozoClasses,
  })
  const screenMod = { exports: {} as { Screen: React.ComponentType<{ expanded?: string | null }> } }
  runInNewContext(code, {
    module: screenMod,
    exports: screenMod.exports,
    React,
    require: (specifier: string) => {
      if (specifier === 'react') return React
      if (specifier === 'react-native') return { StyleSheet: { create: <T>(styles: T) => styles } }
      if (specifier === '@hozo/patterns') return { Accordion: accordionMod.exports.Accordion }
      throw new Error(`Unexpected require: ${specifier}`)
    },
  })

  const renderCase = (
    expanded: string | null,
    interaction: {
      hovered?: boolean
      pressed?: boolean
      focused?: boolean
      focusVisible?: boolean
    } = {},
  ) => {
    accordionMod.captured.length = 0
    accordionMod.setInteraction({
      hovered: false,
      pressed: false,
      focused: false,
      focusVisible: false,
      ...interaction,
    })
    renderToStaticMarkup(React.createElement(screenMod.exports.Screen, { expanded }))
    return {
      views: accordionMod.captured
        .filter((entry) => entry.host === 'View')
        .map((entry) => flattenStyle(entry.props.style)),
      triggers: accordionMod.captured
        .filter((entry) => entry.host === 'Pressable')
        .map((entry) => flattenStyle(entry.props.style)),
      texts: accordionMod.captured
        .filter((entry) => entry.host === 'Text')
        .map((entry) => flattenStyle(entry.props.style)),
    }
  }

  const closed = renderCase(null)
  assert.equal(closed.views[1]!.backgroundColor, '#010101')
  assert.equal(closed.triggers[0]!.marginTop, 8)
  assert.equal(closed.triggers[0]!.backgroundColor, '#111111')
  assert.equal(closed.triggers[1]!.backgroundColor, '#666666')
  assert.equal(closed.texts[0]!.color, '#eeeeee')
  assert.equal(closed.texts[1]!.color, '#999999')

  assert.equal(renderCase(null, { hovered: true }).triggers[0]!.backgroundColor, '#222222')
  assert.equal(renderCase(null, { pressed: true }).triggers[0]!.backgroundColor, '#333333')
  assert.equal(
    renderCase(null, { focused: true, focusVisible: true }).triggers[0]!.borderColor,
    '#444444',
  )

  const opened = renderCase('a')
  // Views: [0: root, 1: section0, 2: panel0, 3: panelContent0, 4: section1]
  assert.equal(opened.triggers[0]!.backgroundColor, '#555555')
  assert.equal(opened.triggers[0]!.borderColor, '#777777')
  assert.equal(opened.views[2]!.backgroundColor, '#fafafa')
  assert.equal(opened.views[2]!.borderColor, '#888888')
  assert.equal(opened.views[3]!.paddingTop, 16)
  assert.equal(opened.texts[1]!.color, '#223344')

  assert.equal(classResolverCalls, 0, 'prepared Accordion literals must never call hozoClasses')

  for (const [classProp, preparedProp] of [
    ['sectionClassName', 'hozoSectionStyle'],
    ['headingClassName', 'hozoHeadingStyle'],
    ['triggerClassName', 'hozoTriggerStyle'],
    ['panelClassName', 'hozoPanelStyle'],
    ['panelContentClassName', 'hozoPanelContentStyle'],
  ]) {
    assert.throws(
      () =>
        renderToStaticMarkup(
          React.createElement(
            accordionMod.exports.Accordion as React.ComponentType<Record<string, unknown>>,
            {
              items: [{ id: 'a', header: 'A', content: 'B' }],
              [classProp]: 'pt-2',
              [preparedProp]: () => ({}),
            },
          ),
        ),
      new RegExp(`Prepared Accordion styles must consume ${classProp}`),
    )
  }
})

test('Native Tabs delivers prepared tabList, tab and panel styles without calling hozoClasses (#2046)', () => {
  const compiler = createCompiler()
  const source = `import { Tabs } from '@hozo/patterns'
export function Screen({ index }: { index?: number }) {
  return (
    <Tabs
      index={index}
      tabs={[
        { label: 'One', content: 'First body' },
        { label: 'Two', content: 'Second body' },
        { label: 'Three', content: 'Third body', disabled: true },
      ]}
      tabListClassName="bg-[#010101]"
      tabClassName="bg-[#111111] hover:bg-[#222222] active:bg-[#333333] focus-visible:border-[#444444] aria-selected:bg-[#555555] disabled:bg-[#666666] text-[#eeeeee] aria-selected:text-[#ffffff] disabled:text-[#999999]"
      panelClassName="p-4 bg-[#fafafa] text-[#223344]"
    />
  )
}
export function UnsupportedTabs() {
  return <Tabs tabs={[{ label: 'One', content: 'First' }]} tabListClassName="hover:bg-[#777777]" />
}
`
  const transformed = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(transformed)
  assert.match(transformed, /hozoTabListStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(transformed, /hozoTabStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(transformed, /hozoPanelStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.doesNotMatch(transformed, /tabListClassName="bg-\[#010101\]"/)
  assert.doesNotMatch(transformed, /tabClassName="bg-\[#111111\]/)
  assert.doesNotMatch(transformed, /panelClassName="p-4/)
  // Stateless View tabList has no hover events; hover: stays on the runtime path.
  assert.match(transformed, /tabListClassName="hover:bg-\[#777777\]"/)

  const { code } = esbuild.transformSync(transformed, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    sourcefile: '/app/Screen.tsx',
  })

  let classResolverCalls = 0
  const spyHozoClasses = () => {
    classResolverCalls++
    return { paddingBottom: 77 }
  }
  const tabsMod = loadNativePatternModule('tabs.native.tsx', {
    hozoClasses: spyHozoClasses,
  })
  const screenMod = { exports: {} as { Screen: React.ComponentType<{ index?: number }> } }
  runInNewContext(code, {
    module: screenMod,
    exports: screenMod.exports,
    React,
    require: (specifier: string) => {
      if (specifier === 'react') return React
      if (specifier === 'react-native') return { StyleSheet: { create: <T>(styles: T) => styles } }
      if (specifier === '@hozo/patterns') return { Tabs: tabsMod.exports.Tabs }
      throw new Error(`Unexpected require: ${specifier}`)
    },
  })

  const renderCase = (
    index: number,
    interaction: Partial<{
      hovered: boolean
      pressed: boolean
      focused: boolean
      focusVisible: boolean
    }> = {},
  ) => {
    tabsMod.captured.length = 0
    tabsMod.setInteraction({
      hovered: false,
      pressed: false,
      focused: false,
      focusVisible: false,
      ...interaction,
    })
    renderToStaticMarkup(React.createElement(screenMod.exports.Screen, { index }))
    return {
      views: tabsMod.captured
        .filter((entry) => entry.host === 'View')
        .map((entry) => flattenStyle(entry.props.style)),
      tabs: tabsMod.captured
        .filter((entry) => entry.host === 'Pressable')
        .map((entry) => flattenStyle(entry.props.style)),
      texts: tabsMod.captured
        .filter((entry) => entry.host === 'Text')
        .map((entry) => flattenStyle(entry.props.style)),
    }
  }

  // Views: [0: root, 1: tabList, 2: panel]; Texts: [0: tab0, 1: tab1, 2: tab2, 3: panelText]
  const initial = renderCase(0)
  assert.equal(initial.views[1]!.backgroundColor, '#010101')
  assert.equal(initial.tabs[0]!.backgroundColor, '#555555')
  assert.equal(initial.tabs[1]!.backgroundColor, '#111111')
  assert.equal(initial.tabs[2]!.backgroundColor, '#666666')
  assert.equal(initial.texts[0]!.color, '#ffffff')
  assert.equal(initial.texts[1]!.color, '#eeeeee')
  assert.equal(initial.texts[2]!.color, '#999999')
  assert.equal(initial.views[2]!.backgroundColor, '#fafafa')
  assert.equal(initial.views[2]!.paddingTop, 16)
  assert.equal(initial.texts[3]!.color, '#223344')

  assert.equal(renderCase(0, { hovered: true }).tabs[1]!.backgroundColor, '#222222')
  assert.equal(renderCase(0, { pressed: true }).tabs[1]!.backgroundColor, '#333333')
  assert.equal(renderCase(0, { focused: true, focusVisible: true }).tabs[1]!.borderColor, '#444444')
  assert.equal(renderCase(1).tabs[1]!.backgroundColor, '#555555')

  assert.equal(classResolverCalls, 0, 'prepared Tabs literals must never call hozoClasses')

  for (const [classProp, preparedProp, label] of [
    ['tabListClassName', 'hozoTabListStyle', 'tabList'],
    ['tabClassName', 'hozoTabStyle', 'tab'],
    ['panelClassName', 'hozoPanelStyle', 'panel'],
  ]) {
    assert.throws(
      () =>
        renderToStaticMarkup(
          React.createElement(
            tabsMod.exports.Tabs as React.ComponentType<Record<string, unknown>>,
            {
              tabs: [{ label: 'One', content: 'Body' }],
              [classProp]: 'pt-2',
              [preparedProp]: () => ({}),
            },
          ),
        ),
      new RegExp(`Prepared Tabs ${label} styles must consume ${classProp}`),
    )
  }
})
