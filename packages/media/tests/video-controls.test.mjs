import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import React, { act } from 'react'
import { create } from 'react-test-renderer'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const require = createRequire(import.meta.url)
const status = (patch = {}) => ({
  src: 'a.mp4',
  status: 'ready',
  playing: false,
  buffering: false,
  currentTime: 1,
  duration: 8,
  seekability: { status: 'unknown', reason: 'not-exposed' },
  error: null,
  ...patch,
})

async function component(native, audio = false) {
  const result = await build({
    entryPoints: [
      fileURLToPath(
        new URL(
          `../src/${audio ? 'audio' : 'video'}-controls${native ? '.native' : ''}.tsx`,
          import.meta.url,
        ),
      ),
    ],
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
        ? { View: 'RNView', Text: 'RNText', Pressable: 'RNPressable' }
        : require(name),
    module,
    module.exports,
  )
  return module.exports[audio ? 'AudioControls' : 'VideoControls']
}

for (const native of [false, true]) {
  const platform = native ? 'Native' : 'Web'
  for (const audio of [false, true])
    test(`${platform} ${audio ? 'Audio' : 'Video'} controls share range direction, transient unavailability and fresh-command guards`, async (t) => {
      const Controls = await component(native, audio)
      const ranges = {
        status: 'available',
        origin: 'engine',
        ranges: [
          { start: 2, end: 4 },
          { start: 6, end: 7 },
        ],
      }
      const empty = { status: 'unavailable', origin: 'engine', reason: 'empty-ranges' }
      let observed = status({ currentTime: 4, seekability: ranges })
      const requests = []
      const player = {
        getStatus: () => observed,
        seekTo: (value) => requests.push(value),
        play: async () => requests.push('play'),
        pause: () => requests.push('pause'),
      }
      let renderer
      const render = (snapshot = observed) =>
        React.createElement(Controls, {
          player: { current: player },
          status: snapshot,
          seekStep: 1,
        })
      await act(async () => {
        renderer = create(render())
      })
      t.after(async () => {
        await act(async () => renderer.unmount())
      })
      const buttons = () => renderer.root.findAllByType(native ? 'RNPressable' : 'button')
      const activate = (index) => buttons()[index].props[native ? 'onPress' : 'onClick']()
      await act(async () => activate(2))
      assert.deepEqual(requests, [6], 'forward does not stick on or move behind the 4s endpoint')
      observed = status({ currentTime: 6, seekability: ranges })
      await act(async () => renderer.update(render()))
      await act(async () => activate(1))
      assert.deepEqual(requests, [6, 4], 'backward crosses the gap in its requested direction')
      const stale = observed
      observed = status({ currentTime: 6, seekability: empty })
      await act(async () => renderer.update(render(stale)))
      await act(async () => activate(2))
      assert.deepEqual(requests, [6, 4], 'even an enabled stale button rechecks current capability')
      await act(async () => renderer.update(render()))
      assert.ok(
        buttons()
          .slice(1)
          .every((button) => button.props.disabled),
      )
      assert.equal(buttons()[0].props.disabled, false)
      await act(async () => activate(0))
      assert.equal(requests.at(-1), 'play', 'unseekable ready playback remains usable')
      observed = status({ status: 'ended', currentTime: 8, seekability: empty })
      await act(async () => renderer.update(render()))
      const before = requests.length
      assert.equal(buttons()[0].props.disabled, true)
      await act(async () => activate(0))
      assert.equal(requests.length, before, 'no misleading replay without a rewind target')
      observed = status({ seekability: { status: 'unknown', reason: 'not-exposed' } })
      await act(async () => renderer.update(render()))
      assert.ok(
        buttons().every((button) => !button.props.disabled),
        'unknown does not forbid best effort',
      )
      await act(async () => activate(2))
      assert.equal(requests.at(-1), 2)
    })
  test(`${platform} Audio controls await rewind, catch async seeks and never restart disabled/retired players`, async () => {
    const Controls = await component(native, true)
    let observed = status({ status: 'ended', currentTime: 8 })
    let complete
    let reject
    let plays = 0
    const player = {
      getStatus: () => observed,
      play: async () => {
        plays++
      },
      pause() {},
      seekTo: () =>
        new Promise((resolve, fail) => {
          complete = resolve
          reject = fail
        }),
    }
    const ref = { current: player }
    let renderer
    const render = (props = {}) =>
      React.createElement(Controls, { player: ref, status: observed, ...props })
    const buttons = () => renderer.root.findAllByType(native ? 'RNPressable' : 'button')
    const activate = (index) => buttons()[index].props[native ? 'onPress' : 'onClick']()
    await act(async () => {
      renderer = create(render())
    })
    assert.match(JSON.stringify(renderer.toJSON()), /Play audio/)
    assert.match(JSON.stringify(renderer.toJSON()), /Audio playback controls/)
    await act(async () => activate(0))
    assert.equal(plays, 0, 'no playback before the async rewind completes')
    observed = status({ currentTime: 0 })
    await act(async () => {
      renderer.update(render())
      complete()
    })
    assert.equal(plays, 1, 'a status observation must not retire the active handle')
    await act(async () => {
      activate(2)
      reject(new Error('asynchronous seek denied'))
    })
    assert.match(JSON.stringify(renderer.toJSON()), /asynchronous seek denied/)
    observed = status({ status: 'ended', currentTime: 8 })
    await act(async () => renderer.update(render()))
    await act(async () => activate(0))
    await act(async () => renderer.update(render({ disabled: true })))
    await act(async () => complete())
    assert.equal(plays, 1, 'a pending rewind cannot resume a disabled player')
    await act(async () => renderer.update(render()))
    await act(async () => activate(0))
    ref.current = { ...player, getStatus: () => status({ src: 'replacement.wav' }) }
    observed = status({ src: 'replacement.wav' })
    await act(async () => {
      renderer.update(render())
      complete()
    })
    assert.equal(plays, 1, 'retired completion cannot start either player')
    await act(async () => renderer.unmount())
  })
  test(`${platform} controls keep observed state, fresh/clamped seeks, disabled boundaries and named controls`, async () => {
    const Controls = await component(native)
    let observed = status()
    const requests = []
    const player = {
      getStatus: () => ({ ...observed }),
      play: async () => {
        requests.push('play')
      },
      pause: () => requests.push('pause'),
      seekTo: (time) => requests.push(time),
    }
    const ref = { current: player }
    let renderer
    const render = (snapshot = observed, props = {}) =>
      React.createElement(Controls, { player: ref, status: snapshot, ...props })
    const buttons = () => renderer.root.findAllByType(native ? 'RNPressable' : 'button')
    const label = (button) => (native ? button.props.accessibilityLabel : button.props.children)
    const activate = (index) => buttons()[index].props[native ? 'onPress' : 'onClick']()
    await act(async () => {
      renderer = create(render())
    })
    assert.deepEqual(buttons().map(label), [
      'Play video',
      'Seek backward 10 seconds',
      'Seek forward 10 seconds',
    ])
    if (native) {
      assert.ok(
        renderer.root.findAllByType('RNView').every((node) => node.props.accessible === false),
      )
      for (const button of buttons()) {
        assert.equal(button.props.accessibilityRole, 'button')
        assert.deepEqual(button.props.accessibilityState, { disabled: false })
        assert.equal(button.props.children.type, 'RNText')
        assert.ok(button.props.style.minHeight >= 44)
      }
    } else {
      assert.equal(renderer.root.findByType('legend').props.children, 'Video playback controls')
      assert.ok(buttons().every((button) => button.props.type === 'button'))
    }
    const toggle = buttons()[0]
    await act(async () => activate(0))
    assert.deepEqual(requests, ['play'])
    assert.equal(
      label(buttons()[0]),
      'Play video',
      'a resolved request is not an observed playing event',
    )
    observed = status({ playing: true })
    await act(async () => renderer.update(render()))
    assert.equal(
      buttons()[0],
      toggle,
      'the focused toggle host must not remount when its name changes',
    )
    assert.equal(label(buttons()[0]), 'Pause video')
    await act(async () => activate(0))
    assert.equal(requests.at(-1), 'pause')
    assert.equal(label(buttons()[0]), 'Pause video', 'pause awaits an observation too')
    const stale = status()
    observed = status({ currentTime: 5 })
    await act(async () => renderer.update(render(stale)))
    await act(async () => activate(2))
    assert.equal(requests.at(-1), 8, 'seek from live 5s, clamped to duration, not stale 1s')
    await act(async () => activate(1))
    assert.equal(requests.at(-1), 0)
    observed = status({ currentTime: 0 })
    await act(async () => renderer.update(render()))
    assert.equal(buttons()[1].props.disabled, true)
    observed = status({ currentTime: 8, status: 'ended' })
    await act(async () => renderer.update(render()))
    assert.equal(buttons()[2].props.disabled, true)
    await act(async () => activate(0))
    assert.deepEqual(
      requests.slice(-2),
      [0, 'play'],
      'replay requests a reset before play on both engines',
    )
    observed = status({ duration: null, currentTime: 5 })
    await act(async () => renderer.update(render()))
    assert.equal(buttons()[2].props.disabled, false)
    assert.match(JSON.stringify(renderer.toJSON()), /duration unknown/)
    await act(async () => activate(2))
    assert.equal(requests.at(-1), 15)
    observed = status({ status: 'loading', playing: true, buffering: true })
    await act(async () => renderer.update(render()))
    assert.equal(buttons()[0].props.disabled, false, 'buffering playback remains pausable')
    assert.ok(
      buttons()
        .slice(1)
        .every((button) => button.props.disabled),
    )
    await act(async () => renderer.update(render(null)))
    assert.ok(buttons().every((button) => button.props.disabled))
    await act(async () => renderer.update(render(observed, { disabled: true })))
    const before = requests.length
    await act(async () => {
      activate(0)
      activate(1)
      activate(2)
    })
    assert.equal(requests.length, before, 'disabled also guards programmatic handler calls')
    await act(async () => renderer.unmount())
  })

  test(`${platform} controls surface command failures but not rejected requests from a retired player`, async () => {
    const Controls = await component(native)
    let reject
    let observed = status()
    const a = {
      getStatus: () => observed,
      play: () =>
        new Promise((_, fail) => {
          reject = fail
        }),
      pause() {},
      seekTo() {
        throw new Error('not seekable')
      },
    }
    const ref = { current: a }
    let renderer
    const render = (props = {}) =>
      React.createElement(Controls, { player: ref, status: observed, ...props })
    const buttons = () => renderer.root.findAllByType(native ? 'RNPressable' : 'button')
    const activate = (index) => buttons()[index].props[native ? 'onPress' : 'onClick']()
    await act(async () => {
      renderer = create(render())
    })
    await act(async () => {
      activate(0)
      reject(new Error('play denied'))
    })
    assert.match(JSON.stringify(renderer.toJSON()), /play denied/)
    if (!native)
      assert.equal(renderer.root.findByProps({ role: 'alert' }).props.children, 'play denied')
    else
      assert.equal(
        renderer.root.findByProps({ accessibilityLiveRegion: 'polite' }).props.children,
        'play denied',
      )
    await act(async () => activate(2))
    assert.match(JSON.stringify(renderer.toJSON()), /not seekable/)
    await act(async () => activate(0))
    const oldReject = reject
    const b = {
      ...a,
      play: async () => {
        throw new Error('new denial')
      },
      getStatus: () => status({ src: 'b.mp4' }),
    }
    ref.current = b
    observed = status({ src: 'b.mp4' })
    await act(async () => {
      renderer.update(render())
      oldReject(new Error('old source denial'))
    })
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /old source denial|not seekable/)
    let plays = 0
    b.play = async () => {
      plays++
    }
    await act(async () => renderer.update(render({ status: status() })))
    await act(async () => activate(0))
    assert.equal(plays, 0, 'an old rendered source cannot command the new player')
    await act(async () =>
      renderer.update(
        render({
          accessibilityLabel: 'Lecteur',
          labels: {
            play: 'Lire',
            pause: 'Pause',
            backward: 'Reculer',
            forward: 'Avancer',
            position: () => 'Position inconnue',
          },
          seekStep: 1,
        }),
      ),
    )
    assert.match(JSON.stringify(renderer.toJSON()), /Lire/)
    assert.match(JSON.stringify(renderer.toJSON()), /Position inconnue/)
    let unmountReject
    b.play = () =>
      new Promise((_, fail) => {
        unmountReject = fail
      })
    await act(async () => activate(0))
    assert.equal(typeof unmountReject, 'function')
    await act(async () => renderer.unmount())
    await act(async () => unmountReject(new Error('late unmount denial')))
  })
}
