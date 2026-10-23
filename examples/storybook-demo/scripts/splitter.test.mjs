import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'
import React, { act } from 'react'
import { create } from 'react-test-renderer'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const require = createRequire(import.meta.url)
const executablePath = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((file) => file && existsSync(file))
if (process.env.CI) assert.ok(executablePath, 'CI requires splitter browser coverage')

test('captured drags, final release, cancellation, keys, RTL and collapsed focus in a real browser', {
  skip: !executablePath,
}, async () => {
  const bundle = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {ResizablePane} from './packages/patterns/src/splitter.tsx';
      window.mount=(side='start',rtl=false)=>{ window.events=[]; document.documentElement.dir=rtl?'rtl':'ltr'; window.fixtureRoot??=createRoot(document.querySelector('#root')); window.fixtureRoot.render(React.createElement(ResizablePane,{key:window.mountId=(window.mountId??0)+1,side,label:'Files',min:100,max:400,defaultSize:200,collapsible:true,handleStyle:{width:12,height:100,background:'gray'},onSizeChange:n=>events.push(['change',n]),onSizeCommit:n=>events.push(['commit',n]),onSizeCancel:()=>events.push(['cancel'])},React.createElement('button',null,'A file'))); }; mount();`,
      resolveDir: root,
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    alias: {
      react: path.dirname(require.resolve('react/package.json')),
      'react-dom': path.dirname(require.resolve('react-dom/package.json')),
    },
  })
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setContent('<!doctype html><div id="root"></div><button id="after">After</button>')
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    const handle = page.getByRole('separator')
    try {
      await handle.waitFor()
    } catch (error) {
      throw new Error(`${error.message}\nBrowser errors: ${errors.join('\n')}`)
    }
    await handle.focus()
    await handle.press('ArrowRight')
    assert.equal(await handle.getAttribute('aria-valuenow'), '208')
    await handle.press('Shift+ArrowRight')
    assert.equal(await handle.getAttribute('aria-valuenow'), '240')
    await handle.press('Enter')
    assert.equal(await handle.getAttribute('aria-valuenow'), '0')
    assert.equal(await page.locator('section').evaluate((node) => node.inert), true)
    await handle.press('Tab')
    assert.equal(await page.evaluate(() => document.activeElement.id), 'after')
    await handle.focus()
    await handle.press('Enter')
    assert.equal(await handle.getAttribute('aria-valuenow'), '240')
    await handle.press('Home')
    assert.equal(await handle.getAttribute('aria-valuenow'), '100')
    await handle.press('End')
    assert.equal(await handle.getAttribute('aria-valuenow'), '400')
    for (const side of ['start', 'end', 'top', 'bottom'])
      for (const rtl of [false, true]) {
        await page.evaluate(({ side, rtl }) => window.mount(side, rtl), { side, rtl })
        await page.waitForFunction(
          () => document.querySelector('[role=separator]').getAttribute('aria-valuenow') === '200',
        )
        const vertical = side === 'start' || side === 'end'
        const sign = (side === 'end' || side === 'bottom' ? -1 : 1) * (vertical && rtl ? -1 : 1)
        const box = await handle.boundingBox()
        const x = box.x + box.width / 2,
          y = box.y + box.height / 2
        await page.evaluate(() => {
          window.events = []
        })
        await page.mouse.move(x, y)
        await page.mouse.down()
        await page.mouse.move(x + (vertical ? 60 : 0), y + (vertical ? 0 : 60))
        await page.mouse.up()
        assert.equal(
          await handle.getAttribute('aria-valuenow'),
          String(200 + sign * 60),
          `${side}, RTL=${rtl}`,
        )
        assert.deepEqual(
          await page.evaluate(() => events.filter(([event]) => event === 'commit')),
          [['commit', 200 + sign * 60]],
        )
        const after = await handle.boundingBox()
        await page.mouse.move(after.x + after.width / 2, after.y + after.height / 2)
        await page.mouse.down()
        await page.mouse.move(after.x + 50, after.y + 50)
        await page.waitForFunction(() =>
          document.querySelector('[role=separator]').hasAttribute('data-dragging'),
        )
        await handle.dispatchEvent('pointercancel', { pointerId: 1, isPrimary: true })
        await page.mouse.up()
        assert.equal(await handle.getAttribute('aria-valuenow'), String(200 + sign * 60))
        assert.equal(
          await page.evaluate(() => events.filter(([event]) => event === 'commit').length),
          1,
        )
        await handle.press(vertical ? 'ArrowRight' : 'ArrowDown')
        assert.equal(await handle.getAttribute('aria-valuenow'), String(200 + sign * 68))
      }
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
  }
})

test('Native responder and adjustable actions share state and expose collapse facts (mock hosts)', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const frames = new Map()
  let serial = 0
  const oldFrame = globalThis.requestAnimationFrame,
    oldCancel = globalThis.cancelAnimationFrame
  globalThis.requestAnimationFrame = (callback) => {
    frames.set(++serial, callback)
    return serial
  }
  globalThis.cancelAnimationFrame = (id) => frames.delete(id)
  const facts = []
  const direction = { isRTL: false }
  const bundle = await build({
    entryPoints: [path.join(root, 'packages/patterns/src/splitter.native.tsx')],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    external: ['react', 'react-native', '@hozo/engine/project'],
    plugins: [
      {
        name: 'narrow-behaviors',
        setup(build) {
          build.onResolve({ filter: /^@hozo\/behaviors$/ }, () => ({
            path: 'i18n',
            namespace: 'behavior-test',
          }))
          build.onResolve({ filter: /^@hozo\/behaviors\/native$/ }, () => ({
            path: path.join(root, 'packages/behaviors/src/drag-1d.native.ts'),
          }))
          build.onLoad({ filter: /.*/, namespace: 'behavior-test' }, () => ({
            contents: `export {useHozoMessage} from ${JSON.stringify(path.join(root, 'packages/behaviors/src/i18n.ts'))}; export {hozoTextChildren} from ${JSON.stringify(path.join(root, 'packages/behaviors/src/text-child.native.tsx'))}`,
            resolveDir: root,
          }))
        },
      },
    ],
  })
  const native = {
    View: 'NativeView',
    Text: 'NativeText',
    I18nManager: direction,
    PanResponder: { create: (handlers) => ({ panHandlers: handlers }) },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(
    (name) =>
      name === 'react-native'
        ? native
        : name === '@hozo/engine/project'
          ? {
              hozoClasses: (_value, state) => {
                if (state) facts.push(state)
                return []
              },
            }
          : require(name),
    module,
    module.exports,
  )
  try {
    for (const rtl of [false, true])
      for (const side of ['start', 'end', 'top', 'bottom']) {
        direction.isRTL = rtl
        const events = []
        let renderer
        await act(async () => {
          renderer = create(
            React.createElement(
              module.exports.ResizablePane,
              {
                label: 'Files',
                side,
                min: 100,
                max: 400,
                defaultSize: 200,
                collapsible: true,
                onSizeChange: (n) => events.push(['change', n]),
                onSizeCommit: (n) => events.push(['commit', n]),
              },
              'Files',
            ),
          )
        })
        const handle = () =>
          renderer.root
            .findAllByType('NativeView')
            .find((node) => node.props.accessibilityRole === 'adjustable')
        await act(async () =>
          handle().props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }),
        )
        assert.equal(handle().props.accessibilityValue.now, 208)
        await act(async () =>
          handle().props.onAccessibilityAction({ nativeEvent: { actionName: 'toggle' } }),
        )
        assert.equal(handle().props.accessibilityValue.now, 0)
        assert.equal(
          renderer.root
            .findAllByType('NativeView')
            .some((node) => node.props.importantForAccessibility === 'no-hide-descendants'),
          true,
        )
        await act(async () =>
          handle().props.onAccessibilityAction({ nativeEvent: { actionName: 'toggle' } }),
        )
        assert.equal(handle().props.accessibilityValue.now, 208)
        events.length = 0
        await act(async () => handle().props.onPanResponderGrant())
        assert.equal(facts.at(-1)['data-dragging'], true)
        await act(async () => handle().props.onPanResponderMove({}, { dx: 30, dy: 30 }))
        await act(async () => handle().props.onPanResponderRelease({}, { dx: 40, dy: 40 }))
        const sign =
          (side === 'end' || side === 'bottom' ? -1 : 1) *
          ((side === 'start' || side === 'end') && rtl ? -1 : 1)
        assert.equal(handle().props.accessibilityValue.now, 208 + 40 * sign)
        assert.deepEqual(
          events.filter(([type]) => type === 'commit'),
          [['commit', 208 + 40 * sign]],
        )
        assert.equal(frames.size, 0)
        const restored = handle().props.accessibilityValue.now
        await act(async () =>
          handle().props.onAccessibilityAction({ nativeEvent: { actionName: 'toggle' } }),
        )
        await act(async () => handle().props.onPanResponderGrant())
        await act(async () => handle().props.onPanResponderMove({}, { dx: 170, dy: 170 }))
        await act(async () => {
          for (const callback of [...frames.values()]) callback()
        })
        await act(async () => handle().props.onPanResponderTerminate())
        assert.equal(handle().props.accessibilityValue.now, 0)
        await act(async () =>
          handle().props.onAccessibilityAction({ nativeEvent: { actionName: 'toggle' } }),
        )
        assert.equal(
          handle().props.accessibilityValue.now,
          restored,
          'cancelled expansion preserves the remembered size',
        )
        await act(async () => renderer.unmount())
      }
  } finally {
    globalThis.requestAnimationFrame = oldFrame
    globalThis.cancelAnimationFrame = oldCancel
  }
})
