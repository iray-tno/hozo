import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import React, { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { create } from 'react-test-renderer'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const require = createRequire(import.meta.url)
const status = (patch = {}) => ({
  src: 'clip',
  status: 'ready',
  playing: false,
  buffering: false,
  currentTime: 1,
  duration: 8,
  error: null,
  ...patch,
})
async function load(native = false, slider = false, rtl = false) {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const result = await build({
    stdin: {
      contents: `export {useMediaSeek} from './src/seek-index${native ? '.native' : ''}.ts'
        ${slider ? `export {Slider} from '../patterns/src/slider${native ? '.native' : ''}.tsx'` : ''}`,
      resolveDir: root,
      sourcefile: 'seek-fixture.ts',
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(
    (name) =>
      name === 'react-native'
        ? {
            View: 'NativeView',
            I18nManager: { isRTL: rtl },
            PanResponder: { create: (handlers) => ({ panHandlers: handlers }) },
          }
        : require(name),
    module,
    module.exports,
  )
  return module.exports
}
async function harness(t, props = {}, slider = false, native = false, rtl = false) {
  const api = await load(native, slider, rtl)
  const requests = []
  let observed = status()
  const player = {
    getStatus: () => ({ ...observed }),
    seekTo: (value) => {
      requests.push(value)
    },
    play: async () => requests.push('play'),
    pause: () => requests.push('pause'),
  }
  const ref = { current: player }
  const probe = {
    requests,
    ref,
    player,
    last: null,
    observed: (next) => {
      observed = next
    },
  }
  function Probe(current) {
    const binding = api.useMediaSeek(current)
    probe.last = binding
    return slider && binding.slider
      ? React.createElement(api.Slider, { key: binding.key, ...binding.slider })
      : null
  }
  let renderer
  const options = { player: ref, status: observed, ...props }
  await act(async () => {
    renderer = create(
      React.createElement(React.StrictMode, null, React.createElement(Probe, options)),
      {
        createNodeMock: () => ({
          getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 20 }),
        }),
      },
    )
  })
  probe.renderer = renderer
  probe.update = async (changes) => {
    Object.assign(options, changes)
    await act(async () =>
      renderer.update(
        React.createElement(React.StrictMode, null, React.createElement(Probe, options)),
      ),
    )
  }
  t.after(async () => {
    await act(async () => renderer.unmount())
  })
  return probe
}

test('seek preview never changes observations, cancellation requests nothing, commit reads fresh bounds', async (t) => {
  const p = await harness(t)
  await act(async () => p.last.slider.onValueChange(6))
  assert.equal(p.last.previewing, true)
  assert.equal(p.last.slider.value, 6)
  assert.equal(p.last.slider.valueText(6), 'Seek to 0:06 / 0:08')
  assert.equal(p.last.position, '0:01 / 0:08')
  assert.deepEqual(p.requests, [])
  await act(async () => p.last.slider.onValueCancel())
  assert.equal(p.last.slider.value, 1)
  await act(async () => p.last.slider.onValueChange(7))
  p.observed(status({ duration: 4 }))
  await act(async () => p.last.slider.onValueCommit(7))
  assert.deepEqual(p.requests, [4], 'the live duration clamps a stale preview')
  assert.equal(p.last.slider.value, 1, 'accepted seek is not an observed playback position')
  await p.update({ status: status({ currentTime: 4, duration: 4 }) })
  assert.equal(p.last.slider.value, 4)
})

test('seek refuses missing/unready/unknown ranges and disabled input without inventing a maximum', async (t) => {
  const p = await harness(t)
  const old = p.last.slider
  for (const value of [
    null,
    status({ status: 'loading' }),
    status({ status: 'error' }),
    status({ duration: null }),
    status({ duration: Infinity }),
    status({ duration: 0 }),
  ]) {
    p.observed(value ?? status({ status: 'loading' }))
    await p.update({ status: value })
    assert.equal(p.last.slider, null)
    assert.equal(p.last.position, 'Seek unavailable')
    await act(async () => old.onValueCommit(3))
  }
  assert.deepEqual(p.requests, [])
  p.observed(status())
  await p.update({ status: status() })
  await act(async () => p.last.slider.onValueChange(5))
  await p.update({ disabled: true })
  assert.equal(p.last.slider.disabled, true)
  await act(async () => old.onValueCommit(3))
  await p.update({ disabled: false })
  assert.equal(p.last.previewing, false, 'a disabled preview is discarded, not resurrected')
  assert.deepEqual(p.requests, [])
  for (const value of [NaN, Infinity, -Infinity])
    await act(async () => p.last.slider.onValueCommit(value))
  assert.deepEqual(p.requests, [])
})

test('source/handle replacement retires old gestures, including a replacement at the same URI', async (t) => {
  const p = await harness(t)
  const old = p.last.slider
  const oldKey = p.last.key
  await act(async () => old.onValueChange(6))
  const replacement = {
    ...p.player,
    getStatus: () => status(),
    seekTo: (value) => p.requests.push(['new', value]),
  }
  p.ref.current = replacement
  await p.update({ status: status() })
  assert.notEqual(p.last.key, oldKey)
  assert.equal(p.last.previewing, false)
  await act(async () => {
    old.onValueChange(7)
    old.onValueCommit(7)
    old.onValueCancel()
  })
  assert.deepEqual(p.requests, [])
  await act(async () => p.last.slider.onValueCommit(3))
  assert.deepEqual(p.requests, [['new', 3]])
  await act(async () => p.renderer.unmount())
  await act(async () => p.last.slider.onValueCommit(5))
  assert.deepEqual(p.requests, [['new', 3]])
})

test('asynchronous Audio seeks serialize, expose denials, and ignore a retired rejection', async (t) => {
  const p = await harness(t, {}, false, true)
  let finish, reject
  p.player.seekTo = (value) => {
    p.requests.push(value)
    return new Promise((resolve, fail) => {
      finish = resolve
      reject = fail
    })
  }
  const commands = p.last.slider
  await act(async () => {
    commands.onValueCommit(3)
    commands.onValueCommit(4)
  })
  assert.deepEqual(p.requests, [3])
  assert.equal(p.last.slider.disabled, true)
  await act(async () => reject(new Error('seek denied')))
  assert.equal(p.last.error, 'seek denied')
  assert.equal(p.last.slider.disabled, false)
  assert.equal(p.last.slider.value, 1)
  await act(async () => p.last.slider.onValueCommit(4))
  await act(async () => finish())
  assert.equal(p.last.error, undefined)
  await act(async () => p.last.slider.onValueCommit(5))
  p.ref.current = { ...p.player, getStatus: () => status({ src: 'other' }) }
  await p.update({ status: status({ src: 'other' }) })
  await act(async () => reject(new Error('old denial')))
  assert.equal(p.last.error, undefined)
  assert.equal(p.last.slider.disabled, false)
})

test('invalid step/name configuration is rejected; synchronous denials stay source-bound', async (t) => {
  const { useMediaSeek } = await load()
  function Probe(props) {
    useMediaSeek({ player: { current: null }, status: null, ...props })
    return null
  }
  for (const step of [0, -1, NaN, Infinity])
    assert.throws(() => renderToStaticMarkup(React.createElement(Probe, { step })), RangeError)
  assert.throws(
    () => renderToStaticMarkup(React.createElement(Probe, { accessibilityLabel: ' ' })),
    TypeError,
  )
  const p = await harness(t)
  p.player.seekTo = () => {
    throw new Error('container is not seekable')
  }
  await act(async () => p.last.slider.onValueCommit(3))
  assert.equal(p.last.error, 'container is not seekable')
  assert.equal(p.last.slider.value, 1)
  p.observed(status({ status: 'loading' }))
  await act(async () => p.last.slider.onValueCommit(4))
  assert.deepEqual(p.requests, [])
})

for (const native of [false, true])
  test(`${native ? 'Native' : 'Web'} Slider commits the last batched drag target and cancels without seeking`, async (t) => {
    const p = await harness(t, {}, true, native)
    const track = () => p.renderer.root.findAllByType(native ? 'NativeView' : 'div')[0]
    const thumb = () =>
      p.renderer.root
        .findAllByType(native ? 'NativeView' : 'div')
        .find((node) =>
          native ? node.props.accessibilityRole === 'adjustable' : node.props.role === 'slider',
        )
    const target = { setPointerCapture() {}, releasePointerCapture() {} }
    const event = (x) =>
      native
        ? { nativeEvent: { locationX: x, locationY: 10 } }
        : { currentTarget: target, pointerId: 1, clientX: 10 + x, clientY: 30 }
    if (native) {
      assert.equal(track().props.pointerEvents, 'box-only')
      assert.equal(thumb().props.accessible, true)
      assert.deepEqual(thumb().props.style.at(-1), { start: '12.5%' })
    }
    if (native)
      await act(async () =>
        track().props.onLayout({
          nativeEvent: { layout: { x: 40, y: 70, width: 100, height: 20 } },
        }),
      )
    await act(async () => {
      const handlers = track().props
      handlers[native ? 'onPanResponderGrant' : 'onPointerDown'](event(25))
      handlers[native ? 'onPanResponderMove' : 'onPointerMove'](event(75))
      handlers[native ? 'onPanResponderRelease' : 'onPointerUp'](event(75))
    })
    assert.deepEqual(p.requests, [6], 'release uses the last input, not a stale controlled render')
    await act(async () => {
      const handlers = track().props
      handlers[native ? 'onPanResponderGrant' : 'onPointerDown'](event(50))
    })
    assert.equal(p.last.slider.value, 4, 'Native local coordinates do not include parent offsets')
    await act(async () => {
      const handlers = track().props
      handlers[native ? 'onPanResponderTerminate' : 'onPointerCancel']()
      if (!native) handlers.onLostPointerCapture()
    })
    assert.deepEqual(p.requests, [6])
    assert.equal(p.last.previewing, false)
    await act(async () => {
      if (native) thumb().props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } })
      else
        thumb().props.onKeyDown({ key: 'ArrowRight', preventDefault() {}, currentTarget: target })
    })
    assert.deepEqual(p.requests, [6, 2])
    if (native) assert.equal(thumb().props.accessibilityValue.text, '0:01 / 0:08')
    else assert.equal(thumb().props['aria-valuetext'], '0:01 / 0:08')
  })

test('Native RTL touch positions use the platform direction and logical thumb positioning', async (t) => {
  const p = await harness(t, {}, true, true, true)
  const track = p.renderer.root.findAllByType('NativeView')[0]
  await act(async () =>
    track.props.onLayout({ nativeEvent: { layout: { x: 40, y: 70, width: 100, height: 20 } } }),
  )
  await act(async () => {
    track.props.onPanResponderGrant({ nativeEvent: { locationX: 25, locationY: 10 } })
    track.props.onPanResponderRelease()
  })
  assert.deepEqual(p.requests, [6], 'the right-hand end is the low end in RTL')
})
