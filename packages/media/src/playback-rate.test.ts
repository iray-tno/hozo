import assert from 'node:assert/strict'
import test from 'node:test'
import type { AudioPlayer } from 'expo-audio'
import type { VideoPlayer } from 'expo-video'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Audio } from './audio.tsx'
import { DomMediaSession } from './dom-session.ts'
import { NativeAudioSession } from './native-audio-session.ts'
import { NativeVideoSession } from './native-session.ts'
import { mediaPlaybackOptions } from './playback-rate.ts'
import { Video } from './video.tsx'

function engine(kind: string) {
  const listeners = new Map<string, (event: never) => void>()
  const queued: (() => void)[] = []
  const calls: string[] = []
  let rate = 1
  let pitch = true
  let itemPitch = true
  let loop = false
  let loopPitch: boolean | null = null
  let rejects = false
  const player = {
    src: 'a',
    readyState: 1,
    status: 'readyToPlay',
    duration: 4,
    currentTime: 0,
    get loop() {
      return loop
    },
    set loop(value: boolean) {
      loop = value
      loopPitch = value ? itemPitch : null
    },
    muted: false,
    volume: 1,
    playing: false,
    get preservesPitch() {
      return pitch
    },
    set preservesPitch(value: boolean) {
      pitch = value
    },
    shouldCorrectPitch: true,
    get playbackRate() {
      return rate
    },
    set playbackRate(value: number) {
      if (rejects) throw new Error('Rate denied')
      rate = value
      pitch = this.preservesPitch
      // Expo iOS Video's setter starts AVPlayer even without a play command.
      if (kind === 'Video') this.playing = true
    },
    setPlaybackRate(value: number, quality: string) {
      if (rejects) throw new Error('Rate denied')
      assert.equal(quality, 'high')
      const apply = () => {
        rate = value
        pitch = this.shouldCorrectPitch
        itemPitch = pitch
      }
      if (kind === 'Android Audio') queued.push(apply)
      else apply()
    },
    play() {
      calls.push('play')
      this.playing = true
      return Promise.resolve()
    },
    pause() {
      calls.push('pause')
      this.playing = false
    },
    replace() {
      calls.push('load')
      itemPitch = true
      loopPitch = loop ? itemPitch : null
    },
    replaceAsync() {
      calls.push('load')
      return Promise.resolve()
    },
    load() {
      calls.push('load')
    },
    getAttribute() {
      return this.src
    },
    removeAttribute() {
      this.src = ''
    },
    addEventListener(name: string, fn: () => void) {
      listeners.set(name, fn)
    },
    removeEventListener(name: string) {
      listeners.delete(name)
    },
    addListener(name: string, fn: (event: never) => void) {
      listeners.set(name, fn)
      return { remove: () => listeners.delete(name) }
    },
  }
  return {
    player,
    calls,
    pitch: () => pitch,
    itemPitch: () => itemPitch,
    loopPitch: () => loopPitch,
    reject: (value: boolean) => {
      rejects = value
    },
    emit: (name: string, event: unknown = {}) => listeners.get(name)?.(event as never),
    flush: () => {
      while (queued.length) queued.shift()?.()
    },
  }
}

test('rate/pitch defaults and validation reject coercion before allocating either Web host', () => {
  assert.deepEqual(mediaPlaybackOptions({}), { playbackRate: 1, preservesPitch: true })
  for (const playbackRate of [0, -1, 0.1, 2.1, NaN, Infinity, null, '1']) {
    for (const Component of [Video, Audio]) {
      assert.throws(
        () =>
          renderToStaticMarkup(
            createElement(Component, {
              src: 'a',
              accessibilityLabel: 'Media',
              playbackRate: playbackRate as number,
            }),
          ),
        /playbackRate/,
      )
    }
  }
  for (const preservesPitch of [null, 0, 'false']) {
    assert.throws(
      () => mediaPlaybackOptions({ preservesPitch: preservesPitch as unknown as boolean }),
      /preservesPitch/,
    )
  }
  for (const playbackRate of [0.25, 0.5, 1, 1.3, 2]) {
    assert.equal(mediaPlaybackOptions({ playbackRate }).playbackRate, playbackRate)
  }
})

