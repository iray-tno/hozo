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
if (process.env.CI) assert.ok(executablePath, 'CI requires BottomSheet browser coverage')

test('Web sheet flushes release, restores cancellation, keeps taps and retires captured drags', {
  skip: !executablePath,
}, async () => {
  const bundle = await build({
    stdin: {
      contents: `import React,{useState} from 'react'; import {createRoot} from 'react-dom/client'; import {BottomSheet} from './packages/patterns/src/bottom-sheet.tsx';
        function Fixture({multiple}) { const [open,setOpen]=useState(true); window.setOpen=setOpen; return <BottomSheet open={open} onClose={()=>window.closes++} portal={false} testID="sheet" accessibilityLabel="Filters" detents={multiple?[.5,1]:[1]} sheetClassName="sheet" handleClassName="handle"><button>Apply</button></BottomSheet>; }
        window.mount=(multiple=true)=>{window.fixtureRoot?.unmount(); window.closes=0;window.fixtureRoot=createRoot(document.querySelector('#root'));fixtureRoot.render(<Fixture multiple={multiple}/>);}; mount();`,
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
    await page.setContent(
      '<style>.sheet{height:400px;width:300px}.handle{display:block;width:100px;height:24px}</style><button>Before</button><div id="root"></div>',
    )
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    const panel = page.getByRole('dialog', { name: 'Filters' })
    const handle = page.locator('.handle')
    await panel.waitFor()
    await handle.click()
    assert.equal(await panel.evaluate((node) => node.style.transform), 'translateY(50%)')
    await handle.press('ArrowUp')
    assert.equal(await panel.evaluate((node) => node.style.transform), 'translateY(0%)')
    await panel.evaluate((node) => {
      node.style.height = '0px'
    })
    const unmeasured = await handle.boundingBox()
    await page.mouse.move(unmeasured.x + 10, unmeasured.y + 10)
    await page.mouse.down()
    assert.equal(await handle.evaluate((node) => node.hasPointerCapture(1)), false)
    assert.equal(await panel.getAttribute('data-hozo-dragging'), null)
    await page.mouse.up()
    await panel.evaluate((node) => {
      node.style.height = '400px'
    })
    await handle.press('ArrowUp')
    // Hold animation dragFrames so a release must use its own coordinates, not a
    // React render of the preceding move. The browser still owns real capture.
    await page.evaluate(() => {
      window.dragFrames = new Map()
      let id = 0
      window.requestAnimationFrame = (callback) => {
        dragFrames.set(++id, callback)
        return id
      }
      window.cancelAnimationFrame = (key) => dragFrames.delete(key)
      document.addEventListener(
        'pointerdown',
        (event) => {
          window.downAt = event.timeStamp
          window.downY = event.clientY
        },
        true,
      )
      window.sample = (type, delta, elapsed, pointerId = 1) =>
        document.querySelector('.handle').dispatchEvent(
          Object.defineProperty(
            new PointerEvent(type, {
              bubbles: true,
              pointerId,
              isPrimary: pointerId === 1,
              button: 0,
              clientY: downY + delta,
            }),
            'timeStamp',
            { value: downAt + elapsed },
          ),
        )
      window.flush = () => {
        const callbacks = [...dragFrames.values()]
        dragFrames.clear()
        for (const callback of callbacks) callback()
      }
    })
    const start = async () => {
      const box = await handle.boundingBox()
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      // Capture becomes active on a real subsequent pointer event. Synthetic
      // samples alone do not process the browser's pending capture request.
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.evaluate(() => flush())
    }
    const transform = async (expected) =>
      page.waitForFunction(
        (value) => document.querySelector('[role=dialog]')?.style.transform === value,
        expected,
        { polling: 10 },
      )
    await start()
    await page.evaluate(() => {
      sample('pointermove', 390, 1000, 2)
      sample('pointerup', 390, 1100, 2)
    })
    assert.equal(
      await page.evaluate(() => dragFrames.size),
      0,
      'another pointer cannot drive the drag',
    )
    await page.evaluate(() => sample('pointermove', 160, 1000))
    assert.equal(await page.evaluate(() => dragFrames.size), 1)
    assert.equal(await panel.evaluate((node) => node.style.transform), 'translateY(0%)')
    await page.evaluate(() => sample('pointerup', 200, 10000))
    await page.mouse.up()
    await transform('translateY(50%)')
    assert.equal(await page.evaluate(() => dragFrames.size), 0)
    assert.equal(await page.evaluate(() => closes), 0)
    await handle.press('Enter')
    await transform('translateY(0%)')
    for (const cancellation of ['pointercancel', 'lostpointercapture']) {
      await start()
      await page.evaluate(() => {
        sample('pointermove', 200, 1000)
        flush()
      })
      await transform('translateY(50%)')
      if (cancellation === 'pointercancel')
        await page.evaluate(() => sample('pointercancel', 200, 1100))
      else {
        await handle.evaluate((node) => node.releasePointerCapture(1))
        // The browser processes a pending capture change at the next pointer
        // event, rather than synchronously inside releasePointerCapture.
        await page.mouse.move(700, 400)
      }
      await page.waitForFunction(
        () => !document.querySelector('[role=dialog]').hasAttribute('data-hozo-dragging'),
        null,
        { polling: 10 },
      )
      await page.mouse.up()
      await transform('translateY(0%)')
      assert.equal(await page.evaluate(() => closes), 0, cancellation)
    }
    await start()
    await page.mouse.move(700, 400)
    assert.equal(await handle.evaluate((node) => node.hasPointerCapture(1)), true)
    await page.evaluate(() => sample('pointercancel', 350, 1000))
    await page.mouse.up()
    await transform('translateY(0%)')
    assert.equal(await page.evaluate(() => closes), 0)
    await start()
    await page.evaluate(() => {
      sample('pointermove', 350, 1000)
      setOpen(false)
    })
    await panel.waitFor({ state: 'detached' })
    assert.equal(await page.evaluate(() => dragFrames.size), 0)
    await page.mouse.up()
    await page.evaluate(() => setOpen(true))
    await transform('translateY(0%)')
    await start()
    await page.evaluate(() => {
      sample('pointermove', 350, 1000)
      fixtureRoot.unmount()
    })
    await page.mouse.up()
    assert.equal(await page.evaluate(() => dragFrames.size), 0)
    assert.equal(await page.evaluate(() => closes), 0)
    await page.evaluate(() => mount(false))
    await transform('translateY(0%)')
    await start()
    await page.evaluate(() => sample('pointerup', 400, 10000))
    await page.mouse.up()
    assert.equal(await page.evaluate(() => closes), 1, 'a completed dismissal happens once')
    await page.evaluate(() => mount())
    await transform('translateY(0%)')
    await start()
    await page.evaluate(() => {
      sample('pointermove', 20, 20)
      sample('pointermove', 20, 50)
      sample('pointerup', 20, 100)
    })
    await page.mouse.up()
    await transform('translateY(0%)')
    assert.equal(await page.evaluate(() => closes), 0, 'a stationary move clears flick velocity')
    await start()
    await page.evaluate(() => {
      sample('pointermove', 20, 20)
      sample('pointerup', 20, 21)
    })
    await page.mouse.up()
    assert.equal(
      await page.evaluate(() => closes),
      1,
      'coalescing preserves the last raw flick velocity',
    )
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
  }
})

test('Native sheet preserves tap negotiation and velocity while cancelling pending frames (mock hosts)', async () => {
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
    entryPoints: [path.join(root, 'packages/patterns/src/bottom-sheet.native.tsx')],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    external: ['react', 'react-native', '@hozo/engine/project'],
    plugins: [
      {
        name: 'native-behavior-leaves',
        setup(build) {
          build.onResolve({ filter: /^@hozo\/behaviors$/ }, () => ({
            path: path.join(root, 'packages/behaviors/src/i18n.ts'),
          }))
          build.onResolve({ filter: /^@hozo\/behaviors\/native$/ }, () => ({
            path: path.join(root, 'packages/behaviors/src/drag-1d.native.ts'),
          }))
        },
      },
    ],
  })
  const native = {
    View: 'NativeView',
    Modal: 'NativeModal',
    Pressable: 'NativePressable',
    I18nManager: { isRTL: false },
    PanResponder: { create: (handlers) => ({ panHandlers: handlers }) },
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
  let closes = 0
  const element = (open = true) =>
    React.createElement(module.exports.BottomSheet, {
      open,
      detents: [0.5, 1],
      testID: 'sheet',
      onClose: () => closes++,
    })
  const panel = () =>
    renderer.root.findAllByType('NativeView').find((node) => node.props.testID === 'sheet')
  const handle = () =>
    renderer.root
      .findAllByType('NativePressable')
      .find((node) => node.props.accessibilityLabel === 'Resize')
  const travel = () => panel().props.style.at(-1).transform[0].translateY
  const state = (dy, vy = 0) => ({ dx: 0, dy, vx: 0, vy })
  const flush = () => {
    const callbacks = [...frames.values()]
    frames.clear()
    for (const callback of callbacks) callback()
  }
  try {
    await act(async () => {
      renderer = create(element())
    })
    assert.equal(
      handle().props.onMoveShouldSetPanResponder({}, state(20)),
      false,
      'unmeasured panel cannot drag',
    )
    await act(async () => panel().props.onLayout({ nativeEvent: { layout: { height: 400 } } }))
    assert.equal(handle().props.onStartShouldSetPanResponder(), false)
    assert.equal(handle().props.onMoveShouldSetPanResponder({}, state(2)), false)
    assert.equal(handle().props.onMoveShouldSetPanResponder({}, state(3)), true)
    assert.equal(handle().props.onMoveShouldSetPanResponder({}, { dx: 80, dy: 0 }), false)
    await act(async () => handle().props.onPress())
    assert.equal(travel(), 200)
    await act(async () => handle().props.onPress())
    assert.equal(travel(), 0)
    await act(async () => handle().props.onPanResponderGrant())
    await act(async () => handle().props.onPanResponderMove({}, state(100)))
    assert.equal(travel(), 0, 'moves wait for the frame')
    await act(async () => handle().props.onPanResponderRelease({}, state(200)))
    assert.equal(travel(), 200, 'release uses its final position before a frame or render')
    assert.equal(frames.size, 0)
    await act(async () => handle().props.onPress())
    await act(async () => handle().props.onPanResponderGrant())
    await act(async () => {
      handle().props.onPanResponderMove({}, state(300))
      flush()
    })
    assert.equal(travel(), 300)
    await act(async () => handle().props.onPanResponderTerminate())
    assert.equal(travel(), 0)
    assert.equal(closes, 0)
    await act(async () => handle().props.onPanResponderGrant())
    await act(async () => handle().props.onPanResponderRelease({}, state(20, 1)))
    assert.equal(closes, 1, 'the native release velocity still projects a flick to dismissal')
    await act(async () => handle().props.onPanResponderGrant())
    await act(async () => handle().props.onPanResponderMove({}, state(300)))
    const pendingRelease = handle().props.onPanResponderRelease
    await act(async () => renderer.update(element(false)))
    await act(async () => pendingRelease({}, state(400, 1)))
    assert.equal(closes, 1, 'closing cancels rather than committing the old drag')
    assert.equal(frames.size, 0)
    await act(async () => renderer.update(element()))
    assert.equal(travel(), 0)
    await act(async () => handle().props.onPanResponderGrant())
    await act(async () => handle().props.onPanResponderMove({}, state(300)))
    await act(async () => renderer.unmount())
    renderer = undefined
    assert.equal(frames.size, 0)
    assert.equal(closes, 1)
  } finally {
    if (renderer) await act(async () => renderer.unmount())
    globalThis.requestAnimationFrame = oldFrame
    globalThis.cancelAnimationFrame = oldCancel
  }
})
