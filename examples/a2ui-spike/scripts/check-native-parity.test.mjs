// Cross-platform parity check: feeds the exact same A2UI v1.0 messages through
// the exact same `A2uiSurface` renderer and `hozo-catalog.tsx` compiled for
// both Web (Vite + Chromium) and Native (`transformHozoSource` + real
// `@hozo/ui/src/theme.css` candidate module), asserting matching resolved styles
// and identical dispatched action payloads.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createCompiler, openCandidateCache } from '@hozo/compiler'
import { loadTheme } from '@hozo/tailwind'
import { build, transformSync } from 'esbuild'
import { chromium } from 'playwright-core'
import React, { act } from 'react'
import { create } from 'react-test-renderer'
import * as classResolverRuntime from '../../../packages/engine/src/generated/class-resolver.ts'
import * as shadowRuntime from '../../../packages/engine/src/generated/shadow-slots.ts'
import * as transformRuntime from '../../../packages/engine/src/generated/transform-slots.ts'
import { transformHozoSource } from '../../../packages/metro/src/transform.ts'
import { createA2uiStore } from '../src/engine.ts'
import {
  deploymentStatusV1Messages,
  deploymentStatusV091Messages,
  deploymentUnblockUpdates,
  SURFACE_ID,
} from '../src/fixtures.ts'
import { A2uiSurface } from '../src/renderer.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const require = createRequire(import.meta.url)
const spikeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(spikeRoot, '..', '..')
const uiRoot = path.join(repoRoot, 'packages', 'ui')
const distDir = path.join(spikeRoot, 'dist')
const filename = (relative) => path.join(repoRoot, relative).replaceAll('\\', '/')

const executablePath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((file) => file && existsSync(file))

if (process.env.CI) assert.ok(executablePath, 'CI must run Web vs Native A2UI parity checks')

const flat = (value) => Object.assign({}, ...[value].flat(Infinity).filter(Boolean))

function pxNumber(value) {
  return Number.parseFloat(value)
}