for (const kind of ['DOM', 'Video', 'iOS Audio', 'Android Audio']) {
  test(`${kind}: paused/live rate and pitch updates, defaults, invalid atomicity and retired ownership`, async () => {
    const e = engine(kind)
    const session =
      kind === 'DOM'
        ? new DomMediaSession(e.player as unknown as HTMLMediaElement, 'a', () => ({}))
        : kind === 'Video'
          ? new NativeVideoSession(e.player as unknown as VideoPlayer, 'a', () => ({}))
          : new NativeAudioSession(e.player as unknown as AudioPlayer, 'a', () => ({}))
    session.start({ playbackRate: 2, preservesPitch: false })
    e.flush()
    assert.equal(e.player.playing, false, 'configuration alone must never start a paused engine')
    if (kind.endsWith('Audio')) {
      e.emit('playbackStatusUpdate', {
        isLoaded: true,
        playing: false,
        currentTime: 0,
        duration: 4,
        isBuffering: false,
        playbackState: 'readyToPlay',
      })
      e.flush()
      assert.equal(
        e.itemPitch(),
        false,
        'pitch must target the new iOS item, not the nil/retired item',
      )
    }
    const loads = e.calls.filter((c) => c === 'load').length
    await session.play()
    e.flush()
    assert.equal(e.player.playbackRate, 2)
    assert.equal(e.pitch(), false)
    session.setOptions({ playbackRate: 0.5, preservesPitch: true })
    e.flush()
    assert.equal(e.player.playbackRate, 0.5)
    assert.equal(e.pitch(), true, 'set pitch before applying speed, including Android queued tasks')
    session.setOptions({ playbackRate: 0.5, preservesPitch: false })
    e.flush()
    assert.equal(e.pitch(), false, 'pitch-only change must reach the engine even at the same speed')
    session.setOptions({})
    e.flush()
    assert.equal(e.player.playbackRate, 1)
    assert.equal(e.pitch(), true)
    assert.equal(e.calls.filter((c) => c === 'load').length, loads)
    assert.equal(e.player.currentTime, 0, 'speed/pitch must not seek')
    assert.equal(
      e.calls.filter((c) => c === 'play').length,
      1,
      'no extra play request during live changes',
    )
    assert.equal(e.calls.filter((c) => c === 'pause').length, 0)
    assert.throws(() => session.setOptions({ playbackRate: 9, muted: true, volume: 0 }), RangeError)
    assert.equal(e.player.muted, false)
    assert.equal(e.player.volume, 1)
    session.dispose()
    session.setOptions({ playbackRate: 2, preservesPitch: false })
    e.emit('playingChange', { isPlaying: true })
    e.flush()
    assert.equal(e.player.playbackRate, 1)
    assert.equal(e.pitch(), true)
  })
}

for (const kind of ['DOM', 'Video', 'iOS Audio', 'Android Audio']) {
  test(`${kind}: rejected rate is source-bound, survives readiness, blocks autoplay and recovers`, async () => {
    const e = engine(kind)
    e.reject(true)
    const errors: string[] = []
    const callbacks = () => ({
      onError: (error: { operation: string }) => errors.push(error.operation),
    })
    const session =
      kind === 'DOM'
        ? new DomMediaSession(e.player as unknown as HTMLMediaElement, 'a', callbacks)
        : kind === 'Video'
          ? new NativeVideoSession(e.player as unknown as VideoPlayer, 'a', callbacks)
          : new NativeAudioSession(e.player as unknown as AudioPlayer, 'a', callbacks)
    session.start({ playbackRate: 2, autoPlay: true })
    e.emit('loadedmetadata')
    e.emit('statusChange', { status: 'readyToPlay' })
    e.emit('playbackStatusUpdate', { isLoaded: true, duration: 4, currentTime: 0, playing: false })
    await Promise.resolve()
    assert.equal(session.getStatus().error?.operation, 'rate')
    assert.equal(session.getStatus().error?.src, 'a')
    assert.equal(e.calls.includes('play'), false)
    assert.ok(errors.length > 0)
    e.emit('canplay')
    assert.equal(session.getStatus().error?.operation, 'rate')
    e.reject(false)
    session.setOptions({ playbackRate: 1.5 })
    await session.play()
    e.flush()
    assert.equal(session.getStatus().error, null)
    assert.equal(e.player.playbackRate, 1.5)
    session.dispose()
  })
}

