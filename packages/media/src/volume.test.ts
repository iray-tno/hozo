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
import { Video } from './video.tsx'
import { mediaVolume } from './volume.ts'

// Expo Audio 57 Android queues setVolume on main and restores previousVolume
// on unmute. In particular, zero set while muted does not update its cache.
// Model that coupling, not two independent JS fields which cannot catch it.
function engine(androidAudio = false) {
  const queued: (() => void)[] = []
  const listeners = new Map<string, () => void>()
  let muted = false
  let gain = 1
  let previousVolume = 1
  const calls: string[] = []
  const setVolume = (value: number) => {
    if (muted) {
      if (value > 0) previousVolume = value
      gain = 0
    } else {
      previousVolume = value
      gain = value
    }
  }
  const player = {
    src: 'a.mp4',
    readyState: 1,
    status: 'readyToPlay',
    playing: false,
    currentTime: 2,
    duration: 4,
    loop: false,
    error: null,
    playbackRate: 1,
    preservesPitch: true,
    shouldCorrectPitch: true,
    setPlaybackRate(rate: number) {
      this.playbackRate = rate
    },
    get muted() {
      return muted
    },
    set muted(value: boolean) {
      muted = value
      if (androidAudio) {
        const restored = value ? 0 : previousVolume
        queued.push(() => setVolume(restored))
      }
    },
    get volume() {
      return gain
    },
    set volume(value: number) {
      if (androidAudio) queued.push(() => setVolume(value))
      else gain = value
    },
    getAttribute() {
      return this.src
    },
    removeAttribute() {
      this.src = ''
    },
    addEventListener(name: string, listener: () => void) {
      listeners.set(name, listener)
    },
    removeEventListener(name: string) {
      listeners.delete(name)
    },
    addListener() {
      return { remove() {} }
    },
    play() {
      calls.push('play')
      return Promise.resolve()
    },
    pause() {
      calls.push('pause')
    },
    load() {
      calls.push('load')
    },
    replace() {
      calls.push('replace')
    },
    replaceAsync() {
      calls.push('replaceAsync')
      return Promise.resolve()
    },
  }
  return {
    player,
    calls,
    emit: (name: string) => listeners.get(name)?.(),
    flush: () => {
      while (queued.length) queued.shift()?.()
    },
    gain: () => (muted ? 0 : gain),
  }
}

test('volume validation rejects coercion, nonfinite and out-of-range input before component render', () => {
  assert.equal(mediaVolume(undefined), 1)
  for (const volume of [0, 0.25, 1]) assert.equal(mediaVolume(volume), volume)
  for (const volume of [-0.1, 1.01, Number.NaN, Infinity, -Infinity, null, '0.5', false]) {
    assert.throws(() => mediaVolume(volume as number), RangeError)
    for (const Host of [Video, Audio]) {
      assert.throws(
        () =>
          renderToStaticMarkup(
            createElement(Host, {
              src: 'a.mp4',
              accessibilityLabel: 'Clip',
              volume: volume as number,
            }),
          ),
        /Media volume must be a finite number between 0 and 1/,
      )
    }
  }
})

test('DOM retains an already accepted default without requiring a writable gain property', () => {
  const e = engine()
  Object.defineProperty(e.player, 'volume', {
    get: () => 1,
    set: () => assert.fail('an already accepted gain needs no write'),
  })
  const session = new DomMediaSession(e.player as unknown as HTMLMediaElement, 'a.mp4', () => ({}))
  session.start({})
  session.setOptions({ volume: 1, muted: true })
  assert.equal(session.getStatus().error, null)
  assert.equal(e.player.muted, true)
  assert.deepEqual(e.calls, [])
  session.dispose()
})

for (const rejects of ['ignores', 'throws']) {
  test(`DOM ${rejects} gain: report the source-bound denial, retain it through readiness, suppress autoplay and recover explicitly`, async () => {
    const e = engine()
    Object.defineProperty(e.player, 'volume', {
      get: () => 1,
      set: (value: number) => {
        if (rejects === 'throws' && value !== 1) throw new Error('Volume unavailable')
      },
    })
    const errors: unknown[] = []
    const session = new DomMediaSession(e.player as unknown as HTMLMediaElement, 'a.mp4', () => ({
      onError: (error) => errors.push(error),
    }))
    session.start({ volume: 0.25, autoPlay: true })
    e.emit('loadedmetadata')
    e.emit('canplay')
    assert.equal(session.getStatus().status, 'ready', 'a gain denial is not a load failure')
    assert.equal(session.getStatus().error?.operation, 'volume')
    assert.equal(session.getStatus().error?.src, 'a.mp4')
    assert.equal(
      e.calls.includes('play'),
      false,
      'do not autoplay at a rejected, possibly louder gain',
    )
    assert.equal(e.player.muted, false, 'do not silently substitute mute for the requested gain')
    assert.equal(errors.length, 1)
    e.emit('play') // Explicit caller/platform activation does not hide the denial.
    assert.equal(session.getStatus().error?.operation, 'volume')
    session.setOptions({ autoPlay: true })
    await Promise.resolve()
    assert.equal(session.getStatus().error, null)
    assert.deepEqual(e.calls, ['play'])
    session.dispose()
    session.setOptions({ volume: 0.5 })
    assert.equal(errors.length, 1, 'retired options cannot report against a replacement source')
  })
}

for (const kind of ['DOM Audio/Video', 'Expo Video', 'Expo Audio iOS', 'Expo Audio Android']) {
  test(`${kind}: live gain, mute/zero restoration, defaults and retirement never reload or start playback`, () => {
    const e = engine(kind === 'Expo Audio Android')
    const session =
      kind === 'DOM Audio/Video'
        ? new DomMediaSession(e.player as unknown as HTMLMediaElement, 'a.mp4', () => ({}))
        : kind === 'Expo Video'
          ? new NativeVideoSession(e.player as unknown as VideoPlayer, 'a.mp4', () => ({}))
          : new NativeAudioSession(e.player as unknown as AudioPlayer, 'a.mp4', () => ({}))
    session.start({ volume: 0.25, muted: true })
    e.flush()
    assert.equal(e.gain(), 0)
    const initialCalls = [...e.calls]
    const apply = (volume: number | undefined, muted = false) => {
      session.setOptions({ volume, muted })
      e.flush()
      assert.equal(e.player.muted, muted)
      assert.equal(e.gain(), muted ? 0 : (volume ?? 1))
      assert.equal(e.player.currentTime, 2)
      assert.deepEqual(e.calls, initialCalls, 'no reload, play, pause or seek on gain changes')
    }
    apply(0.25)
    apply(0.7, true)
    apply(0.7)
    apply(0, true)
    apply(0, false) // Expo's restore cache alone would incorrectly restore 0.7.
    apply(1, true)
    apply(1)
    apply(0)
    apply(undefined)
    for (const volume of [-1, 2, Number.NaN, Infinity]) {
      assert.throws(() => session.setOptions({ volume, muted: true, loop: true }), RangeError)
      e.flush()
      assert.equal(e.gain(), 1)
      assert.equal(e.player.muted, false, 'invalid volume must not partially apply mute/loop')
      assert.equal(e.player.loop, false)
    }
    session.dispose()
    const retiredCalls = [...e.calls]
    session.setOptions({ volume: 0, muted: true })
    e.flush()
    assert.equal(e.gain(), 1, 'retired owners cannot change the old engine')
    assert.deepEqual(e.calls, retiredCalls)
  })
}
