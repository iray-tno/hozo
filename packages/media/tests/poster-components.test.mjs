import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import React, { act } from 'react'
import { create } from 'react-test-renderer'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const require = createRequire(import.meta.url)

async function fixture(native) {
  const players = []
  function engine(src) {
    const dom = new EventTarget()
    const listeners = new Map()
    const frames = []
    const player = {
      src,
      readyState: 0,
      status: 'idle',
      duration: 4,
      currentTime: 0,
      playing: false,
      loop: false,
      muted: false,
      volume: 1,
      loads: [],
      released: 0,
      denyPlay: false,
      addEventListener: dom.addEventListener.bind(dom),
      removeEventListener: dom.removeEventListener.bind(dom),
      getAttribute() {
        return this.src
      },
      removeAttribute() {
        this.src = null
      },
      load() {},
      requestVideoFrameCallback(fn) {
        frames.push(fn)
        return frames.length
      },
      cancelVideoFrameCallback() {},
      addListener(name, fn) {
        const callbacks = listeners.get(name) ?? new Set()
        callbacks.add(fn)
        listeners.set(name, callbacks)
        return { remove: () => callbacks.delete(fn) }
      },
      emit(name, payload) {
        dom.dispatchEvent(new Event(name))
        for (const fn of listeners.get(name) ?? []) fn(payload)
      },
      ready() {
        this.status = 'readyToPlay'
        this.readyState = 4
        this.emit(native ? 'statusChange' : 'loadedmetadata', { status: 'readyToPlay' })
      },
      play() {
        if (this.denyPlay) {
          if (native) throw new Error('Playback denied')
          return Promise.reject(new Error('Playback denied'))
        }
        this.playing = true
        this.emit(native ? 'playingChange' : 'play', { isPlaying: true })
        return Promise.resolve()
      },
      pause() {
        this.playing = false
        this.emit(native ? 'playingChange' : 'pause', { isPlaying: false })
      },
      replaceAsync(uri) {
        this.loads.push(uri)
        return Promise.resolve()
      },
      release() {
        this.released++
      },
      frame() {
        frames.at(-1)?.()
      },
    }
    players.push(player)
    return player
  }
  const result = await build({
    entryPoints: [
      fileURLToPath(new URL(`../src/index${native ? '.native' : ''}.ts`, import.meta.url)),
    ],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    packages: 'external',
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(
    (name) => {
      if (name === 'react-native')
        return { View: 'RNView', Image: 'RNImage', Text: 'RNText', Pressable: 'RNPressable' }
      if (name === 'expo-video')
        return { VideoView: 'ExpoVideoView', createVideoPlayer: () => engine(null) }
      return require(name)
    },
    module,
    module.exports,
  )
  const ref = React.createRef()
  let renderer
  const imageType = native ? 'RNImage' : 'img'
  const hostType = native ? 'ExpoVideoView' : 'video'
  const props = { src: 'clip.mp4', poster: 'a.png', accessibilityLabel: 'Clip', ref }
  const update = async (changes = {}) => {
    Object.assign(props, changes)
    await act(async () => {
      const element = React.createElement(module.exports.Video, props)
      if (renderer) renderer.update(element)
      else
        renderer = create(element, {
          createNodeMock: (node) => (node.type === 'video' ? engine(node.props.src) : null),
        })
    })
    if (native)
      await act(async () =>
        host().props.onLayout({ nativeEvent: { layout: { width: 320, height: 180 } } }),
      )
  }
  const host = () => renderer.root.findByType(hostType)
  const images = () => renderer.root.findAllByType(imageType)
  const frame = () => (native ? host().props.onFirstFrameRender() : players.at(-1).frame())
  const imageError = (image, message) =>
    native ? image.props.onError({ nativeEvent: { error: message } }) : image.props.onError()
  return {
    update,
    ref,
    host,
    images,
    players,
    frame,
    imageError,
    unmount: () => act(async () => renderer.unmount()),
  }
}

for (const native of [false, true]) {
  const name = native ? 'Native' : 'Web'
  test(`${name} poster: readiness/denials cannot reveal it, first frame plus play can, URI/options changes retain host/handle`, async () => {
    const f = await fixture(native)
    await f.update()
    const a = f.players[0]
    const handle = f.ref.current
    const host = f.host()
    assert.equal(host.props[native ? 'nativeControls' : 'controls'], false)
    const image = f.images()[0]
    if (native) {
      assert.equal(image.props.accessible, false)
      assert.equal(image.props.importantForAccessibility, 'no-hide-descendants')
      assert.equal(image.props.pointerEvents, 'none')
    } else {
      assert.equal(image.props.alt, '')
      assert.equal(image.props['aria-hidden'], 'true')
    }
    await act(async () => a.ready())
    await act(async () => f.frame())
    assert.equal(f.images().length, 1, 'an initial paused frame leaves the cover visible')
    a.denyPlay = true
    await act(async () => assert.rejects(f.ref.current.play(), /Playback denied/))
    assert.equal(f.images().length, 1)
    await act(async () => assert.throws(() => f.ref.current.seekTo(Number.NaN), RangeError))
    assert.equal(f.images().length, 1)
    a.denyPlay = false
    await act(async () => f.ref.current.play())
    assert.equal(f.images().length, 0)
    await act(async () => f.ref.current.pause())
    await f.update({ poster: 'b.png', fit: 'cover', muted: true })
    assert.equal(f.images().length, 0, 'new artwork cannot cover an already viewed source')
    await f.update({ poster: undefined })
    assert.equal(f.host(), host, 'changing wrapper policy cannot remount the engine host')
    assert.equal(f.host().props[native ? 'nativeControls' : 'controls'], true)
    await f.update({ poster: 'c.png' })
    assert.equal(f.images().length, 0)
    assert.equal(f.ref.current, handle)
    assert.equal(f.players.length, 1)
    assert.equal(a.currentTime, 0)
    const oldFrame = native ? host.props.onFirstFrameRender : () => a.frame()
    const oldLayout = native ? host.props.onLayout : () => {}
    await f.update({ src: 'replacement.mp4' })
    const b = f.players.at(-1)
    await act(async () => {
      oldFrame()
      oldLayout({ nativeEvent: { layout: { width: 0, height: 0 } } })
    })
    assert.equal(f.images().length, 1)
    await act(async () => b.ready())
    await act(async () => f.ref.current.seekTo(0))
    assert.equal(f.images().length, 1, 'an accepted seek needs the new decoder frame too')
    await act(async () => f.frame())
    assert.equal(
      f.images().length,
      0,
      'seek-to-zero is an explicit viewing request, not a clock heuristic',
    )
    await assert.rejects(handle.play(), /not mounted/)
    await f.unmount()
  })

  test(`${name} poster image failures are separate, once-only, keyed by artwork lifetime and never reload the decoder`, async () => {
    const f = await fixture(native)
    const failures = []
    await f.update({ onPosterError: (error) => failures.push(error), controls: false })
    await act(async () => f.players[0].ready())
    const a = { props: f.images()[0].props }
    await act(async () => {
      f.imageError(a, 'Image failed')
      f.imageError(a, 'Duplicate')
    })
    assert.equal(f.images().length, 0)
    assert.equal(failures.length, 1)
    assert.equal(failures[0].poster, 'a.png')
    assert.equal(failures[0].src, 'clip.mp4')
    assert.equal(f.ref.current.getStatus().status, 'ready')
    assert.equal(f.ref.current.getStatus().error, null)
    const handle = f.ref.current
    await f.update({ poster: 'b.png', fit: 'fill' })
    const b = { props: f.images()[0].props }
    if (native) assert.equal(b.props.resizeMode, 'stretch')
    else assert.equal(b.props.style.objectFit, 'fill')
    await f.update({ poster: 'a.png' })
    await act(async () => {
      f.imageError(a, 'Old A')
      f.imageError(b, 'Old B')
    })
    assert.equal(failures.length, 1)
    assert.equal(f.images().length, 1, 'returning to the URI creates a new image owner')
    assert.equal(f.players.length, 1)
    assert.equal(f.ref.current, handle)
    const retired = { props: f.images()[0].props }
    await f.unmount()
    f.imageError(retired, 'Unmounted')
    assert.equal(failures.length, 1)
  })
}
