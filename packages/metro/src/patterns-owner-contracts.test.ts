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
    if (specifier === '@hozo/engine/generated/animated') return { HozoAnimated: rn.View }
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