// Compile the exact same `hozo-catalog.tsx` + `@hozo/ui` sources for Native
// using Hozo's real Native compiler and real `@hozo/ui/src/theme.css`.
async function buildNativeCatalogHarness() {
  const theme = await loadTheme('@import "tailwindcss"; @import "./src/theme.css";', uiRoot)
  const compiler = createCompiler(theme)
  const cache = openCandidateCache()
  for (const rel of [
    'packages/ui/src/button.tsx',
    'packages/ui/src/card.tsx',
    'packages/ui/src/stack.tsx',
    'packages/ui/src/status.tsx',
    'examples/a2ui-spike/src/hozo-catalog.tsx',
  ]) {
    cache.scanFile(rel, readFileSync(path.join(repoRoot, rel), 'utf8'), 1)
  }

  const candidateModuleSource = transformSync(cache.renderNativeModule(theme), {
    format: 'cjs',
  }).code
  const candidateMod = { exports: {} }
  new Function('require', 'module', 'exports', candidateModuleSource)(
    (id) => {
      if (id === '@hozo/core/generated/class-resolver') return classResolverRuntime
      if (id === '@hozo/core/generated/shadow-slots') return shadowRuntime
      if (id === '@hozo/core/generated/transform-slots') return transformRuntime
      if (id === 'react-native') return { I18nManager: { isRTL: false } }
      throw new Error(`Unexpected generated candidate import: ${id}`)
    },
    candidateMod,
    candidateMod.exports,
  )
  const hozoClasses = candidateMod.exports.hozoClasses

  const announcements = []
  const NativeView = (props) => React.createElement('NativeView', props, props.children)
  const NativeText = (props) => React.createElement('NativeText', props, props.children)
  const NativeAnimatedView = (props) =>
    React.createElement('NativeAnimatedView', props, props.children)
  const nativeAnimated = {
    createAnimatedComponent: (Component) => Component,
    View: NativeAnimatedView,
    Value: class {
      constructor(value) {
        this.value = value
        this._listeners = new Map()
        this._nextId = 1
      }
      setValue(value) {
        this.value = value
        for (const cb of this._listeners.values()) cb({ value })
      }
      addListener(cb) {
        const id = String(this._nextId++)
        this._listeners.set(id, cb)
        return id
      }
      removeListener(id) {
        this._listeners.delete(id)
      }
      interpolate({ inputRange, outputRange }) {
        return this.value <= inputRange[0] ? outputRange[0] : outputRange[outputRange.length - 1]
      }
    },
    timing: (value, config) => ({
      start: (done) => {
        value.setValue(config.toValue)
        done?.({ finished: true })
      },
      stop: () => {},
    }),
    parallel: (animations) => ({
      start: (done) => {
        for (const a of animations) a.start()
        done?.({ finished: true })
      },
      stop: () => {
        for (const a of animations) a.stop()
      },
    }),
  }
  const NativePressable = ({ children, style, disabled, ...props }) => {
    const state = { pressed: false }
    return React.createElement(
      'NativePressable',
      {
        ...props,
        disabled,
        onPress: disabled ? undefined : props.onPress,
        style: typeof style === 'function' ? style(state) : style,
      },
      typeof children === 'function' ? children(state) : children,
    )
  }

  const bundled = await build({
    stdin: {
      contents: `export { hozoUiCatalog } from ${JSON.stringify(filename('examples/a2ui-spike/src/hozo-catalog.tsx'))};`,
      resolveDir: repoRoot,
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    packages: 'external',
    plugins: [
      {
        name: 'hozo-native-a2ui',
        setup(builder) {
          builder.onResolve({ filter: /^@hozo\/ui$/ }, () => ({
            path: 'hozo-ui-subset',
            namespace: 'hozo-ui-subset',
          }))
          builder.onLoad({ filter: /.*/, namespace: 'hozo-ui-subset' }, () => ({
            contents: [
              `export { HozoButton as Button } from ${JSON.stringify(filename('packages/ui/src/button.tsx'))};`,
              `export { HozoCard as Card } from ${JSON.stringify(filename('packages/ui/src/card.tsx'))};`,
              `export { HozoStack as Stack } from ${JSON.stringify(filename('packages/ui/src/stack.tsx'))};`,
              `export { HozoAlert as Alert } from ${JSON.stringify(filename('packages/ui/src/status.tsx'))};`,
            ].join('\n'),
            loader: 'ts',
            resolveDir: repoRoot,
          }))
          builder.onResolve({ filter: /^@hozo\/primitives$/ }, () => ({
            path: 'hozo-primitives-subset',
            namespace: 'hozo-primitives-subset',
          }))
          builder.onLoad({ filter: /.*/, namespace: 'hozo-primitives-subset' }, () => ({
            contents: `export { Button } from ${JSON.stringify(filename('packages/primitives/src/foundation.native.tsx'))};`,
            loader: 'ts',
            resolveDir: repoRoot,
          }))
          builder.onResolve({ filter: /^@hozo\/patterns$/ }, () => ({
            path: 'hozo-patterns-subset',
            namespace: 'hozo-patterns-subset',
          }))
          builder.onLoad({ filter: /.*/, namespace: 'hozo-patterns-subset' }, () => ({
            contents: `export { HozoAlert as Alert } from ${JSON.stringify(filename('packages/patterns/src/alert.native.tsx'))};`,
            loader: 'ts',
            resolveDir: repoRoot,
          }))
          builder.onResolve({ filter: /^@hozo\/behaviors$/ }, () => ({
            path: 'hozo-behaviors-subset',
            namespace: 'hozo-behaviors-subset',
          }))
          builder.onLoad({ filter: /.*/, namespace: 'hozo-behaviors-subset' }, () => ({
            contents: [
              `export { useHozoMessage } from ${JSON.stringify(filename('packages/behaviors/src/i18n.ts'))};`,
              `export { hozoTextChildren } from ${JSON.stringify(filename('packages/behaviors/src/text-child.native.tsx'))};`,
            ].join('\n'),
            loader: 'ts',
            resolveDir: repoRoot,
          }))
          builder.onResolve({ filter: /^@hozo\/behaviors\/pressable-interaction$/ }, () => ({
            path: filename('packages/behaviors/src/pressable-interaction.ts'),
          }))
          builder.onResolve({ filter: /^@hozo\/engine\/navigation$/ }, () => ({
            path: filename('packages/engine/src/navigation-entry.native.ts'),
          }))
          builder.onResolve({ filter: /^@hozo\/engine$/ }, () => ({
            path: filename('packages/engine/src/index.ts'),
          }))
          builder.onResolve({ filter: /^@hozo\/core$/ }, () => ({
            path: 'hozo-core-subset',
            namespace: 'hozo-core-subset',
          }))
          builder.onLoad({ filter: /.*/, namespace: 'hozo-core-subset' }, () => ({
            contents: [
              `export { cx } from ${JSON.stringify(filename('packages/engine/src/cx.ts'))};`,
              `export { Badge } from ${JSON.stringify(filename('packages/semantics/src/index.native.tsx'))};`,
              `export { View, Text } from 'react-native';`,
            ].join('\n'),
            loader: 'ts',
            resolveDir: repoRoot,
          }))
          builder.onResolve(
            {
              filter:
                /^@hozo\/(?:core|engine)\/generated\/(text-inheritance-protocol|text-size-context|interactive|authored-edges|class-resolver|gap-styles|shadow-slots|spread-styles|transform-slots)$/,
            },
            ({ path: specifier }) => ({
              path: filename(`packages/engine/src/generated/${specifier.split('/').at(-1)}.ts`),
            }),
          )
          builder.onResolve({ filter: /^@hozo\/(?:core|semantics)\/generated\/badge$/ }, () => ({
            path: filename('packages/semantics/src/generated/badge.native.ts'),
          }))
          builder.onResolve(
            {
              filter:
                /^@hozo\/(?:core|primitives)\/generated\/(button-props|pressable|view|link|text|text-size|spaced|native-disabled|inherited-leaves)$/,
            },
            ({ path: specifier }) => {
              const leaf = specifier.split('/').at(-1)
              const nativePath = filename(`packages/primitives/src/generated/${leaf}.native.ts`)
              return {
                path: existsSync(nativePath)
                  ? nativePath
                  : filename(`packages/primitives/src/generated/${leaf}.ts`),
              }
            },
          )
          builder.onResolve({ filter: /(?:^|\/)candidates\.native\.js$/ }, () => ({
            path: '@hozo/engine/project',
            external: true,
          }))
          builder.onLoad(
            {
              filter:
                /[/\\](?:ui[/\\]src[/\\](?:button|card|stack|status)|a2ui-spike[/\\]src[/\\]hozo-catalog)\.tsx$/,
            },
            ({ path: file }) => ({
              contents: transformHozoSource(readFileSync(file, 'utf8'), file, repoRoot, compiler),
              loader: 'tsx',
              resolveDir: path.dirname(file),
            }),
          )
        },
      },
    ],
  })

  const mod = { exports: {} }
  new Function('require', 'module', 'exports', bundled.outputFiles[0].text)(
    (name) => {
      if (name === 'react-native') {
        return {
          View: NativeView,
          Text: NativeText,
          Pressable: NativePressable,
          Animated: nativeAnimated,
          Easing: {
            linear: (v) => v,
            ease: (v) => v,
            in: (fn) => fn,
            out: (fn) => fn,
            inOut: (fn) => fn,
          },
          Platform: { OS: 'android' },
          AccessibilityInfo: { announceForAccessibility: (msg) => announcements.push(msg) },
          I18nManager: { isRTL: false },
          StyleSheet: { flatten: flat, create: (styles) => styles },
        }
      }
      if (
        name === '@hozo/core/generated/environment' ||
        name === '@hozo/engine/generated/environment'
      ) {
        return {
          useHozoDark: () => false,
          useHozoEnvironment: () => false,
          useHozoViewport: () => ({ width: 400, height: 800 }),
        }
      }
      if (name === '@hozo/engine/project') {
        return { hozoClasses, hozoClassTransitions: {}, hozoPreflight: {} }
      }
      if (name === '@hozo/core/generated/animated' || name === '@hozo/engine/generated/animated') {
        return { HozoAnimated: NativeView }
      }
      if (name === 'react' || name === 'react/jsx-runtime' || name === 'zod') return require(name)
      throw new Error(`Unexpected external require in Native harness: ${name}`)
    },
    mod,
    mod.exports,
  )

  const tokenHex = (token) =>
    theme.colors.find((entry) => entry.token === token)?.hex?.toLowerCase()
  return { hozoUiCatalog: mod.exports.hozoUiCatalog, tokenHex, announcements }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
}

let server
let baseUrl
let browser
let nativeHarness

before(async () => {
  nativeHarness = await buildNativeCatalogHarness()
  if (executablePath && existsSync(path.join(distDir, 'index.html'))) {
    server = createServer((req, res) => {
      const clean = (req.url || '/').split('?')[0]
      const target = path.join(distDir, clean === '/' ? 'index.html' : clean)
      if (!target.startsWith(distDir) || !existsSync(target)) {
        res.statusCode = 404
        res.end('Not found')
        return
      }
      res.setHeader('Content-Type', MIME[path.extname(target)] ?? 'application/octet-stream')
      res.end(readFileSync(target))
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${server.address().port}`
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-gpu'],
    })
  }
})

after(async () => {
  await browser?.close()
  if (server) await new Promise((resolve) => server.close(resolve))
})

function extractNativeMeasurements(tree) {
  const views = tree.root.findAllByType('NativeView')
  const texts = tree.root.findAllByType('NativeText')
  const buttons = tree.root.findAllByType('NativePressable')

  const textOf = (node) => {
    const collect = (child) => {
      if (typeof child === 'string' || typeof child === 'number') return String(child)
      if (!child || typeof child !== 'object') return ''
      if (Array.isArray(child.children)) return child.children.map(collect).join('')
      return ''
    }
    return collect(node)
  }

  const card = views[0]
  const rootStack = views[1]
  const alertView = views.find((v) => v.props.accessibilityLiveRegion === 'polite')
  const actionsRow = views.find((v) => flat(v.props.style).flexDirection === 'row')
  const approve = buttons.find((b) => textOf(b) === 'Approve release')
  const rollback = buttons.find((b) => textOf(b) === 'Rollback')
  const heading = texts.find((t) => textOf(t) === 'Release 0.5.2 Ready Check')
  const summary = texts.find(
    (t) => textOf(t) === 'Waiting for the final browser check before promotion.',
  )
  const checkItem = texts.find((t) => textOf(t) === 'lint: passed')

  const cardStyle = flat(card.props.style)
  const rootStackStyle = flat(rootStack.props.style)
  const alertStyle = flat(alertView.props.style)
  const alertTextStyle = flat(alertView.findAllByType('NativeText')[0].props.style)
  const actionsRowStyle = flat(actionsRow.props.style)
  const approveStyle = flat(approve.props.style)
  const approveTextStyle = flat(approve.findAllByType('NativeText')[0].props.style)
  const rollbackStyle = flat(rollback.props.style)
  const rollbackTextStyle = flat(rollback.findAllByType('NativeText')[0].props.style)
  const headingStyle = flat(heading.props.style)
  const summaryStyle = flat(summary.props.style)
  const checkItemStyle = flat(checkItem.props.style)

  return {
    card: {
      backgroundColor: cardStyle.backgroundColor?.toLowerCase(),
      borderColor: cardStyle.borderColor?.toLowerCase(),
      paddingTop: cardStyle.paddingTop,
      borderRadius: cardStyle.borderRadius,
    },
    rootStack: {
      flexDirection: rootStackStyle.flexDirection,
      gap: rootStackStyle.rowGap ?? rootStackStyle.gap,
    },
    actionsRow: {
      flexDirection: actionsRowStyle.flexDirection,
      gap: actionsRowStyle.columnGap ?? actionsRowStyle.gap,
    },
    alert: {
      backgroundColor: alertStyle.backgroundColor?.toLowerCase(),
      borderColor: alertStyle.borderColor?.toLowerCase(),
      color: alertTextStyle.color?.toLowerCase(),
      paddingTop: alertStyle.paddingTop,
      paddingLeft:
        alertStyle.paddingStart ?? alertStyle.paddingLeft ?? alertStyle.paddingHorizontal,
      liveRegion: alertView.props.accessibilityLiveRegion,
    },
    approve: {
      disabled: Boolean(approve.props.disabled),
      accessibilityLabel: approve.props.accessibilityLabel,
      backgroundColor: approveStyle.backgroundColor?.toLowerCase(),
      color: approveTextStyle.color?.toLowerCase(),
      paddingTop: approveStyle.paddingTop ?? approveStyle.paddingVertical,
      paddingLeft:
        approveStyle.paddingStart ?? approveStyle.paddingLeft ?? approveStyle.paddingHorizontal,
      borderRadius: approveStyle.borderRadius,
    },
    rollback: {
      disabled: Boolean(rollback.props.disabled),
      backgroundColor: rollbackStyle.backgroundColor?.toLowerCase(),
      color: rollbackTextStyle.color?.toLowerCase(),
      paddingTop: rollbackStyle.paddingTop ?? rollbackStyle.paddingVertical,
      paddingLeft:
        rollbackStyle.paddingStart ?? rollbackStyle.paddingLeft ?? rollbackStyle.paddingHorizontal,
      borderRadius: rollbackStyle.borderRadius,
    },
    heading: {
      color: headingStyle.color?.toLowerCase(),
      fontSize: headingStyle.fontSize,
      fontWeight: String(headingStyle.fontWeight),
    },
    summary: {
      color: summaryStyle.color?.toLowerCase(),
      fontSize: summaryStyle.fontSize,
      fontWeight: String(summaryStyle.fontWeight),
    },
    checkItem: {
      color: checkItemStyle.color?.toLowerCase(),
      fontSize: checkItemStyle.fontSize,
      fontWeight: String(checkItemStyle.fontWeight),
    },
    approveNode: approve,
    rollbackNode: rollback,
  }
}

test('Native compiled catalog renders A2UI v1.0 and v0.9.1 with real theme tokens, reactive updates, and actions', async (t) => {
  assert.equal(typeof globalThis.HTMLElement, 'undefined')
  assert.equal(typeof globalThis.document, 'undefined')

  for (const [label, messages] of [
    ['1.0', deploymentStatusV1Messages],
    ['v0.9.1', deploymentStatusV091Messages],
  ]) {
    const actions = []
    const store = createA2uiStore({
      catalogs: [nativeHarness.hozoUiCatalog],
      onAction: (msg) => actions.push(msg),
      now: () => '2026-11-25T00:00:00.000Z',
    })
    assert.deepEqual(store.processMessages(messages), [], `${label}: messages accepted`)

    let tree
    await act(() => {
      tree = create(React.createElement(A2uiSurface, { store, surfaceId: SURFACE_ID }))
    })
    t.after(async () => {
      await act(() => tree.unmount())
    })

    const locked = extractNativeMeasurements(tree)
    assert.equal(locked.card.backgroundColor, nativeHarness.tokenHex('hozo-surface'))
    assert.equal(locked.card.borderColor, nativeHarness.tokenHex('hozo-border'))
    assert.equal(locked.card.paddingTop, 24)
    assert.equal(locked.rootStack.flexDirection, 'column')
    assert.equal(locked.rootStack.gap, 16)
    assert.equal(locked.actionsRow.flexDirection, 'row')
    assert.equal(locked.actionsRow.gap, 8)
    assert.equal(locked.alert.backgroundColor, nativeHarness.tokenHex('hozo-danger-subtle'))
    assert.equal(locked.alert.borderColor, nativeHarness.tokenHex('hozo-danger'))
    assert.equal(locked.alert.color, nativeHarness.tokenHex('hozo-danger-text'))
    assert.equal(locked.alert.liveRegion, 'polite')
    assert.equal(locked.approve.disabled, true)
    assert.equal(locked.approve.accessibilityLabel, 'Approve release 0.5.2 for production')
    assert.equal(locked.approve.backgroundColor, nativeHarness.tokenHex('hozo-surface-raised'))
    assert.equal(locked.approve.color, nativeHarness.tokenHex('hozo-text-subtle'))
    assert.equal(locked.rollback.backgroundColor, nativeHarness.tokenHex('hozo-danger'))
    assert.equal(locked.rollback.color, nativeHarness.tokenHex('hozo-on-danger'))

    // Live in-place `updateDataModel` unblocks Approve button: `disabled` flips
    // to false and both background (`hozo-accent`) and label (`hozo-on-accent`)
    // update on the already-mounted Native tree (#2273 / #2284).
    await act(() => {
      assert.deepEqual(store.processMessages(deploymentUnblockUpdates), [])
    })
    const unlocked = extractNativeMeasurements(tree)
    assert.equal(unlocked.approve.disabled, false)
    assert.equal(unlocked.approve.backgroundColor, nativeHarness.tokenHex('hozo-accent'))
    assert.equal(unlocked.approve.color, nativeHarness.tokenHex('hozo-on-accent'))

    await act(() => {
      unlocked.approveNode.props.onPress()
      unlocked.rollbackNode.props.onPress()
    })
    assert.equal(actions.length, 2)
    assert.equal(actions[0].action.name, 'approve_release')
    assert.deepEqual(actions[0].action.context, { version: '0.5.2', environment: 'production' })
    assert.equal(actions[1].action.name, 'rollback_release')
  }
})

test('Web Chromium and Native produce matching resolved styles and identical A2UI action payloads', {
  skip: !executablePath,
}, async (t) => {
  // 1. Native run (locked -> live in-place unblock -> press both buttons)
  const nativeActions = []
  const store = createA2uiStore({
    catalogs: [nativeHarness.hozoUiCatalog],
    onAction: (msg) => nativeActions.push(msg),
    now: () => '2026-11-25T00:00:00.000Z',
  })
  store.processMessages(deploymentStatusV1Messages)
  let tree
  await act(() => {
    tree = create(React.createElement(A2uiSurface, { store, surfaceId: SURFACE_ID }))
  })
  t.after(async () => {
    await act(() => tree.unmount())
  })
  const nativeLocked = extractNativeMeasurements(tree)
  await act(() => {
    store.processMessages(deploymentUnblockUpdates)
  })
  const nativeUnlocked = extractNativeMeasurements(tree)
  await act(() => {
    nativeUnlocked.approveNode.props.onPress()
    nativeUnlocked.rollbackNode.props.onPress()
  })

  // 2. Web Chromium run on the exact same A2UI v1.0 messages
  const page = await browser.newPage()
  try {
    await page.goto(baseUrl, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => Boolean(window.__a2uiSpike))

    const readWeb = () =>
      page.evaluate(() => {
        const root = document.getElementById('root')
        const card = root.firstElementChild
        const rootStack = card.firstElementChild
        const alertEl = root.querySelector('[role="status"]')
        const buttons = Array.from(root.querySelectorAll('button'))
        const approve = buttons[0]
        const rollback = buttons[1]
        const actionsRow = approve.parentElement
        const heading = Array.from(root.querySelectorAll('span')).find(
          (el) => el.textContent === 'Release 0.5.2 Ready Check',
        )
        const summary = Array.from(root.querySelectorAll('span')).find(
          (el) => el.textContent === 'Waiting for the final browser check before promotion.',
        )
        const checkItem = Array.from(root.querySelectorAll('span')).find(
          (el) => el.textContent === 'lint: passed',
        )

        const cs = (el) => getComputedStyle(el)
        const canvas = document.createElement('canvas')
        canvas.width = 1
        canvas.height = 1
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        const toHex = (cssColor) => {
          ctx.clearRect(0, 0, 1, 1)
          ctx.fillStyle = cssColor
          ctx.fillRect(0, 0, 1, 1)
          const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
          return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
        }
        return {
          card: {
            backgroundColor: toHex(cs(card).backgroundColor),
            borderColor: toHex(cs(card).borderTopColor),
            paddingTop: cs(card).paddingTop,
            borderRadius: cs(card).borderTopLeftRadius,
          },
          rootStack: {
            flexDirection: cs(rootStack).flexDirection,
            gap: cs(rootStack).rowGap,
          },
          actionsRow: {
            flexDirection: cs(actionsRow).flexDirection,
            gap: cs(actionsRow).columnGap,
          },
          alert: {
            backgroundColor: toHex(cs(alertEl).backgroundColor),
            borderColor: toHex(cs(alertEl).borderTopColor),
            color: toHex(cs(alertEl).color),
            paddingTop: cs(alertEl).paddingTop,
            paddingLeft: cs(alertEl).paddingLeft,
          },
          approve: {
            disabled: approve.disabled,
            accessibilityLabel: approve.getAttribute('aria-label'),
            backgroundColor: toHex(cs(approve).backgroundColor),
            color: toHex(cs(approve).color),
            paddingTop: cs(approve).paddingTop,
            paddingLeft: cs(approve).paddingLeft,
            borderRadius: cs(approve).borderTopLeftRadius,
          },
          rollback: {
            disabled: rollback.disabled,
            backgroundColor: toHex(cs(rollback).backgroundColor),
            color: toHex(cs(rollback).color),
            paddingTop: cs(rollback).paddingTop,
            paddingLeft: cs(rollback).paddingLeft,
            borderRadius: cs(rollback).borderTopLeftRadius,
          },
          heading: {
            color: toHex(cs(heading).color),
            fontSize: cs(heading).fontSize,
            fontWeight: cs(heading).fontWeight,
          },
          summary: {
            color: toHex(cs(summary).color),
            fontSize: cs(summary).fontSize,
            fontWeight: cs(summary).fontWeight,
          },
          checkItem: {
            color: toHex(cs(checkItem).color),
            fontSize: cs(checkItem).fontSize,
            fontWeight: cs(checkItem).fontWeight,
          },
        }
      })

    const normalizeWeb = (w) => ({
      card: {
        backgroundColor: w.card.backgroundColor,
        borderColor: w.card.borderColor,
        paddingTop: pxNumber(w.card.paddingTop),
        borderRadius: pxNumber(w.card.borderRadius),
      },
      rootStack: {
        flexDirection: w.rootStack.flexDirection,
        gap: pxNumber(w.rootStack.gap),
      },
      actionsRow: {
        flexDirection: w.actionsRow.flexDirection,
        gap: pxNumber(w.actionsRow.gap),
      },
      alert: {
        backgroundColor: w.alert.backgroundColor,
        borderColor: w.alert.borderColor,
        color: w.alert.color,
        paddingTop: pxNumber(w.alert.paddingTop),
        paddingLeft: pxNumber(w.alert.paddingLeft),
      },
      approve: {
        disabled: w.approve.disabled,
        accessibilityLabel: w.approve.accessibilityLabel,
        backgroundColor: w.approve.backgroundColor,
        color: w.approve.color,
        paddingTop: pxNumber(w.approve.paddingTop),
        paddingLeft: pxNumber(w.approve.paddingLeft),
        borderRadius: pxNumber(w.approve.borderRadius),
      },
      rollback: {
        disabled: w.rollback.disabled,
        backgroundColor: w.rollback.backgroundColor,
        color: w.rollback.color,
        paddingTop: pxNumber(w.rollback.paddingTop),
        paddingLeft: pxNumber(w.rollback.paddingLeft),
        borderRadius: pxNumber(w.rollback.borderRadius),
      },
      heading: {
        color: w.heading.color,
        fontSize: pxNumber(w.heading.fontSize),
        fontWeight: String(w.heading.fontWeight),
      },
      summary: {
        color: w.summary.color,
        fontSize: pxNumber(w.summary.fontSize),
        fontWeight: String(w.summary.fontWeight),
      },
      checkItem: {
        color: w.checkItem.color,
        fontSize: pxNumber(w.checkItem.fontSize),
        fontWeight: String(w.checkItem.fontWeight),
      },
    })

    const stripNativeOnly = (n) => {
      const { liveRegion: _live, ...alertRest } = n.alert
      return {
        card: n.card,
        rootStack: n.rootStack,
        actionsRow: n.actionsRow,
        alert: alertRest,
        approve: n.approve,
        rollback: n.rollback,
        heading: n.heading,
        summary: n.summary,
        checkItem: n.checkItem,
      }
    }

    const webLocked = normalizeWeb(await readWeb())
    assert.deepEqual(webLocked, stripNativeOnly(nativeLocked), 'locked state Web vs Native parity')

    await page.evaluate(() => window.__a2uiSpike.applyUnblock())
    // Wait for `transition-colors` (150ms) on the Approve button to settle on Web.
    const expectedAccentHex = nativeHarness.tokenHex('hozo-accent')
    await page.waitForFunction((accentHex) => {
      const approve = document.querySelectorAll('#root button')[0]
      if (!approve || approve.disabled) return false
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = getComputedStyle(approve).backgroundColor
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
      const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
      return hex === accentHex
    }, expectedAccentHex)

    const webUnlocked = normalizeWeb(await readWeb())
    assert.deepEqual(
      webUnlocked,
      stripNativeOnly(nativeUnlocked),
      'live in-place unlocked state Web vs Native parity',
    )

    await page.getByRole('button', { name: 'Approve release 0.5.2 for production' }).click()
    await page.getByRole('button', { name: 'Rollback' }).click()
    const webActions = await page.evaluate(() => window.__a2uiSpike.getActions())
    assert.deepEqual(webActions, nativeActions, 'Web vs Native dispatched A2UI action parity')
  } finally {
    await page.close()
  }
})
