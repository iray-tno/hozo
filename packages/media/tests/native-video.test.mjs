import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import React, { act } from 'react'
import { create } from 'react-test-renderer'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('../', import.meta.url))

test('Native host wires the real session, keeps callback updates, isolates sources and releases committed resources', async () => {
  const players = []
  const view = { committedPlayer: null, layoutOnMount: false }
  function makePlayer() {
    const listeners = new Map()
    const player = {
      status: 'idle',
      duration: 0,
      currentTime: 0,
      playing: false,
      loop: false,
      muted: false,
      timeUpdateEventInterval: 0,
      loads: [],
      released: 0,
      pauses: 0,
      release() {
        this.released++
      },
      replaceAsync(src) {
        assert.equal(
          view.committedPlayer,
          this,
          'source loading follows the commit attaching its player',
        )
        this.loads.push(src)
        return Promise.resolve()
      },
      play() {
        this.playing = true
        this.emit('playingChange', { isPlaying: true })
      },
      pause() {
        this.pauses++
        this.playing = false
        this.emit('playingChange', { isPlaying: false })
      },
      addListener(name, callback) {
        const set = listeners.get(name) ?? new Set()
        set.add(callback)
        listeners.set(name, set)
        return { remove: () => set.delete(callback) }
      },
      emit(name, payload) {
        for (const fn of listeners.get(name) ?? []) fn(payload)
      },
      listenerCount() {
        return [...listeners.values()].reduce((count, set) => count + set.size, 0)
      },
    }
    players.push(player)
    return player
  }
  const expo = {
    VideoView(props) {
      const fixture = React.useRef(view).current
      React.useLayoutEffect(() => {
        fixture.committedPlayer = props.player
        return () => {
          if (fixture.committedPlayer === props.player) fixture.committedPlayer = null
        }
      }, [props.player, fixture])
      React.useLayoutEffect(() => {
        if (fixture.layoutOnMount)
          props.onLayout({ nativeEvent: { layout: { width: 320, height: 180 } } })
      }, [props.onLayout, fixture])
      return React.createElement('ExpoVideoView', props)
    },
    createVideoPlayer(source) {
      assert.equal(source, null, 'source loading uses replaceAsync, not the native constructor')
      return makePlayer()
    },
  }
  const result = await build({
    entryPoints: [path.join(root, 'src/index.native.ts')],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(
    (name) =>
      name === 'expo-video'
        ? expo
        : name === 'react-native'
          ? { View: 'RNView', Text: 'RNText', Pressable: 'RNPressable' }
          : require(name),
    module,
    module.exports,
  )
  const { Video } = module.exports
  const ref = React.createRef()
  const events = []
  let renderer
  const layout = (host, width = 320, height = 180) =>
    host.props.onLayout({ nativeEvent: { layout: { width, height } } })
  const render = (src, onPlay, options = {}) =>
    React.createElement(Video, {
      src,
      ref,
      accessibilityLabel: 'Clip',
      onPlay,
      ...options,
    })
  await act(async () => {
    renderer = create(render('a.mp4', () => events.push('old')))
  })
  const a = players[0]
  const host = renderer.root.findByType('ExpoVideoView')
  assert.equal(host.props.player, a)
  assert.deepEqual(a.loads, [], 'a committed player does not load before the host has a size')
  await act(async () => {
    layout(host, 0, 180)
    layout(host, 320, 0)
  })
  assert.deepEqual(a.loads, [], 'zero-area layouts cannot present an initial frame')
  await act(async () => layout(host))
  assert.deepEqual(a.loads, ['a.mp4'])
  assert.equal(a.playing, false, 'presenting the initial frame must not require autoplay')
  assert.equal(a.currentTime, 0)
  await act(async () => layout(host, 640, 360))
  assert.deepEqual(a.loads, ['a.mp4'], 'resizing the host must not reload its source')
  assert.equal(host.props.nativeControls, true)
  assert.equal(host.props.accessibilityLabel, 'Clip')
  await act(async () => {
    renderer.update(
      render('a.mp4', () => events.push('new'), {
        muted: true,
        loop: true,
        controls: false,
        fit: 'cover',
      }),
    )
  })
  assert.equal(players.length, 1, 'callback/config changes do not reload the movie')
  assert.equal(a.muted, true)
  assert.equal(a.loop, true)
  assert.equal(renderer.root.findByType('ExpoVideoView').props.nativeControls, false)
  assert.equal(renderer.root.findByType('ExpoVideoView').props.contentFit, 'cover')
  await act(async () => {
    a.status = 'readyToPlay'
    a.duration = 4
    a.emit('statusChange', { status: 'readyToPlay' })
    await ref.current.play()
  })
  assert.deepEqual(events, ['new'])
  ref.current.seekTo(2)
  assert.equal(a.currentTime, 2)
  const retiredHandle = ref.current
  await act(async () => {
    renderer.update(render('b.mp4', () => events.push('b')))
  })
  assert.equal(a.released, 1)
  assert.equal(a.listenerCount(), 0)
  assert.equal(players.length, 2)
  assert.deepEqual(players[1].loads, [], 'a replacement source needs its own host layout')
  await act(async () => layout(renderer.root.findByType('ExpoVideoView')))
  assert.deepEqual(players[1].loads, ['b.mp4'])
  assert.equal(ref.current.getStatus().src, 'b.mp4')
  assert.equal(ref.current.getStatus().status, 'loading')
  a.emit('playToEnd')
  assert.equal(ref.current.getStatus().status, 'loading')
  await assert.rejects(async () => retiredHandle.play(), /not mounted/)
  await act(async () => {
    renderer.unmount()
  })
  assert.equal(players[1].released, 1)
  assert.equal(players[1].listenerCount(), 0)
  assert.equal(ref.current, null)

  const start = players.length
  await act(async () => {
    renderer = create(
      React.createElement(
        React.StrictMode,
        null,
        render('strict.mp4', () => {}),
      ),
    )
  })
  const replayed = players.slice(start)
  assert.equal(replayed.length, 2, 'StrictMode creates only committed/replayed players')
  assert.equal(replayed[0].released, 1)
  assert.equal(replayed[0].listenerCount(), 0)
  assert.deepEqual(replayed[0].loads, [], 'a retired pre-layout player never prepares a decoder')
  assert.equal(replayed[1].released, 0)
  assert.equal(ref.current.getStatus().src, 'strict.mp4')
  assert.equal(renderer.root.findByType('ExpoVideoView').props.player, replayed[1])
  assert.deepEqual(replayed[1].loads, [])
  await act(async () => layout(renderer.root.findByType('ExpoVideoView')))
  assert.deepEqual(replayed[1].loads, ['strict.mp4'])
  await act(async () => {
    renderer.unmount()
  })
  assert.equal(replayed[1].released, 1)
  assert.equal(replayed[1].listenerCount(), 0)

  await act(async () => {
    renderer = create(render('never-visible.mp4', () => {}))
  })
  const hidden = players.at(-1)
  await act(async () => renderer.unmount())
  assert.deepEqual(hidden.loads, [], 'unmounting before layout must not load the source')
  assert.equal(hidden.released, 1)
  assert.equal(hidden.listenerCount(), 0)

  view.layoutOnMount = true
  await act(async () => {
    renderer = create(render('early-layout.mp4', () => {}))
  })
  const early = players.at(-1)
  assert.deepEqual(early.loads, ['early-layout.mp4'], 'layout may arrive before the player commit')
  await act(async () => renderer.unmount())
  assert.equal(early.released, 1)
  assert.equal(early.listenerCount(), 0)
})
