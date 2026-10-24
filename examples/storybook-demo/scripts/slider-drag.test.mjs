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
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((file) => file && existsSync(file))
if (process.env.CI) assert.ok(executablePath, 'CI requires Slider browser coverage')

test('Web Slider captures input, flushes release, preserves direction and cancels pending frames', {
  skip: !executablePath,
}, async () => {
  const bundle = await build({
    stdin: {
      contents: `import React,{useState} from 'react'; import {createRoot} from 'react-dom/client'; import {Slider} from './packages/patterns/src/slider.tsx'; import {ColorPicker} from './packages/patterns/src/color-picker.tsx';
      function Fixture({vertical=false,controlled=false,follow=false}) { const [value,setValue]=useState(20); const [disabled,setDisabled]=useState(false); window.disable=setDisabled; window.setValue=setValue; return <Slider orientation={vertical?'vertical':'horizontal'} value={controlled?value:undefined} defaultValue={20} disabled={disabled} step={10} bigStep={30} accessibilityLabel="Level" className="track" thumbClassName="thumb" onValueChange={n=>{events.push(['change',n]);if(follow)setValue(n)}} onValueCommit={n=>events.push(['commit',n])} onValueCancel={()=>events.push(['cancel'])}/>; }
      window.mount=(options={})=>{window.fixtureRoot?.unmount();window.events=[];document.documentElement.dir=options.rtl?'rtl':'ltr';window.fixtureRoot=createRoot(document.querySelector('#root'));fixtureRoot.render(options.color?<ColorPicker defaultValue="#ff0000" accessibilityLabel="Color" sliderClassName="track" onChange={n=>events.push(['color',n])}/>:<Fixture {...options}/>)};mount();`,
      resolveDir: root,
      loader: 'tsx',
    },
    bundle: true,
    write: false,
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
    await page.setContent(
      '<style>.track{width:200px;height:200px;touch-action:none}.thumb{width:20px;height:20px}</style><div id="root"></div>',
    )
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    const thumb = page.getByRole('slider').first()
    const track = page.locator('.track').first()
    await thumb.waitFor()
    await page.evaluate(() => {
      window.framesHeld = new Map()
      let serial = 0
      window.requestAnimationFrame = (callback) => {
        framesHeld.set(++serial, callback)
        return serial
      }
      window.cancelAnimationFrame = (id) => framesHeld.delete(id)
    })
    const value = () => thumb.getAttribute('aria-valuenow')
    const events = () => page.evaluate(() => window.events)
    const remount = async (options = {}) => {
      await page.evaluate((options) => mount(options), options)
      await page.waitForFunction(
        () => document.querySelector('[role=slider]')?.getAttribute('aria-valuenow') === '20',
        null,
        { polling: 10 },
      )
    }
    const point = async (fraction, vertical = false, rtl = false) => {
      const box = await track.boundingBox()
      return {
        x: box.x + box.width * (vertical ? 0.5 : rtl ? 1 - fraction : fraction),
        y: box.y + box.height * (vertical ? 1 - fraction : 0.5),
      }
    }
    const start = async (fraction, vertical = false, rtl = false) => {
      const at = await point(fraction, vertical, rtl)
      await page.mouse.move(at.x, at.y)
      await page.mouse.down()
      await page.mouse.move(at.x, at.y)
      await page.evaluate(() => {
        const callbacks = [...framesHeld.values()]
        framesHeld.clear()
        for (const callback of callbacks) callback()
      })
    }
    for (const vertical of [false, true])
      for (const rtl of [false, true]) {
        await remount({ vertical, rtl })
        await start(0.2, vertical, rtl)
        assert.equal(await thumb.evaluate((node) => node === document.activeElement), true)
        const at = await point(0.8, vertical, rtl)
        await page.mouse.move(at.x, at.y)
        assert.equal(await value(), '20', 'moves wait for a frame')
        await page.mouse.up()
        assert.equal(await value(), '80')
        assert.deepEqual(await events(), [
          ['change', 80],
          ['commit', 80],
        ])
        await thumb.press('Home')
        await thumb.press('ArrowUp')
        await thumb.press('PageUp')
        assert.equal(await value(), '40')
        await thumb.press(rtl ? 'ArrowLeft' : 'ArrowRight')
        assert.equal(await value(), '50')
        await thumb.press('End')
        assert.equal(await value(), '100')
      }
    await remount()
    await start(0.3)
    await page.evaluate(() =>
      document.querySelector('.track').dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          pointerId: 2,
          clientX: 500,
          clientY: 0,
        }),
      ),
    )
    assert.equal(
      await page.evaluate(() => framesHeld.size),
      0,
      'another pointer cannot drive the drag',
    )
    const final = await point(0.9)
    await track.evaluate(
      (node, at) =>
        node.dispatchEvent(
          new PointerEvent('pointerup', {
            bubbles: true,
            pointerId: 1,
            clientX: at.x,
            clientY: at.y,
          }),
        ),
      final,
    )
    await page.mouse.up()
    assert.deepEqual(
      await events(),
      [
        ['change', 30],
        ['change', 90],
        ['commit', 90],
      ],
      'release uses its own final coordinates',
    )
    for (const mode of ['cancel', 'lost', 'disabled', 'unmount']) {
      await remount()
      await start(0.3)
      await page.mouse.move(600, 500)
      assert.equal(
        await track.evaluate((node) => node.hasPointerCapture(1)),
        true,
        'capture survives leaving the track',
      )
      if (mode === 'cancel')
        await track.evaluate((node) =>
          node.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 })),
        )
      if (mode === 'lost') {
        await track.evaluate((node) => node.releasePointerCapture(1))
        await page.mouse.move(601, 501)
      }
      if (mode === 'disabled') await page.evaluate(() => disable(true))
      if (mode === 'unmount') await page.evaluate(() => fixtureRoot.unmount())
      await page.mouse.up()
      assert.deepEqual(await events(), [['change', 30], ['cancel']], mode)
      assert.equal(await page.evaluate(() => framesHeld.size), 0)
    }
    await remount()
    await track.evaluate((node) => {
      node.style.width = '0px'
    })
    await track.evaluate((node) =>
      node.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          pointerId: 1,
          isPrimary: true,
          button: 0,
        }),
      ),
    )
    assert.deepEqual(await events(), [])
    await remount()
    await start(0.5)
    await track.evaluate((node) => {
      node.style.width = '400px'
    })
    const resized = await point(0.8)
    await page.mouse.move(resized.x, resized.y)
    await page.mouse.up()
    assert.equal(await value(), '80', 'mapping reads the resized track')
    for (const follow of [false, true]) {
      await remount({ controlled: true, follow })
      await start(0.2)
      const at = await point(0.8)
      await page.mouse.move(at.x, at.y)
      await page.mouse.up()
      assert.deepEqual(await events(), [
        ['change', 80],
        ['commit', 80],
      ])
      assert.equal(
        await value(),
        follow ? '80' : '20',
        'controlled rendering stays owned by the caller',
      )
    }
    await page.evaluate(() => mount({ color: true }))
    await page.waitForFunction(
      () => document.querySelectorAll('[role=slider]').length === 3,
      null,
      { polling: 10 },
    )
    await start(0)
    const hue = await point(0.5)
    await page.mouse.move(hue.x, hue.y)
    await page.mouse.up()
    assert.deepEqual(
      await events(),
      [['color', '#00ffff']],
      'ColorPicker receives the final frame without a commit callback',
    )
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
  }
})

