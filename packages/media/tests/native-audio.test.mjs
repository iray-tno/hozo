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
const ready = (patch = {}) => ({
  currentTime: 0,
  duration: 4,
  playing: false,
  isBuffering: false,
  isLoaded: true,
  playbackState: 'readyToPlay',
  didJustFinish: false,
  error: null,
  ...patch,
})

test('Native Audio owns committed resources, a stable observed handle, controls and StrictMode/source cleanup', async () => {
  const players = []
  let resolveSeek
  const expo = {
    createAudioPlayer(source, options) {
      assert.equal(source, null)
      assert.deepEqual(options, { updateInterval: 250 })
      let listener
      const player = {
        released: 0,
        loads: [],
        plays: 0,
        seeks: [],
        loop: false,
        muted: false,
        addListener(name, callback) {
          assert.equal(name, 'playbackStatusUpdate')
          listener = callback
          return {
            remove() {
              listener = null
            },
          }
        },
        replace(source) {
          this.loads.push(source)
        },
        play() {
          this.plays++
        },
        pause() {},
        release() {
          assert.equal(listener, null, 'listeners retire before release')
          this.released++
        },
        seekTo(time) {
          this.seeks.push(time)
          return new Promise((resolve) => {
            resolveSeek = resolve
          })
        },
        emit(patch) {
          listener?.(ready(patch))
        },
      }
      players.push(player)
      return player
    },
  }
  const built = await build({
    entryPoints: [fileURLToPath(new URL('../src/audio-index.native.ts', import.meta.url))],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(
    (name) =>
      name === 'expo-audio'
        ? expo
        : name === 'react-native'
          ? { View: 'RNView', Text: 'RNText', Pressable: 'RNPressable' }
          : name === 'expo-video'
            ? assert.fail('Audio must not load the video engine')
            : require(name),
    module,
    module.exports,
  )
  const { Audio } = module.exports
  const ref = React.createRef()
  let renderer
  const events = []
  const render = (src, options = {}) =>
    React.createElement(Audio, {
      src,
      ref,
      accessibilityLabel: 'Three tones',
      onPlay: () => events.push('old'),
      ...options,
    })
  assert.equal(renderToStaticMarkup(render('a.wav', { controls: false })), '')
  for (const volume of [-1, 2, Number.NaN, Infinity, null, '0.5']) {
    assert.throws(() => renderToStaticMarkup(render('invalid.wav', { volume })), RangeError)
  }
  assert.equal(players.length, 0, 'render alone allocates no native resource')
  await act(async () => {
    renderer = create(render('a.wav'))
  })
  const a = players[0]
  assert.deepEqual(a.loads, [{ uri: 'a.wav' }])
  assert.equal(ref.current.getStatus().status, 'loading')
  assert.equal(a.volume, 1)
  const buttons = () => renderer.root.findAllByType('RNPressable')
  assert.equal(buttons()[0].props.accessibilityLabel, 'Play audio')
  assert.equal(buttons()[0].props.disabled, true)
  const handle = ref.current
  await act(async () => a.emit())
  assert.equal(ref.current, handle, 'clock observations cannot retire an in-flight seek handle')
  await act(async () =>
    renderer.update(
      render('a.wav', { muted: true, loop: true, volume: 0.25, onPlay: () => events.push('new') }),
    ),
  )
  assert.equal(players.length, 1)
  assert.equal(a.muted, true)
  assert.equal(a.volume, 0.25)
  assert.equal(a.loop, true)
  await act(async () =>
    renderer.update(render('a.wav', { volume: 0, onPlay: () => events.push('new') })),
  )
  assert.equal(a.volume, 0)
  assert.equal(a.muted, false)
  assert.equal(ref.current, handle)
  assert.deepEqual(a.loads, [{ uri: 'a.wav' }])
  await act(async () => buttons()[0].props.onPress())
  assert.equal(a.plays, 1)
  assert.equal(
    buttons()[0].props.accessibilityLabel,
    'Play audio',
    'accepted play is not an observation',
  )
  await act(async () => a.emit({ playing: true, currentTime: 0.5 }))
  assert.deepEqual(events, ['new'])
  assert.equal(buttons()[0].props.accessibilityLabel, 'Pause audio')
  let done = false
  const seek = ref.current.seekTo(10).then(() => {
    done = true
  })
  assert.equal(a.seeks.at(-1), 4)
  await Promise.resolve()
  assert.equal(done, false)
  resolveSeek()
  await seek
  await act(async () => renderer.update(render('b.wav', { controls: false })))
  assert.equal(a.released, 1)
  assert.equal(players.length, 2)
  assert.equal(players[1].volume, 1)
  assert.equal(renderer.toJSON(), null)
  assert.equal(ref.current.getStatus().src, 'b.wav')
  await assert.rejects(handle.play(), /not mounted/)
  await act(async () => a.emit({ playing: true, error: 'retired' }))
  assert.equal(ref.current.getStatus().error, null)
  await act(async () => renderer.unmount())
  assert.equal(players[1].released, 1)
  assert.equal(ref.current, null)
  const start = players.length
  await act(async () => {
    renderer = create(
      React.createElement(React.StrictMode, null, render('strict.wav', { volume: 0.4 })),
    )
  })
  const replayed = players.slice(start)
  assert.equal(replayed.length, 2)
  assert.equal(replayed[0].released, 1)
  assert.equal(replayed[1].released, 0)
  assert.equal(replayed[1].volume, 0.4)
  await act(async () => renderer.unmount())
  assert.equal(replayed[1].released, 1)
})