test('DOM detects ignored rate and pitch setters, including accepted rate but denied pitch', () => {
  for (const property of ['playbackRate', 'preservesPitch'] as const) {
    const e = engine('DOM')
    Object.defineProperty(e.player, property, {
      get: () => (property === 'playbackRate' ? 1 : true),
      set() {},
    })
    const session = new DomMediaSession(e.player as unknown as HTMLMediaElement, 'a', () => ({}))
    session.start({ playbackRate: 2, preservesPitch: false })
    assert.equal(session.getStatus().error?.operation, 'rate')
    session.dispose()
  }
})

test('Native Video platform activation applies a pending paused request without fake playback observations', () => {
  const e = engine('Video')
  const session = new NativeVideoSession(e.player as unknown as VideoPlayer, 'a', () => ({}))
  session.start({ playbackRate: 0.5, preservesPitch: false })
  assert.equal(e.player.playbackRate, 1)
  assert.equal(session.getStatus().playing, false)
  e.player.playing = true
  e.emit('playingChange', { isPlaying: true })
  assert.equal(e.player.playbackRate, 0.5)
  assert.equal(e.pitch(), false)
  assert.equal(session.getStatus().playing, true)
  session.dispose()
})

test('Native Video stops a setter-induced start if the following pitch readback is rejected', async () => {
  const e = engine('Video')
  Object.defineProperty(e.player, 'preservesPitch', { get: () => true, set() {} })
  const session = new NativeVideoSession(e.player as unknown as VideoPlayer, 'a', () => ({}))
  session.start({ playbackRate: 2, preservesPitch: false })
  await assert.rejects(session.play(), /ignored/)
  assert.equal(
    e.player.playing,
    false,
    'the rate setter is not permission to leave a failed request playing',
  )
  assert.equal(e.calls.includes('play'), false)
  assert.equal(session.getStatus().error?.operation, 'rate')
  session.dispose()
})

test('iOS Audio loop copies keep the new item and live pitch-only policy', () => {
  const e = engine('iOS Audio')
  const session = new NativeAudioSession(e.player as unknown as AudioPlayer, 'a', () => ({}))
  session.start({ loop: true, playbackRate: 0.5, preservesPitch: false })
  assert.equal(e.loopPitch(), true, 'replace created a new item with its default algorithm')
  e.emit('playbackStatusUpdate', { isLoaded: true, playing: false, currentTime: 0, duration: 4 })
  assert.equal(e.itemPitch(), false)
  assert.equal(e.loopPitch(), false, 'the old queued algorithm must be replaced too')
  session.setOptions({ loop: true, playbackRate: 0.5, preservesPitch: true })
  assert.equal(e.itemPitch(), true)
  assert.equal(e.loopPitch(), true)
  assert.equal(e.player.loop, true)
  assert.equal(e.calls.includes('play'), false)
  session.dispose()
})

for (const kind of ['Video', 'iOS Audio']) {
  test(`${kind}: a recovery callback can retire the source before a pending play touches the player`, async () => {
    const e = engine(kind)
    e.reject(true)
    let retireOnRecovery = false
    const callbacks = () => ({
      onStatusChange: (status: { error: unknown }) => {
        if (retireOnRecovery && status.error === null) session.dispose()
      },
    })
    const session =
      kind === 'Video'
        ? new NativeVideoSession(e.player as unknown as VideoPlayer, 'a', callbacks)
        : new NativeAudioSession(e.player as unknown as AudioPlayer, 'a', callbacks)
    session.start({ playbackRate: 2 })
    await assert.rejects(session.play(), /Rate denied/)
    e.reject(false)
    retireOnRecovery = true
    await assert.rejects(session.play(), /no longer active/)
    assert.equal(e.calls.includes('play'), false, 'no play command against a retired resource')
  })
}