test('Native Slider maps track-local starts and final deltas in both axes and directions (mock hosts)', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const frames = new Map()
  let serial = 0
  const oldFrame = globalThis.requestAnimationFrame
  const oldCancel = globalThis.cancelAnimationFrame
  globalThis.requestAnimationFrame = (callback) => {
    frames.set(++serial, callback)
    return serial
  }
  globalThis.cancelAnimationFrame = (id) => frames.delete(id)
  const bundle = await build({
    stdin: {
      contents:
        "export {Slider} from './packages/patterns/src/slider.native.tsx'; export {ColorPicker} from './packages/patterns/src/color-picker.native.tsx'",
      resolveDir: root,
    },
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    external: ['react', 'react-native', '@hozo/engine/project'],
    plugins: [
      {
        name: 'real-drag',
        setup(builder) {
          builder.onResolve({ filter: /^@hozo\/behaviors$/ }, () => ({
            path: path.join(root, 'packages/behaviors/src/i18n.ts'),
          }))
          builder.onResolve({ filter: /^@hozo\/behaviors\/native$/ }, () => ({
            path: path.join(root, 'packages/behaviors/src/drag-1d.native.ts'),
          }))
        },
      },
    ],
  })
  const native = {
    View: 'NativeView',
    Text: 'NativeText',
    TextInput: 'NativeInput',
    I18nManager: { isRTL: false },
    PanResponder: {
      create: (callbacks) => ({
        panHandlers: {
          onResponderGrant: callbacks.onPanResponderGrant,
          onResponderMove: callbacks.onPanResponderMove,
          onResponderRelease: callbacks.onPanResponderRelease,
          onResponderTerminate: callbacks.onPanResponderTerminate,
        },
      }),
    },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(
    (name) =>
      name === 'react-native'
        ? native
        : name === '@hozo/engine/project'
          ? { hozoClasses: () => [] }
          : require(name),
    module,
    module.exports,
  )
  let renderer
  let events = []
  let options = {}
  const element = () =>
    React.createElement(module.exports.Slider, {
      defaultValue: 20,
      step: 10,
      ...options,
      onValueChange: (n) => events.push(['change', n]),
      onValueCommit: (n) => events.push(['commit', n]),
      onValueCancel: () => events.push(['cancel']),
    })
  const track = () => renderer.root.findAllByType('NativeView')[0]
  const thumb = () =>
    renderer.root
      .findAllByType('NativeView')
      .find((node) => node.props.accessibilityRole === 'adjustable')
  const value = () => thumb().props.accessibilityValue.now
  const event = (x, y) => ({ nativeEvent: { locationX: x, locationY: y } })
  const state = (dx, dy) => ({ dx, dy, vx: 0, vy: 0 })
  const mount = async (props = {}) => {
    if (renderer) await act(async () => renderer.unmount())
    events = []
    options = props
    await act(async () => {
      renderer = create(element())
    })
    await act(async () =>
      track().props.onLayout({
        nativeEvent: { layout: { x: 40, y: 70, width: 200, height: 200 } },
      }),
    )
  }
  try {
    for (const vertical of [false, true])
      for (const rtl of [false, true]) {
        native.I18nManager.isRTL = rtl
        await mount({ orientation: vertical ? 'vertical' : 'horizontal' })
        await act(async () =>
          track().props.onResponderGrant(
            event(vertical ? 100 : rtl ? 160 : 40, vertical ? 160 : 100),
          ),
        )
        await act(async () =>
          track().props.onResponderMove(
            {},
            state(vertical ? 0 : rtl ? -60 : 60, vertical ? -60 : 0),
          ),
        )
        assert.equal(value(), 20)
        await act(async () =>
          track().props.onResponderRelease(
            {},
            state(vertical ? 0 : rtl ? -120 : 120, vertical ? -120 : 0),
          ),
        )
        assert.equal(value(), 80)
        assert.deepEqual(events, [
          ['change', 80],
          ['commit', 80],
        ])
        assert.equal(frames.size, 0)
        await act(async () =>
          thumb().props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } }),
        )
        assert.equal(value(), 70)
      }
    native.I18nManager.isRTL = false
    for (const mode of ['terminate', 'disabled', 'unmount']) {
      await mount()
      await act(async () => track().props.onResponderGrant(event(60, 100)))
      await act(async () => track().props.onResponderMove({}, state(100, 0)))
      const release = track().props.onResponderRelease
      if (mode === 'terminate') await act(async () => track().props.onResponderTerminate())
      if (mode === 'disabled') {
        options = { disabled: true }
        await act(async () => renderer.update(element()))
      }
      if (mode === 'unmount') {
        await act(async () => renderer.unmount())
        renderer = undefined
      }
      await act(async () => release({}, state(140, 0)))
      assert.deepEqual(events, [['change', 30], ['cancel']], mode)
      assert.equal(frames.size, 0)
    }
    await mount()
    await act(async () => track().props.onResponderGrant(event(100, 100)))
    await act(async () =>
      track().props.onLayout({
        nativeEvent: { layout: { x: 40, y: 70, width: 400, height: 200 } },
      }),
    )
    await act(async () => track().props.onResponderRelease({}, state(220, 0)))
    assert.equal(value(), 80, 'resized geometry remains track-local')
    await mount({ value: 20 })
    await act(async () => track().props.onResponderGrant(event(40, 100)))
    await act(async () => track().props.onResponderRelease({}, state(120, 0)))
    assert.equal(value(), 20)
    assert.deepEqual(events, [
      ['change', 80],
      ['commit', 80],
    ])
    await mount()
    await act(async () =>
      track().props.onLayout({ nativeEvent: { layout: { width: 0, height: 200 } } }),
    )
    await act(async () => track().props.onResponderGrant(event(40, 100)))
    await act(async () => track().props.onResponderRelease({}, state(120, 0)))
    assert.deepEqual(events, [], 'unmeasured geometry cannot start or commit')
    await act(async () => renderer.unmount())
    events = []
    await act(async () => {
      renderer = create(
        React.createElement(module.exports.ColorPicker, {
          accessibilityLabel: 'Color',
          defaultValue: '#ff0000',
          onChange: (hex) => events.push(['color', hex]),
        }),
      )
    })
    const hue = () => renderer.root.findAllByType('NativeView').find((node) => node.props.onLayout)
    await act(async () =>
      hue().props.onLayout({ nativeEvent: { layout: { width: 200, height: 20 } } }),
    )
    await act(async () => hue().props.onResponderGrant(event(0, 10)))
    await act(async () => hue().props.onResponderMove({}, state(60, 0)))
    await act(async () => hue().props.onResponderRelease({}, state(100, 0)))
    assert.deepEqual(
      events,
      [['color', '#00ffff']],
      'Native ColorPicker receives the final hue without a commit callback',
    )
  } finally {
    if (renderer) await act(async () => renderer.unmount())
    globalThis.requestAnimationFrame = oldFrame
    globalThis.cancelAnimationFrame = oldCancel
  }
})
